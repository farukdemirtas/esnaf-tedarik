import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/assert";
import { NotFoundError } from "@/lib/errors";
import { pageArgs } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { activeCampaignWhere, bestDiscount, loadActiveDiscounts, round2, tierTable, withVat, type DiscountTier } from "@/modules/pricing/engine";
import { shopContext, visibleOfferWhere, visibleSupplierWhere, type ShopContext } from "./context";

/**
 * Üye katalog görünümü: arama, filtreler, fiyat karşılaştırma, tedarikçi sayfası, ana sayfa vitrinleri.
 * Tüm sorgular visibleOfferWhere ile kısıtlanır; görünmeyen tedarikçinin teklifi hiçbir yerde dönmez.
 */

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

export const LOW_STOCK = 5;
/** Fiyata göre sıralamada değerlendirilecek en fazla ürün (pilot ölçeği için fazlasıyla yeterli) */
export const PRICE_SORT_CAP = 2000;

export type StockState = "in" | "low" | "out";
export function stockState(q: Dec | null | undefined): StockState {
  const n = q ?? new D(0);
  if (n.lte(0)) return "out";
  return n.lte(LOW_STOCK) ? "low" : "in";
}

const offerInclude = {
  supplier: { select: { id: true, tradeName: true, slug: true, minOrderAmount: true, logoPath: true } },
  stock: true,
} satisfies Prisma.SupplierProductInclude;

type OfferRow = Prisma.SupplierProductGetPayload<{ include: typeof offerInclude }>;

/** Teklifin asgari miktardaki en iyi fiyatı ve birim fiyatı */
function offerSummary(o: OfferRow, tiers: DiscountTier[]) {
  const input = { packPrice: o.packPrice, vatRate: o.vatRate, discounts: tiers };
  const atMin = bestDiscount(input, o.minOrderQty);
  // Kademeler içinde ulaşılabilecek en düşük fiyat (karşılaştırma/rozet için)
  const lowest = tiers.length ? bestDiscount(input, new D(9_999_999)) : atMin;
  const units = Math.max(1, o.unitsPerPack);
  return {
    offerId: o.id,
    supplier: { id: o.supplier.id, name: o.supplier.tradeName, slug: o.supplier.slug },
    packType: o.packType,
    unitsPerPack: o.unitsPerPack,
    sku: o.sku,
    vatRate: o.vatRate,
    minOrderQty: o.minOrderQty,
    orderStep: o.orderStep,
    listPackPrice: o.packPrice,
    listPackPriceVat: withVat(o.packPrice, o.vatRate),
    finalPackPrice: atMin.price,
    finalPackPriceVat: withVat(atMin.price, o.vatRate),
    campaignId: atMin.tier?.campaignId ?? null,
    campaignTitle: atMin.tier?.campaignTitle ?? null,
    lowestPackPrice: lowest.price,
    unitPrice: round2(atMin.price.div(units)),
    unitPriceVat: round2(withVat(atMin.price, o.vatRate).div(units)),
    hasCampaign: tiers.length > 0,
    tiers: tierTable(input),
    stockQty: o.stock?.quantity ?? new D(0),
    stock: stockState(o.stock?.quantity),
  };
}
export type OfferSummary = ReturnType<typeof offerSummary>;

const productInclude = (ctx: ShopContext) =>
  ({
    brand: { select: { id: true, name: true } },
    category: { select: { id: true, name: true, parentId: true } },
    images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
    offers: { where: visibleOfferWhere(ctx), include: offerInclude },
  }) satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

