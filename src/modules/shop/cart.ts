import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { NotFoundError, UserError } from "@/lib/errors";
import { z, zId, zQuantity } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { loadActiveDiscounts, priceLine, quantityRuleError, sumLines, type LinePrice } from "@/modules/pricing/engine";
import { shopContext, visibleOfferWhere, type ShopContext } from "./context";
import { stockState } from "./catalog";

/**
 * Sepet: tedarikçiye göre gruplanır. Fiyatlar her görüntülemede fiyat motoruyla yeniden hesaplanır;
 * sepete eklendiği andaki fiyat (seenPackPrice) değişmişse üye uyarılır ve sipariş öncesi onay istenir.
 * Aynı değerlendirme sipariş motorunda transaction içinde tekrar çalıştırılır.
 */

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
type Tx = PrismaClient | Prisma.TransactionClient;

export const addToCartSchema = z.object({ supplierProductId: zId, quantity: zQuantity });
export const setQuantitySchema = z.object({ quantity: zQuantity });

const lineOfferInclude = {
  product: { include: { brand: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" as const }, take: 1 } } },
  supplier: { select: { id: true, tradeName: true, slug: true, minOrderAmount: true } },
  stock: true,
} satisfies Prisma.SupplierProductInclude;

type LineOffer = Prisma.SupplierProductGetPayload<{ include: typeof lineOfferInclude }>;

export interface CartLine {
  itemId: string;
  supplierProductId: string;
  offer: LineOffer;
  quantity: Dec;
  seenPackPrice: Dec;
  price: LinePrice;
  available: boolean;
  priceChanged: boolean;
  quantityError: string | null;
  stockError: string | null;
  /** Siparişi engelleyen sorun var mı (fiyat değişimi hariç; o onayla çözülür) */
  blocking: boolean;
}

export interface CartGroup {
  supplier: LineOffer["supplier"];
  lines: CartLine[];
  totals: ReturnType<typeof sumLines>;
  /** KDV hariç, indirimler düşülmüş tutar — asgari tutar bununla karşılaştırılır */
  netAmount: Dec;
  minAmount: Dec;
  meetsMin: boolean;
  deliveryDays: number[];
  hasBlocking: boolean;
  hasPriceChange: boolean;
  /** Bu grup şu an sipariş edilebilir mi */
  orderable: boolean;
}

/** Sepet satırlarını değerlendirir (görünürlük, fiyat, miktar, stok, asgari tutar) */
export async function evaluateCart(
  tx: Tx,
  ctx: Pick<ShopContext, "chamberId" | "districtId">,
  items: { id: string; supplierProductId: string; quantity: Dec; seenPackPrice: Dec }[],
) {
  const ids = items.map((i) => i.supplierProductId);
  const [offers, visible, discounts, areas] = await Promise.all([
    tx.supplierProduct.findMany({ where: { id: { in: ids } }, include: lineOfferInclude }),
    tx.supplierProduct.findMany({ where: { id: { in: ids }, ...visibleOfferWhere(ctx) }, select: { id: true } }),
    loadActiveDiscounts(ids, ctx.chamberId, tx),
    tx.deliveryArea.findMany({ where: { districtId: ctx.districtId ?? "__yok__", supplier: { products: { some: { id: { in: ids } } } } } }),
  ]);
  const offerBy = new Map(offers.map((o) => [o.id, o]));
  const visibleIds = new Set(visible.map((v) => v.id));
  const areaBy = new Map(areas.map((a) => [a.supplierId, a]));

  const groups = new Map<string, CartGroup>();
  for (const it of items) {
    const offer = offerBy.get(it.supplierProductId);
    if (!offer) continue;
    const price = priceLine({ packPrice: offer.packPrice, vatRate: offer.vatRate, discounts: discounts.get(offer.id) ?? [] }, it.quantity);
    const available = visibleIds.has(offer.id);
    const quantityError = quantityRuleError(offer, it.quantity);
    const stockQty = offer.stock?.quantity ?? new D(0);
    const stockError =
      stockState(stockQty) === "out" ? "Stokta yok." : it.quantity.gt(stockQty) ? `Stokta yalnızca ${stockQty.toString()} var.` : null;
    const line: CartLine = {
      itemId: it.id,
      supplierProductId: offer.id,
      offer,
      quantity: it.quantity,
      seenPackPrice: it.seenPackPrice,
      price,
      available,
      priceChanged: !price.finalPackPrice.eq(it.seenPackPrice),
      quantityError,
      stockError,
      blocking: !available || !!quantityError || !!stockError,
    };
    const g = groups.get(offer.supplierId) ?? {
      supplier: offer.supplier,
      lines: [],
      totals: sumLines([]),
      netAmount: new D(0),
      minAmount: new D(0),
      meetsMin: true,
      deliveryDays: [],
      hasBlocking: false,
      hasPriceChange: false,
      orderable: false,
    };
    g.lines.push(line);
    groups.set(offer.supplierId, g);
  }

  for (const g of groups.values()) {
    const area = areaBy.get(g.supplier.id);
    g.totals = sumLines(g.lines.map((l) => l.price));
    g.netAmount = g.totals.subtotal.minus(g.totals.discountTotal);
    g.minAmount = area?.minOrderAmount ?? g.supplier.minOrderAmount;
    g.meetsMin = g.netAmount.gte(g.minAmount);
    g.deliveryDays = area?.deliveryDays ?? [];
    g.hasBlocking = g.lines.some((l) => l.blocking);
    g.hasPriceChange = g.lines.some((l) => l.priceChanged);
    g.orderable = g.meetsMin && !g.hasBlocking;
  }
  const list = [...groups.values()].sort((a, b) => a.supplier.tradeName.localeCompare(b.supplier.tradeName, "tr"));
  const orderableGroups = list.filter((g) => g.orderable);
  return {
    groups: list,
    totals: sumLines(list.flatMap((g) => g.lines.map((l) => l.price))),
    orderableTotals: sumLines(orderableGroups.flatMap((g) => g.lines.map((l) => l.price))),
    orderableCount: orderableGroups.length,
    hasPriceChange: list.some((g) => g.hasPriceChange),
    itemCount: items.length,
  };
}
export type CartView = Awaited<ReturnType<typeof evaluateCart>>;

async function cartItems(memberId: string, tx: Tx = db) {
  return tx.cartItem.findMany({ where: { cart: { memberId } }, orderBy: { createdAt: "asc" } });
}

export async function getCart(auth: AuthContext) {
  assertPermission(auth, "memberSelf.cart");
  const ctx = await shopContext(auth);
  const view = await evaluateCart(db, ctx, await cartItems(ctx.memberId));
  return { ctx, ...view };
}

export async function cartCount(auth: AuthContext) {
  if (!auth.member) return 0;
  return db.cartItem.count({ where: { cart: { memberId: auth.member.id } } });
}

async function ensureCart(memberId: string, tx: Tx = db) {
  return tx.cart.upsert({ where: { memberId }, update: {}, create: { memberId }, select: { id: true } });
}

/** Görünür teklifi ve o miktardaki güncel fiyatı doğrular */
async function checkOffer(ctx: ShopContext, supplierProductId: string, quantity: Dec, tx: Tx = db) {
  const offer = await tx.supplierProduct.findFirst({ where: { id: supplierProductId, ...visibleOfferWhere(ctx) }, include: { stock: true } });
  if (!offer) throw new UserError("Bu ürün bölgenizde satışta değil.");
  const qErr = quantityRuleError(offer, quantity);
  if (qErr) throw new UserError(qErr, "quantity");
  const stockQty = offer.stock?.quantity ?? new D(0);
  if (quantity.gt(stockQty)) throw new UserError(stockQty.lte(0) ? "Bu ürün stokta yok." : `Stokta yalnızca ${stockQty.toString()} var.`, "quantity");
  const discounts = await loadActiveDiscounts([offer.id], ctx.chamberId, tx);
  return priceLine({ packPrice: offer.packPrice, vatRate: offer.vatRate, discounts: discounts.get(offer.id) ?? [] }, quantity);
}

/** Sepete ekler; ürün zaten sepetteyse miktar üzerine eklenir */
export async function addToCart(auth: AuthContext, input: unknown) {
  assertPermission(auth, "memberSelf.cart");
  const ctx = await shopContext(auth);
  const d = addToCartSchema.parse(input);
  const cart = await ensureCart(ctx.memberId);
  const existing = await db.cartItem.findUnique({ where: { cartId_supplierProductId: { cartId: cart.id, supplierProductId: d.supplierProductId } } });
  const quantity = new D(d.quantity).plus(existing?.quantity ?? 0);
  const price = await checkOffer(ctx, d.supplierProductId, quantity);
  await db.cartItem.upsert({
    where: { cartId_supplierProductId: { cartId: cart.id, supplierProductId: d.supplierProductId } },
    update: { quantity, seenPackPrice: price.finalPackPrice },
    create: { cartId: cart.id, supplierProductId: d.supplierProductId, quantity, seenPackPrice: price.finalPackPrice },
  });
  await db.cart.update({ where: { id: cart.id }, data: {} });
  return { quantity, price };
}

async function findMyItem(ctx: ShopContext, itemId: string) {
  const item = await db.cartItem.findFirst({ where: { id: itemId, cart: { memberId: ctx.memberId } } });
  if (!item) throw new NotFoundError("Sepet satırı bulunamadı.");
  return item;
}

/** Miktarı değiştirir; 0 girilirse satır silinir */
export async function setCartQuantity(auth: AuthContext, itemId: string, input: unknown) {
  assertPermission(auth, "memberSelf.cart");
  const ctx = await shopContext(auth);
  const item = await findMyItem(ctx, itemId);
  const quantity = new D(setQuantitySchema.parse(input).quantity);
  if (quantity.isZero()) {
    await db.cartItem.delete({ where: { id: item.id } });
    return;
  }
  const price = await checkOffer(ctx, item.supplierProductId, quantity);
  await db.cartItem.update({ where: { id: item.id }, data: { quantity, seenPackPrice: price.finalPackPrice } });
}

export async function removeCartItem(auth: AuthContext, itemId: string) {
  assertPermission(auth, "memberSelf.cart");
  const ctx = await shopContext(auth);
  const item = await findMyItem(ctx, itemId);
  await db.cartItem.delete({ where: { id: item.id } });
}

export async function clearCart(auth: AuthContext, supplierId?: string) {
  assertPermission(auth, "memberSelf.cart");
  const ctx = await shopContext(auth);
  const r = await db.cartItem.deleteMany({
    where: { cart: { memberId: ctx.memberId }, ...(supplierId ? { supplierProduct: { supplierId } } : {}) },
  });
  return r.count;
}

/** Güncel fiyatları kabul eder (fiyat değişti uyarısını kapatır) */
export async function acceptCartPrices(auth: AuthContext) {
  assertPermission(auth, "memberSelf.cart");
  const ctx = await shopContext(auth);
  const view = await evaluateCart(db, ctx, await cartItems(ctx.memberId));
  const changed = view.groups.flatMap((g) => g.lines).filter((l) => l.priceChanged);
  await db.$transaction(changed.map((l) => db.cartItem.update({ where: { id: l.itemId }, data: { seenPackPrice: l.price.finalPackPrice } })));
  if (changed.length) await audit({ userId: auth.userId, action: "cart.acceptPrices", data: { lines: changed.length } });
  return changed.length;
}

export { cartItems };
