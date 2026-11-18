import type { AdStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf, supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { saveFile } from "@/lib/storage";
import { pageArgs, z, zDate, zId, zOptDate, zOptId, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifySupplier } from "@/modules/notifications/service";
import { shopContext, visibleOfferWhere, visibleSupplierWhere } from "@/modules/shop/context";
import { listShopProducts } from "@/modules/shop/catalog";

/**
 * Dijital kataloglar (aylık broşür). Tedarikçi kapak + PDF + ürün seçer, Oda onaylar,
 * üyeler yayındaki katalogları görür. Akış: PENDING → APPROVED / REJECTED → ENDED.
 */

export const catalogSchema = z.object({ title: zText(150, 3), categoryId: zOptId, startsAt: zDate, endsAt: zOptDate });

function checkDates(d: { startsAt: Date; endsAt?: Date }) {
  if (d.endsAt && d.endsAt <= d.startsAt) throw new UserError("Bitiş tarihi başlangıçtan sonra olmalıdır.", "endsAt");
}

const now = () => new Date();
const liveWhere = (): Prisma.CatalogWhereInput => ({ status: "APPROVED", startsAt: { lte: now() }, OR: [{ endsAt: null }, { endsAt: { gt: now() } }] });

// ───────────── Tedarikçi ─────────────

export async function listMyCatalogs(auth: AuthContext) {
  assertPermission(auth, "supplierSelf.marketing");
  return db.catalog.findMany({
    where: { supplierId: supplierIdOf(auth) },
    orderBy: { createdAt: "desc" },
    include: { category: { select: { name: true } }, _count: { select: { items: true } } },
  });
}

export async function getMyCatalog(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const c = await db.catalog.findFirst({
    where: { id, supplierId },
    include: { category: true, items: { orderBy: { sortOrder: "asc" }, include: { supplierProduct: { include: { product: { select: { name: true } } } } } } },
  });
  if (!c) throw new NotFoundError("Katalog bulunamadı.");
  const offers = await db.supplierProduct.findMany({
    where: { supplierId, removedByAdmin: false, id: { notIn: c.items.map((i) => i.supplierProductId) } },
    include: { product: { select: { name: true } } },
    orderBy: { product: { name: "asc" } },
  });
  return { catalog: c, offers };
}

export async function createMyCatalog(auth: AuthContext, input: unknown, cover: Buffer | null, pdf: Buffer | null) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const d = catalogSchema.parse(input);
  checkDates(d);
  if (d.categoryId && !(await db.category.findFirst({ where: { id: d.categoryId, active: true } }))) throw new UserError("Geçerli bir kategori seçin.", "categoryId");
  if (!cover && !pdf) throw new UserError("Kapak görseli veya PDF katalog dosyası yükleyin.", "cover");
  const [c1, p1] = await Promise.all([cover ? saveFile("catalogs", cover, ["image"]) : null, pdf ? saveFile("catalogs", pdf, ["document"]) : null]);
  const c = await db.catalog.create({
    data: { supplierId, title: d.title, categoryId: d.categoryId ?? null, startsAt: d.startsAt, endsAt: d.endsAt ?? null, coverPath: c1?.key, filePath: p1?.key, status: "PENDING" },
  });
  await audit({ userId: auth.userId, action: "catalog.create", entityType: "Catalog", entityId: c.id, data: { title: d.title } });
  return c;
}

async function findMyEditable(auth: AuthContext, id: string) {
  const c = await db.catalog.findFirst({ where: { id, supplierId: supplierIdOf(auth) } });
  if (!c) throw new NotFoundError("Katalog bulunamadı.");
  return c;
}

export async function addMyCatalogItem(auth: AuthContext, catalogId: string, input: unknown) {
  assertPermission(auth, "supplierSelf.marketing");
  const c = await findMyEditable(auth, catalogId);
  if (c.status === "ENDED") throw new UserError("Sona ermiş katalog düzenlenemez.");
  const { supplierProductId } = z.object({ supplierProductId: zId }).parse(input);
  const offer = await db.supplierProduct.findFirst({ where: { id: supplierProductId, supplierId: c.supplierId, removedByAdmin: false } });
  if (!offer) throw new UserError("Ürününüzü seçin.", "supplierProductId");
  const count = await db.catalogItem.count({ where: { catalogId } });
  await db.catalogItem.upsert({
    where: { catalogId_supplierProductId: { catalogId, supplierProductId } },
    update: {},
    create: { catalogId, supplierProductId, sortOrder: count },
  });
}

export async function removeMyCatalogItem(auth: AuthContext, catalogId: string, supplierProductId: string) {
  assertPermission(auth, "supplierSelf.marketing");
  await findMyEditable(auth, catalogId);
  await db.catalogItem.deleteMany({ where: { catalogId, supplierProductId } });
}