async function summarizeProducts(ctx: ShopContext, rows: ProductRow[]) {
  const discounts = await loadActiveDiscounts(rows.flatMap((p) => p.offers.map((o) => o.id)), ctx.chamberId);
  return rows.map((p) => {
    const offers = p.offers
      .map((o) => offerSummary(o, discounts.get(o.id) ?? []))
      .sort((a, b) => a.unitPrice.comparedTo(b.unitPrice));
    const best = offers.find((o) => o.stock !== "out") ?? offers[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      brand: p.brand,
      category: p.category,
      unitType: p.unitType,
      unitAmount: p.unitAmount,
      imagePath: p.images[0]?.path ?? null,
      offerCount: offers.length,
      hasCampaign: offers.some((o) => o.hasCampaign),
      inStock: offers.some((o) => o.stock !== "out"),
      best,
    };
  });
}
export type ProductSummary = Awaited<ReturnType<typeof summarizeProducts>>[number];

export interface CatalogFilter {
  q?: string;
  kategori?: string;
  marka?: string;
  tedarikci?: string;
  kampanya?: string;
  stokta?: string;
  sirala?: string;
  sayfa?: string;
  /** Yalnızca bu ürünler (favoriler gibi iç kullanım) */
  onlyIds?: string[];
}

async function categoryWithChildren(chamberId: string, id: string) {
  const all = await db.category.findMany({ where: { chamberId, active: true }, select: { id: true, parentId: true } });
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all)
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
  }
  return [...ids];
}

function offerFilter(ctx: ShopContext, f: CatalogFilter, now = new Date()): Prisma.SupplierProductWhereInput {
  return {
    ...visibleOfferWhere(ctx),
    ...(f.tedarikci ? { supplierId: f.tedarikci } : {}),
    ...(f.stokta === "1" ? { stock: { quantity: { gt: 0 } } } : {}),
    ...(f.kampanya === "1" ? { discounts: { some: { campaign: activeCampaignWhere(ctx.chamberId, now) } } } : {}),
  };
}

export async function listShopProducts(auth: AuthContext, f: CatalogFilter, pageSize = 24) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const { skip, take, page, size } = pageArgs(f.sayfa, pageSize);
  const q = f.q?.trim().slice(0, 100);
  const where: Prisma.ProductWhereInput = {
    chamberId: ctx.chamberId,
    status: "ACTIVE",
    offers: { some: offerFilter(ctx, f) },
    ...(f.kategori ? { categoryId: { in: await categoryWithChildren(ctx.chamberId, f.kategori) } } : {}),
    ...(f.marka ? { brandId: f.marka } : {}),
    ...(f.onlyIds ? { id: { in: f.onlyIds } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { brand: { name: { contains: q, mode: "insensitive" } } },
            ...(/^\d{6,14}$/.test(q) ? [{ barcode: q }] : []),
          ],
        }
      : {}),
  };
  // Fiyata göre sıralama: fiyat kampanya ve miktara bağlı hesaplandığından veritabanında değil, motorla hesaplanıp sıralanır
  if (f.sirala === "fiyat") {
    const all = await db.product.findMany({ where, orderBy: { name: "asc" }, take: PRICE_SORT_CAP, include: productInclude(ctx) });
    const sorted = (await summarizeProducts(ctx, all)).sort((a, b) => {
      if (!a.best || !b.best) return a.best ? -1 : b.best ? 1 : 0;
      return a.best.unitPrice.comparedTo(b.best.unitPrice);
    });
    return { ctx, items: sorted.slice(skip, skip + take), total: sorted.length, page, size };
  }
  const orderBy: Prisma.ProductOrderByWithRelationInput = f.sirala === "yeni" ? { createdAt: "desc" } : { name: "asc" };
  const [rows, total] = await Promise.all([
    db.product.findMany({ where, orderBy: [orderBy, { id: "asc" }], skip, take, include: productInclude(ctx) }),
    db.product.count({ where }),
  ]);
  return { ctx, items: await summarizeProducts(ctx, rows), total, page, size };
}

