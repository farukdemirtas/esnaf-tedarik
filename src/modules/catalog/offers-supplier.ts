import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertOfferLimit } from "@/modules/revenue/packages";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { saveFile } from "@/lib/storage";
import { pageArgs, z, zBool, zId, zInt, zMoney, zOptBarcode, zOptId, zOptQuantity, zOptText, zQuantity, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { primaryChamberId, supplierChamberIds } from "@/modules/suppliers/self";

/**
 * Tedarikçinin teklifleri (ürünlerim): katalogdaki bir ürünü kendi paketi, fiyatı ve stoğuyla satışa sunar.
 * Stok, sipariş birimi cinsindendir (koli / adet / kg / paket).
 * Fiyatlar KDV hariç girilir. Her fiyat değişikliği fiyat geçmişine yazılır.
 */

export const VAT_RATES = [0, 1, 10, 20] as const;
const D = Prisma.Decimal;

const offerDetailSchema = z.object({
  packType: z.enum(["ADET", "KOLI", "KG", "PAKET"]),
  unitsPerPack: zInt(1, 10000),
  vatRate: zInt(0, 20).refine((v) => (VAT_RATES as readonly number[]).includes(v), "Geçerli bir KDV oranı seçin (%0, %1, %10, %20)."),
  minOrderQty: zQuantity,
  orderStep: zQuantity,
  sku: zOptText(50),
  active: zBool,
});
export const offerCreateSchema = offerDetailSchema.extend({ productId: zId, packPrice: zMoney, stock: zQuantity });
export const priceStockSchema = z.object({ packPrice: zMoney, stock: zQuantity });

type Detail = z.infer<typeof offerDetailSchema>;

/** Paket türüne göre tutarlılık kuralları */
function validateDetail(d: Detail) {
  const minQ = new D(d.minOrderQty);
  const step = new D(d.orderStep);
  if (minQ.lte(0)) throw new UserError("Asgari sipariş miktarı 0'dan büyük olmalıdır.", "minOrderQty");
  if (step.lte(0)) throw new UserError("Sipariş artış miktarı 0'dan büyük olmalıdır.", "orderStep");
  if (d.packType !== "KG") {
    if (!minQ.isInteger()) throw new UserError("Koli/adet/paket satışta asgari miktar tam sayı olmalıdır.", "minOrderQty");
    if (!step.isInteger()) throw new UserError("Koli/adet/paket satışta artış miktarı tam sayı olmalıdır.", "orderStep");
  }
  if ((d.packType === "ADET" || d.packType === "KG") && d.unitsPerPack !== 1)
    throw new UserError("Adet ve kg satışta paket içi adet 1 olmalıdır.", "unitsPerPack");
}

function assertPositivePrice(p: string, field = "packPrice") {
  if (new D(p).lte(0)) throw new UserError("Fiyat 0'dan büyük olmalıdır.", field);
}

function assertStockUnit(packType: string, stock: string, field = "stock") {
  if (packType !== "KG" && !new D(stock).isInteger()) throw new UserError("Stok, koli/adet/paket için tam sayı olmalıdır.", field);
}

const unitPriceOf = (packPrice: string, unitsPerPack: number) => new D(packPrice).div(unitsPerPack).toDecimalPlaces(2);

async function findMyOffer(auth: AuthContext, id: string) {
  const o = await db.supplierProduct.findFirst({ where: { id, supplierId: supplierIdOf(auth) }, include: { stock: true, product: true } });
  if (!o) throw new NotFoundError("Ürün bulunamadı.");
  return o;
}

export async function listMyOffers(auth: AuthContext, f: { q?: string; state?: string; categoryId?: string; page?: string }) {
  assertPermission(auth, "panel.supplier");
  const supplierId = supplierIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page, 50);
  const q = f.q?.trim();
  const where: Prisma.SupplierProductWhereInput = {
    supplierId,
    ...(f.state === "active" ? { active: true, removedByAdmin: false } : {}),
    ...(f.state === "inactive" ? { active: false } : {}),
    ...(f.state === "removed" ? { removedByAdmin: true } : {}),
    ...(f.state === "lowstock" ? { active: true, stock: { quantity: { lte: 5 } } } : {}),
    product: {
      ...(f.categoryId ? { OR: [{ categoryId: f.categoryId }, { category: { parentId: f.categoryId } }] } : {}),
      ...(q ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] }] } : {}),
    },
  };
  const [items, total] = await Promise.all([
    db.supplierProduct.findMany({
      where,
      orderBy: { product: { name: "asc" } },
      skip,
      take,
      include: { product: { include: { brand: true, category: true, images: { take: 1, orderBy: { sortOrder: "asc" } } } }, stock: true },
    }),
    db.supplierProduct.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function getMyOffer(auth: AuthContext, id: string) {
  assertPermission(auth, "panel.supplier");
  const o = await db.supplierProduct.findFirst({
    where: { id, supplierId: supplierIdOf(auth) },
    include: {
      product: { include: { brand: true, category: true, images: { orderBy: { sortOrder: "asc" } } } },
      stock: true,
      prices: { orderBy: { validFrom: "desc" }, take: 20 },
      stockMovements: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!o) throw new NotFoundError("Ürün bulunamadı.");
  return o;
}

/** Katalogda ürün arar; firmanın zaten sattığı paket türleri işaretlenir */
export async function searchCatalogForSupplier(auth: AuthContext, q: string | undefined, take = 30) {
  assertPermission(auth, "panel.supplier");
  const supplierId = supplierIdOf(auth);
  const term = q?.trim();
  if (!term || term.length < 2) return [];
  return db.product.findMany({
    where: {
      chamberId: { in: await supplierChamberIds(supplierId) },
      status: "ACTIVE",
      OR: [{ name: { contains: term, mode: "insensitive" } }, { barcode: { contains: term } }, { brand: { name: { contains: term, mode: "insensitive" } } }],
    },
    orderBy: { name: "asc" },
    take,
    include: { brand: true, category: true, images: { take: 1 }, offers: { where: { supplierId }, select: { id: true, packType: true } } },
  });
}

export async function getCatalogProductForSupplier(auth: AuthContext, productId: string) {
  assertPermission(auth, "panel.supplier");
  const supplierId = supplierIdOf(auth);
  const p = await db.product.findFirst({
    where: { id: productId, status: "ACTIVE", chamberId: { in: await supplierChamberIds(supplierId) } },
    include: { brand: true, category: true, images: { take: 1 }, offers: { where: { supplierId }, select: { id: true, packType: true } } },
  });
  if (!p) throw new NotFoundError("Ürün katalogda bulunamadı.");
  return p;
}

export async function createOffer(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.offers");
  assertPermission(auth, "supplierSelf.pricing");
  const supplierId = supplierIdOf(auth);
  const d = offerCreateSchema.parse(input);
  validateDetail(d);
  assertPositivePrice(d.packPrice);
  assertStockUnit(d.packType, d.stock);
  const product = await db.product.findFirst({ where: { id: d.productId, status: "ACTIVE", chamberId: { in: await supplierChamberIds(supplierId) } } });
  if (!product) throw new UserError("Ürün katalogda bulunamadı veya yayında değil.", "productId");
  const dup = await db.supplierProduct.findUnique({ where: { supplierId_productId_packType: { supplierId, productId: d.productId, packType: d.packType } } });
  if (dup) throw new UserError("Bu ürünü bu paket türüyle zaten satıyorsunuz. Mevcut kaydı düzenleyin.", "packType");
  await assertOfferLimit(supplierId);

  const offer = await db.$transaction(async (tx) => {
    const o = await tx.supplierProduct.create({
      data: {
        supplierId,
        productId: d.productId,
        sku: d.sku,
        packType: d.packType,
        unitsPerPack: d.unitsPerPack,
        packPrice: d.packPrice,
        unitPrice: unitPriceOf(d.packPrice, d.unitsPerPack),
        vatRate: d.vatRate,
        minOrderQty: d.minOrderQty,
        orderStep: d.orderStep,
        active: d.active,
        stock: { create: { quantity: d.stock } },
        prices: { create: { type: "LIST", packPrice: d.packPrice, createdById: auth.userId } },
      },
    });
    if (new D(d.stock).gt(0)) await tx.stockMovement.create({ data: { supplierProductId: o.id, change: d.stock, reason: "MANUAL", reference: "İlk stok", userId: auth.userId } });
    await audit({ userId: auth.userId, action: "offer.create", entityType: "SupplierProduct", entityId: o.id, data: { product: product.name, ...d } }, tx);
    return o;
  });
  return offer;
}

/** Paket, KDV, asgari miktar gibi bilgiler (fiyat/stok hariç) */
export async function updateOfferDetails(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplierSelf.offers");
  const o = await findMyOffer(auth, id);
  const d = offerDetailSchema.parse(input);
  validateDetail(d);
  if (d.packType !== o.packType) {
    const dup = await db.supplierProduct.findUnique({ where: { supplierId_productId_packType: { supplierId: o.supplierId, productId: o.productId, packType: d.packType } } });
    if (dup) throw new UserError("Bu ürünü bu paket türüyle zaten satıyorsunuz.", "packType");
    assertStockUnit(d.packType, (o.stock?.quantity ?? new D(0)).toString(), "packType");
  }
  await db.supplierProduct.update({
    where: { id },
    data: { ...d, sku: d.sku ?? null, unitPrice: unitPriceOf(o.packPrice.toString(), d.unitsPerPack) },
  });
  await audit({ userId: auth.userId, action: "offer.update", entityType: "SupplierProduct", entityId: id, data: d });
}

/**
 * Fiyat ve stok güncellemesi. Stok satırı kilitlenir (SELECT … FOR UPDATE);
 * böylece eşzamanlı sipariş stok düşümüyle çakışmaz.
 */
async function applyPriceStock(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  o: { id: string; packPrice: Prisma.Decimal; unitsPerPack: number; packType: string },
  packPrice: string,
  stock: string,
) {
  assertPositivePrice(packPrice);
  assertStockUnit(o.packType, stock);
  const [row] = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`SELECT quantity FROM "Stock" WHERE "supplierProductId" = ${o.id} FOR UPDATE`;
  const oldStock = new D(row?.quantity ?? 0);
  const changes: Record<string, string> = {};
  if (!new D(packPrice).eq(o.packPrice)) {
    const now = new Date();
    await tx.productPrice.updateMany({ where: { supplierProductId: o.id, type: "LIST", validTo: null }, data: { validTo: now } });
    await tx.productPrice.create({ data: { supplierProductId: o.id, type: "LIST", packPrice, validFrom: now, createdById: auth.userId } });
    await tx.supplierProduct.update({ where: { id: o.id }, data: { packPrice, unitPrice: unitPriceOf(packPrice, o.unitsPerPack) } });
    changes.price = `${o.packPrice.toString()} → ${packPrice}`;
  }
  const delta = new D(stock).minus(oldStock);
  if (!delta.isZero()) {
    await tx.stock.upsert({ where: { supplierProductId: o.id }, update: { quantity: stock }, create: { supplierProductId: o.id, quantity: stock } });
    await tx.stockMovement.create({ data: { supplierProductId: o.id, change: delta, reason: "MANUAL", userId: auth.userId } });
    changes.stock = `${oldStock.toString()} → ${stock}`;
  }
  return changes;
}

export async function updatePriceStock(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplierSelf.pricing");
  const o = await findMyOffer(auth, id);
  const d = priceStockSchema.parse(input);
  const changes = await db.$transaction((tx) => applyPriceStock(tx, auth, o, d.packPrice, d.stock));
  if (Object.keys(changes).length) await audit({ userId: auth.userId, action: "offer.priceStock", entityType: "SupplierProduct", entityId: id, data: changes });
  return changes;
}

/**
 * Toplu fiyat/stok: form alanları `price.<id>` ve `stock.<id>`.
 * Yalnızca değişen satırlar güncellenir; hatalı satır varsa hiçbiri kaydedilmez.
 */
export async function bulkUpdatePriceStock(auth: AuthContext, input: Record<string, unknown>) {
  assertPermission(auth, "supplierSelf.pricing");
  const supplierId = supplierIdOf(auth);
  const ids = [...new Set(Object.keys(input).filter((k) => k.startsWith("price.") || k.startsWith("stock.")).map((k) => k.split(".")[1]))];
  if (ids.length === 0) throw new UserError("Güncellenecek ürün yok.");
  const offers = await db.supplierProduct.findMany({ where: { id: { in: ids }, supplierId }, include: { stock: true } });
  if (offers.length !== ids.length) throw new UserError("Listede firmanıza ait olmayan ürün var.");

  const fieldErrors: Record<string, string> = {};
  const rows: { o: (typeof offers)[number]; price: string; stock: string }[] = [];
  for (const o of offers) {
    const p = zMoney.safeParse(input[`price.${o.id}`] ?? o.packPrice.toString());
    const s = zQuantity.safeParse(input[`stock.${o.id}`] ?? (o.stock?.quantity ?? 0).toString());
    if (!p.success) fieldErrors[`price.${o.id}`] = "Geçersiz fiyat";
    if (!s.success) fieldErrors[`stock.${o.id}`] = "Geçersiz stok";
    if (p.success && s.success) {
      if (new D(p.data).lte(0)) fieldErrors[`price.${o.id}`] = "Fiyat 0'dan büyük olmalı";
      else if (o.packType !== "KG" && !new D(s.data).isInteger()) fieldErrors[`stock.${o.id}`] = "Tam sayı olmalı";
      else if (!new D(p.data).eq(o.packPrice) || !new D(s.data).eq(o.stock?.quantity ?? 0)) rows.push({ o, price: p.data, stock: s.data });
    }
  }
  if (Object.keys(fieldErrors).length) {
    throw new UserError(`${Object.keys(fieldErrors).length} alanda hata var; hiçbir değişiklik kaydedilmedi.`, undefined, fieldErrors);
  }
  await db.$transaction(async (tx) => {
    for (const r of rows) await applyPriceStock(tx, auth, r.o, r.price, r.stock);
  });
  if (rows.length) await audit({ userId: auth.userId, action: "offer.bulkPriceStock", entityType: "Supplier", entityId: supplierId, data: { count: rows.length } });
  return rows.length;
}

export async function setOfferActive(auth: AuthContext, id: string, active: boolean) {
  assertPermission(auth, "supplierSelf.offers");
  const o = await findMyOffer(auth, id);
  if (active && o.removedByAdmin) throw new UserError("Bu ürün Oda tarafından yayından kaldırılmış; Oda ile iletişime geçin.");
  await db.supplierProduct.update({ where: { id }, data: { active } });
  await audit({ userId: auth.userId, action: active ? "offer.activate" : "offer.deactivate", entityType: "SupplierProduct", entityId: id });
}

// ───────────── Yeni ürün talebi ─────────────

export const productRequestSchema = z.object({
  name: zText(150, 2),
  barcode: zOptBarcode,
  brandName: zText(80, 1),
  categoryId: zOptId,
  unitType: z.enum(["ADET", "KG", "LITRE", "PAKET"]),
  unitAmount: zOptQuantity,
  description: zOptText(2000),
});

export async function createProductRequest(auth: AuthContext, input: unknown, image: Buffer | null) {
  assertPermission(auth, "supplierSelf.offers");
  const supplierId = supplierIdOf(auth);
  const d = productRequestSchema.parse(input);
  const chamberId = await primaryChamberId(supplierId);
  if (d.barcode) {
    const existing = await db.product.findFirst({ where: { chamberId, barcode: d.barcode } });
    if (existing) throw new UserError(`Bu barkodlu ürün katalogda zaten var: "${existing.name}". Ürünlerim → Yeni ürün ekle bölümünden doğrudan fiyat girebilirsiniz.`, "barcode");
    const pending = await db.productRequest.findFirst({ where: { supplierId, barcode: d.barcode, status: "PENDING" } });
    if (pending) throw new UserError("Bu barkod için bekleyen bir talebiniz var.", "barcode");
  }
  if (d.categoryId && !(await db.category.findFirst({ where: { id: d.categoryId, chamberId } }))) throw new UserError("Geçerli bir kategori seçin.", "categoryId");
  const saved = image ? await saveFile("requests", image, ["image"]) : null;
  const r = await db.productRequest.create({ data: { ...d, chamberId, supplierId, imagePath: saved?.key } });
  await audit({ userId: auth.userId, action: "productRequest.create", entityType: "ProductRequest", entityId: r.id, data: { name: d.name } });
  return r;
}

export async function listMyProductRequests(auth: AuthContext) {
  assertPermission(auth, "panel.supplier");
  return db.productRequest.findMany({ where: { supplierId: supplierIdOf(auth) }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function cancelProductRequest(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.offers");
  const r = await db.productRequest.findFirst({ where: { id, supplierId: supplierIdOf(auth) } });
  if (!r) throw new NotFoundError("Talep bulunamadı.");
  if (r.status !== "PENDING") throw new UserError("Yalnızca bekleyen talepler geri çekilebilir.");
  await db.productRequest.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "productRequest.cancel", entityType: "ProductRequest", entityId: id });
}