export async function deleteMyCatalog(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.marketing");
  const c = await findMyEditable(auth, id);
  if (c.status === "APPROVED") throw new UserError("Yayındaki katalog silinemez; önce sonlandırın.");
  await db.catalog.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "catalog.delete", entityType: "Catalog", entityId: id });
}

export async function endMyCatalog(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.marketing");
  const c = await findMyEditable(auth, id);
  if (c.status !== "APPROVED") throw new UserError("Yalnızca yayındaki katalog sonlandırılabilir.");
  await db.catalog.update({ where: { id }, data: { status: "ENDED" } });
  await audit({ userId: auth.userId, action: "catalog.end", entityType: "Catalog", entityId: id });
}

// ───────────── Oda ─────────────

export async function listCatalogsForReview(auth: AuthContext, f: { status?: string; page?: string }) {
  assertPermission(auth, "catalog.review");
  const chamberId = chamberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "APPROVED", "REJECTED", "ENDED"].includes(f.status ?? "") ? (f.status as AdStatus) : undefined;
  const where: Prisma.CatalogWhereInput = { supplier: { chambers: { some: { chamberId } } }, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    db.catalog.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip, take, include: { supplier: { select: { tradeName: true } }, category: { select: { name: true } }, _count: { select: { items: true } } } }),
    db.catalog.count({ where }),
  ]);
  return { items, total, page, size };
}

async function findForReview(auth: AuthContext, id: string) {
  const c = await db.catalog.findFirst({ where: { id, supplier: { chambers: { some: { chamberId: chamberIdOf(auth) } } } } });
  if (!c) throw new NotFoundError("Katalog bulunamadı.");
  return c;
}

export async function reviewCatalog(auth: AuthContext, id: string, decision: "approve" | "reject" | "end", input: unknown) {
  assertPermission(auth, "catalog.review");
  const c = await findForReview(auth, id);
  const { note } = z.object({ note: z.preprocess((v) => (v === "" ? undefined : v), zText(300, 3).optional()) }).parse(input ?? {});
  if (decision === "approve") {
    if (c.status !== "PENDING") throw new UserError("Yalnızca bekleyen katalog onaylanabilir.");
    await db.catalog.update({ where: { id }, data: { status: "APPROVED" } });
    await notifySupplier(c.supplierId, { type: "catalog.approved", title: "Kataloğunuz yayında", message: `"${c.title}" onaylandı.`, link: "/tedarikci/kataloglar" });
  } else if (decision === "reject") {
    if (c.status !== "PENDING") throw new UserError("Yalnızca bekleyen katalog reddedilebilir.");
    if (!note) throw new UserError("Red gerekçesi yazın.", "note");
    await db.catalog.update({ where: { id }, data: { status: "REJECTED" } });
    await notifySupplier(c.supplierId, { type: "catalog.rejected", title: "Kataloğunuz reddedildi", message: `"${c.title}": ${note}`, link: "/tedarikci/kataloglar" });
  } else {
    if (c.status !== "APPROVED") throw new UserError("Yalnızca yayındaki katalog sonlandırılabilir.");
    await db.catalog.update({ where: { id }, data: { status: "ENDED" } });
  }
  await audit({ userId: auth.userId, action: `catalog.${decision}`, entityType: "Catalog", entityId: id, data: { note } });
}

// ───────────── Üye ─────────────

export async function listShopCatalogs(auth: AuthContext) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const items = await db.catalog.findMany({
    where: { ...liveWhere(), supplier: visibleSupplierWhere(ctx.chamberId, ctx.districtId) },
    orderBy: { startsAt: "desc" },
    include: { supplier: { select: { tradeName: true, slug: true } }, category: { select: { name: true } }, _count: { select: { items: { where: { supplierProduct: visibleOfferWhere(ctx) } } } } },
  });
  return { ctx, items };
}

export async function getShopCatalog(auth: AuthContext, id: string) {
  assertPermission(auth, "memberSelf.shop");
  const ctx = await shopContext(auth);
  const c = await db.catalog.findFirst({
    where: { id, ...liveWhere(), supplier: visibleSupplierWhere(ctx.chamberId, ctx.districtId) },
    include: { supplier: { select: { tradeName: true, slug: true } }, items: { orderBy: { sortOrder: "asc" }, select: { supplierProductId: true, supplierProduct: { select: { productId: true } } } } },
  });
  if (!c) throw new NotFoundError("Katalog bulunamadı.");
  const productIds = [...new Set(c.items.map((i) => i.supplierProduct.productId))];
  const products = productIds.length ? await listShopProducts(auth, { onlyIds: productIds, tedarikci: c.supplierId }, 200) : null;
  return { catalog: c, products: products?.items ?? [] };
}