/** Filtre seçenekleri: yalnızca üyenin görebildiği ürünlerin kategori/marka/tedarikçileri */
export async function shopFacets(auth: AuthContext) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const productWhere: Prisma.ProductWhereInput = { chamberId: ctx.chamberId, status: "ACTIVE", offers: { some: visibleOfferWhere(ctx) } };
  const [categories, brands, suppliers] = await Promise.all([
    db.category.findMany({ where: { chamberId: ctx.chamberId, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, parentId: true, slug: true } }),
    db.brand.findMany({ where: { products: { some: productWhere } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: visibleSupplierWhere(ctx.chamberId, ctx.districtId), orderBy: { tradeName: "asc" }, select: { id: true, tradeName: true, slug: true } }),
  ]);
  return { ctx, categories, brands, suppliers };
}

/** Ürün sayfası + fiyat karşılaştırma tablosu */
export async function getShopProduct(auth: AuthContext, productId: string) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const p = await db.product.findFirst({
    where: { id: productId, chamberId: ctx.chamberId, status: "ACTIVE" },
    include: {
      brand: true,
      category: { include: { parent: true } },
      images: { orderBy: { sortOrder: "asc" } },
      offers: { where: visibleOfferWhere(ctx), include: offerInclude },
    },
  });
  if (!p) throw new NotFoundError("Ürün bulunamadı.");
  const ids = p.offers.map((o) => o.id);
  const supplierIds = p.offers.map((o) => o.supplierId);
  const [discounts, areas, fav, cart] = await Promise.all([
    loadActiveDiscounts(ids, ctx.chamberId),
    db.deliveryArea.findMany({ where: { supplierId: { in: supplierIds }, districtId: ctx.districtId ?? "__yok__" } }),
    db.favorite.findUnique({ where: { memberId_productId: { memberId: ctx.memberId, productId } } }),
    db.cartItem.findMany({ where: { cart: { memberId: ctx.memberId }, supplierProductId: { in: ids } } }),
  ]);
  const areaBy = new Map(areas.map((a) => [a.supplierId, a]));
  const cartBy = new Map(cart.map((c) => [c.supplierProductId, c.quantity]));
  const offers = p.offers
    .map((o) => {
      const area = areaBy.get(o.supplierId);
      return {
        ...offerSummary(o, discounts.get(o.id) ?? []),
        deliveryDays: area?.deliveryDays ?? [],
        supplierMinAmount: area?.minOrderAmount ?? o.supplier.minOrderAmount,
        inCart: cartBy.get(o.id) ?? null,
      };
    })
    .sort((a, b) => a.unitPrice.comparedTo(b.unitPrice));
  const cheapestId = offers.find((o) => o.stock !== "out")?.offerId ?? null;
  return { ctx, product: p, offers, cheapestId, isFavorite: !!fav };
}

/** Tedarikçi vitrini (yalnızca üyenin ilçesine hizmet veren onaylı tedarikçi) */
export async function getShopSupplier(auth: AuthContext, slug: string, f: CatalogFilter) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const s = await db.supplier.findFirst({
    where: { slug, ...visibleSupplierWhere(ctx.chamberId, ctx.districtId) },
    select: { id: true, tradeName: true, slug: true, description: true, logoPath: true, phone: true, email: true, address: true, minOrderAmount: true },
  });
  if (!s) throw new NotFoundError("Tedarikçi bulunamadı veya bölgenize hizmet vermiyor.");
  const area = await db.deliveryArea.findFirst({ where: { supplierId: s.id, districtId: ctx.districtId! } });
  const list = await listShopProducts(auth, { ...f, tedarikci: s.id });
  return { supplier: s, area: { deliveryDays: area?.deliveryDays ?? [], minOrderAmount: area?.minOrderAmount ?? s.minOrderAmount }, ...list };
}

export async function listShopSuppliers(auth: AuthContext) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const rows = await db.supplier.findMany({
    where: visibleSupplierWhere(ctx.chamberId, ctx.districtId),
    orderBy: { tradeName: "asc" },
    select: {
      id: true, tradeName: true, slug: true, description: true, logoPath: true, minOrderAmount: true,
      deliveryAreas: { where: { districtId: ctx.districtId ?? "__yok__" }, select: { deliveryDays: true, minOrderAmount: true } },
      _count: { select: { products: { where: visibleOfferWhere(ctx) } } },
    },
  });
  return { ctx, suppliers: rows.map((s) => ({ ...s, offerCount: s._count.products, area: s.deliveryAreas[0] ?? null })) };
}

