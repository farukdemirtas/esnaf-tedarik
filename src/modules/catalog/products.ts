import type { Prisma, ProductStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { uniqueSlug } from "@/lib/slug";
import { deleteFile, saveFile } from "@/lib/storage";
import { pageArgs, z, zId, zOptBarcode, zOptQuantity, zOptText, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifySupplier } from "@/modules/notifications/service";
import { findOrCreateBrand } from "./taxonomy";

export const MAX_IMAGES_PER_PRODUCT = 6;

export const productSchema = z.object({
  name: zText(150, 2),
  barcode: zOptBarcode,
  brandId: zId,
  categoryId: zId,
  unitType: z.enum(["ADET", "KG", "LITRE", "PAKET"]),
  unitAmount: zOptQuantity,
  description: zOptText(2000),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

async function assertRefs(chamberId: string, brandId: string, categoryId: string) {
  const [brand, category] = await Promise.all([
    db.brand.findUnique({ where: { id: brandId } }),
    db.category.findFirst({ where: { id: categoryId, chamberId } }),
  ]);
  if (!brand) throw new UserError("Geçerli bir marka seçin.", "brandId");
  if (!category) throw new UserError("Geçerli bir kategori seçin.", "categoryId");
}

async function assertBarcodeFree(chamberId: string, barcode: string | undefined, exceptId?: string) {
  if (!barcode) return;
  const dup = await db.product.findFirst({ where: { chamberId, barcode, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dup) throw new UserError(`Bu barkod "${dup.name}" ürününde kayıtlı.`, "barcode");
}

export async function listProducts(auth: AuthContext, f: { q?: string; brandId?: string; categoryId?: string; status?: string; page?: string }) {
  assertPermission(auth, "product.manage");
  const chamberId = chamberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["ACTIVE", "ARCHIVED", "PENDING", "REJECTED"].includes(f.status ?? "") ? (f.status as ProductStatus) : undefined;
  const q = f.q?.trim();
  const where: Prisma.ProductWhereInput = {
    chamberId,
    ...(status ? { status } : {}),
    ...(f.brandId ? { brandId: f.brandId } : {}),
    ...(f.categoryId ? { OR: [{ categoryId: f.categoryId }, { category: { parentId: f.categoryId } }] } : {}),
    ...(q ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      include: { brand: true, category: true, images: { orderBy: { sortOrder: "asc" }, take: 1 }, _count: { select: { offers: true } } },
    }),
    db.product.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function getProduct(auth: AuthContext, id: string) {
  assertPermission(auth, "product.manage");
  const p = await db.product.findFirst({
    where: { id, chamberId: chamberIdOf(auth) },
    include: {
      brand: true,
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      offers: { include: { supplier: { select: { id: true, tradeName: true } }, stock: true }, orderBy: { packPrice: "asc" } },
    },
  });
  if (!p) throw new NotFoundError("Ürün bulunamadı.");
  return p;
}

export async function createProduct(auth: AuthContext, input: unknown, image?: Buffer | null) {
  assertPermission(auth, "product.manage");
  const chamberId = chamberIdOf(auth);
  const d = productSchema.parse(input);
  await assertRefs(chamberId, d.brandId, d.categoryId);
  await assertBarcodeFree(chamberId, d.barcode);
  const slug = await uniqueSlug(d.name, async (s) => !!(await db.product.findUnique({ where: { chamberId_slug: { chamberId, slug: s } } })));
  const saved = image ? await saveFile("products", image, ["image"]) : null;
  const p = await db.product.create({
    data: {
      chamberId,
      name: d.name,
      slug,
      barcode: d.barcode,
      brandId: d.brandId,
      categoryId: d.categoryId,
      unitType: d.unitType,
      unitAmount: d.unitAmount,
      description: d.description,
      status: d.status,
      ...(saved ? { images: { create: { path: saved.key } } } : {}),
    },
  });
  await audit({ userId: auth.userId, action: "product.create", entityType: "Product", entityId: p.id, data: d });
  return p;
}

export async function updateProduct(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "product.manage");
  const chamberId = chamberIdOf(auth);
  const existing = await db.product.findFirst({ where: { id, chamberId } });
  if (!existing) throw new NotFoundError("Ürün bulunamadı.");
  const d = productSchema.parse(input);
  await assertRefs(chamberId, d.brandId, d.categoryId);
  await assertBarcodeFree(chamberId, d.barcode, id);
  await db.product.update({
    where: { id },
    data: {
      name: d.name,
      barcode: d.barcode ?? null,
      brandId: d.brandId,
      categoryId: d.categoryId,
      unitType: d.unitType,
      unitAmount: d.unitAmount ?? null,
      description: d.description ?? null,
      status: d.status,
    },
  });
  await audit({ userId: auth.userId, action: "product.update", entityType: "Product", entityId: id, data: d });
}

export async function addProductImage(auth: AuthContext, productId: string, image: Buffer) {
  assertPermission(auth, "product.manage");
  const p = await db.product.findFirst({ where: { id: productId, chamberId: chamberIdOf(auth) }, include: { _count: { select: { images: true } } } });
  if (!p) throw new NotFoundError("Ürün bulunamadı.");
  if (p._count.images >= MAX_IMAGES_PER_PRODUCT) throw new UserError(`Bir ürüne en fazla ${MAX_IMAGES_PER_PRODUCT} görsel eklenebilir.`);
  const saved = await saveFile("products", image, ["image"]);
  await db.productImage.create({ data: { productId, path: saved.key, sortOrder: p._count.images } });
  await audit({ userId: auth.userId, action: "product.image.add", entityType: "Product", entityId: productId });
}

export async function deleteProductImage(auth: AuthContext, imageId: string) {
  assertPermission(auth, "product.manage");
  const img = await db.productImage.findFirst({ where: { id: imageId, product: { chamberId: chamberIdOf(auth) } } });
  if (!img) throw new NotFoundError("Görsel bulunamadı.");
  await db.productImage.delete({ where: { id: imageId } });
  await deleteFile(img.path);
  await audit({ userId: auth.userId, action: "product.image.delete", entityType: "Product", entityId: img.productId });
}

// ───────────── Tedarikçilerin yeni ürün talepleri ─────────────

export async function listProductRequests(auth: AuthContext, f: { status?: string; page?: string }) {
  assertPermission(auth, "productRequest.review");
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(f.status ?? "") ? (f.status as "PENDING") : "PENDING";
  const where = { chamberId: chamberIdOf(auth), status };
  const [items, total] = await Promise.all([
    db.productRequest.findMany({ where, orderBy: { createdAt: "asc" }, skip, take, include: { supplier: { select: { id: true, tradeName: true } } } }),
    db.productRequest.count({ where }),
  ]);
  return { items, total, page, size, status };
}

export const approveRequestSchema = z.object({
  name: zText(150, 2),
  barcode: zOptBarcode,
  brandName: zText(80, 1),
  categoryId: zId,
  unitType: z.enum(["ADET", "KG", "LITRE", "PAKET"]),
  unitAmount: zOptQuantity,
  description: zOptText(2000),
});

/**
 * Talebi onaylar: aynı barkodlu ürün katalogda varsa talep ona bağlanır,
 * yoksa yeni ana ürün oluşturulur. Tedarikçi bu ürüne teklif girebilir.
 */
export async function approveProductRequest(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "productRequest.review");
  const chamberId = chamberIdOf(auth);
  const req = await db.productRequest.findFirst({ where: { id, chamberId } });
  if (!req) throw new NotFoundError("Talep bulunamadı.");
  if (req.status !== "PENDING") throw new UserError("Bu talep zaten sonuçlandırılmış.");
  const d = approveRequestSchema.parse(input);
  const category = await db.category.findFirst({ where: { id: d.categoryId, chamberId } });
  if (!category) throw new UserError("Geçerli bir kategori seçin.", "categoryId");

  const existing = d.barcode ? await db.product.findFirst({ where: { chamberId, barcode: d.barcode } }) : null;
  let productId: string;
  let linked = false;
  if (existing) {
    productId = existing.id;
    linked = true;
  } else {
    const brand = await findOrCreateBrand(d.brandName);
    const slug = await uniqueSlug(d.name, async (s) => !!(await db.product.findUnique({ where: { chamberId_slug: { chamberId, slug: s } } })));
    const p = await db.product.create({
      data: {
        chamberId, name: d.name, slug, barcode: d.barcode, brandId: brand.id, categoryId: d.categoryId,
        unitType: d.unitType, unitAmount: d.unitAmount, description: d.description, status: "ACTIVE",
        ...(req.imagePath ? { images: { create: { path: req.imagePath } } } : {}),
      },
    });
    productId = p.id;
  }
  await db.productRequest.update({
    where: { id },
    data: { status: "APPROVED", productId, reviewedById: auth.userId, reviewedAt: new Date(), reviewNote: linked ? "Katalogdaki mevcut ürüne bağlandı." : null },
  });
  await notifySupplier(req.supplierId, {
    type: "productRequest.approved",
    title: "Ürün talebiniz onaylandı",
    message: `"${d.name}" katalogda yayında. Artık bu ürün için fiyat ve stok girebilirsiniz.`,
    link: "/tedarikci",
  });
  await audit({ userId: auth.userId, action: "productRequest.approve", entityType: "ProductRequest", entityId: id, data: { productId, linked } });
  return { productId, linked };
}

export async function rejectProductRequest(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "productRequest.review");
  const req = await db.productRequest.findFirst({ where: { id, chamberId: chamberIdOf(auth) } });
  if (!req) throw new NotFoundError("Talep bulunamadı.");
  if (req.status !== "PENDING") throw new UserError("Bu talep zaten sonuçlandırılmış.");
  const { note } = z.object({ note: zText(500, 3) }).parse(input);
  await db.productRequest.update({ where: { id }, data: { status: "REJECTED", reviewNote: note, reviewedById: auth.userId, reviewedAt: new Date() } });
  await notifySupplier(req.supplierId, { type: "productRequest.rejected", title: "Ürün talebiniz reddedildi", message: `"${req.name}": ${note}`, link: "/tedarikci" });
  await audit({ userId: auth.userId, action: "productRequest.reject", entityType: "ProductRequest", entityId: id, data: { note } });
}