/** Ana sayfa vitrinleri — hepsi canlı veriden */
export async function shopHome(auth: AuthContext) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const now = new Date();
  const since = new Date(now.getTime() - 90 * 86400_000);
  const visible = visibleOfferWhere(ctx);

  const [campaigns, discountedRows, newRows, popular, suppliers, announcements] = await Promise.all([
    db.campaign.findMany({
      where: { ...activeCampaignWhere(ctx.chamberId, now), discounts: { some: { supplierProduct: visible } } },
      orderBy: [{ featured: "desc" }, { endsAt: "asc" }],
      take: 6,
      include: { supplier: { select: { tradeName: true, slug: true } }, _count: { select: { discounts: true } } },
    }),
    db.product.findMany({
      where: { chamberId: ctx.chamberId, status: "ACTIVE", offers: { some: { ...visible, discounts: { some: { campaign: activeCampaignWhere(ctx.chamberId, now) } } } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: productInclude(ctx),
    }),
    db.product.findMany({
      where: { chamberId: ctx.chamberId, status: "ACTIVE", offers: { some: visible } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: productInclude(ctx),
    }),
    db.$queryRaw<{ productId: string; lines: bigint }[]>`
      SELECT sp."productId", COUNT(oi.id) AS lines
      FROM "OrderItem" oi
      JOIN "SupplierOrder" so ON so.id = oi."supplierOrderId"
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "SupplierProduct" sp ON sp.id = oi."supplierProductId"
      WHERE o."chamberId" = ${ctx.chamberId} AND o."createdAt" >= ${since}
        AND so.status NOT IN ('REJECTED', 'CANCELLED')
      GROUP BY sp."productId"
      ORDER BY lines DESC
      LIMIT 24`,
    db.supplier.findMany({ where: visibleSupplierWhere(ctx.chamberId, ctx.districtId), orderBy: { tradeName: "asc" }, take: 12, select: { id: true, tradeName: true, slug: true, logoPath: true } }),
    db.announcement.findMany({
      where: { chamberId: ctx.chamberId, audience: { in: ["ALL", "MEMBERS"] }, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
    }),
  ]);

  const popularIds = popular.map((p) => p.productId);
  const popularRows = popularIds.length
    ? await db.product.findMany({ where: { id: { in: popularIds }, chamberId: ctx.chamberId, status: "ACTIVE", offers: { some: visible } }, include: productInclude(ctx) })
    : [];
  popularRows.sort((a, b) => popularIds.indexOf(a.id) - popularIds.indexOf(b.id));

  const [discounted, newest, mostOrdered] = await Promise.all([
    summarizeProducts(ctx, discountedRows),
    summarizeProducts(ctx, newRows),
    summarizeProducts(ctx, popularRows.slice(0, 8)),
  ]);
  return { ctx, campaigns, discounted, newest, mostOrdered, suppliers, announcements };
}

/** Sponsorlu (öne çıkarılan) ürünler — yalnızca görünür teklifler; sıra: Oda sırası, sonra yeni */
export async function sponsoredProducts(auth: AuthContext, limit = 4) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const now = new Date();
  const rows = await db.sponsoredProduct.findMany({
    where: { active: true, startsAt: { lte: now }, endsAt: { gt: now }, supplierProduct: visibleOfferWhere(ctx) },
    orderBy: [{ sortOrder: "asc" }, { startsAt: "desc" }],
    select: { supplierProduct: { select: { productId: true } } },
    take: limit * 3,
  });
  const ids = [...new Set(rows.map((r) => r.supplierProduct.productId))].slice(0, limit);
  if (!ids.length) return [];
  const products = await db.product.findMany({ where: { id: { in: ids }, chamberId: ctx.chamberId, status: "ACTIVE" }, include: productInclude(ctx) });
  products.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return summarizeProducts(ctx, products);
}
