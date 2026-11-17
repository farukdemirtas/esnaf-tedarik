import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { uniqueSlug } from "@/lib/slug";
import { z, zBool, zInt, zOptId, zOptText, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";

// ───────────── Kategoriler (ağaç yapısı) ─────────────

export const categorySchema = z.object({
  name: zText(80, 2),
  parentId: zOptId,
  sortOrder: z.preprocess((v) => (v === "" || v === undefined ? 0 : v), zInt(0, 100000)),
  icon: zOptText(40),
  active: zBool,
});

export type CategoryNode = Awaited<ReturnType<typeof listCategoryTree>>[number];

export async function listCategoryTree(chamberId: string, onlyActive = false) {
  const all = await db.category.findMany({
    where: { chamberId, ...(onlyActive ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, children: true } } },
  });
  type Node = (typeof all)[number] & { depth: number };
  const byParent = new Map<string | null, typeof all>();
  for (const c of all) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const out: Node[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

async function findCategory(auth: AuthContext, id: string) {
  const c = await db.category.findFirst({ where: { id, chamberId: chamberIdOf(auth) } });
  if (!c) throw new NotFoundError("Kategori bulunamadı.");
  return c;
}

async function assertValidParent(auth: AuthContext, parentId: string | undefined, selfId?: string) {
  if (!parentId) return;
  const chamberId = chamberIdOf(auth);
  // Döngü kontrolü: yeni üst kategori, kategorinin kendisi veya alt kategorisi olamaz
  let cursor: string | null = parentId;
  for (let i = 0; cursor && i < 50; i++) {
    if (cursor === selfId) throw new UserError("Bir kategori kendi alt kategorisinin altına taşınamaz.", "parentId");
    const p: { parentId: string | null } | null = await db.category.findFirst({ where: { id: cursor, chamberId }, select: { parentId: true } });
    if (!p) throw new UserError("Üst kategori bulunamadı.", "parentId");
    cursor = p.parentId;
  }
}

export async function createCategory(auth: AuthContext, input: unknown) {
  assertPermission(auth, "category.manage");
  const chamberId = chamberIdOf(auth);
  const d = categorySchema.parse(input);
  await assertValidParent(auth, d.parentId);
  const slug = await uniqueSlug(d.name, async (s) => !!(await db.category.findUnique({ where: { chamberId_slug: { chamberId, slug: s } } })));
  const c = await db.category.create({ data: { chamberId, name: d.name, slug, parentId: d.parentId ?? null, sortOrder: d.sortOrder, icon: d.icon, active: d.active } });
  await audit({ userId: auth.userId, action: "category.create", entityType: "Category", entityId: c.id, data: d });
}

export async function updateCategory(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "category.manage");
  await findCategory(auth, id);
  const d = categorySchema.parse(input);
  await assertValidParent(auth, d.parentId, id);
  await db.category.update({ where: { id }, data: { name: d.name, parentId: d.parentId ?? null, sortOrder: d.sortOrder, icon: d.icon ?? null, active: d.active } });
  await audit({ userId: auth.userId, action: "category.update", entityType: "Category", entityId: id, data: d });
}

export async function deleteCategory(auth: AuthContext, id: string) {
  assertPermission(auth, "category.manage");
  const c = await findCategory(auth, id);
  const [children, products] = await Promise.all([
    db.category.count({ where: { parentId: id } }),
    db.product.count({ where: { categoryId: id } }),
  ]);
  if (children) throw new UserError("Alt kategorisi olan kategori silinemez. Önce alt kategorileri taşıyın veya silin.");
  if (products) throw new UserError(`Bu kategoride ${products} ürün var. Silmek yerine pasif yapabilir veya ürünleri taşıyabilirsiniz.`);
  await db.category.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "category.delete", entityType: "Category", entityId: id, data: { name: c.name } });
}

// ───────────── Markalar ─────────────

export const brandSchema = z.object({ name: zText(80, 1) });

export async function listBrands(q?: string) {
  return db.brand.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

async function assertBrandNameFree(name: string, exceptId?: string) {
  const dup = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dup) throw new UserError("Bu isimde bir marka zaten var.", "name");
}

export async function createBrand(auth: AuthContext, input: unknown) {
  assertPermission(auth, "brand.manage");
  const d = brandSchema.parse(input);
  await assertBrandNameFree(d.name);
  const slug = await uniqueSlug(d.name, async (s) => !!(await db.brand.findUnique({ where: { slug: s } })));
  const b = await db.brand.create({ data: { name: d.name, slug } });
  await audit({ userId: auth.userId, action: "brand.create", entityType: "Brand", entityId: b.id, data: d });
}

export async function updateBrand(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "brand.manage");
  const d = brandSchema.parse(input);
  if (!(await db.brand.findUnique({ where: { id } }))) throw new NotFoundError("Marka bulunamadı.");
  await assertBrandNameFree(d.name, id);
  await db.brand.update({ where: { id }, data: { name: d.name } });
  await audit({ userId: auth.userId, action: "brand.update", entityType: "Brand", entityId: id, data: d });
}

export async function deleteBrand(auth: AuthContext, id: string) {
  assertPermission(auth, "brand.manage");
  const b = await db.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!b) throw new NotFoundError("Marka bulunamadı.");
  if (b._count.products) throw new UserError(`Bu markaya bağlı ${b._count.products} ürün var; silinemez.`);
  await db.brand.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "brand.delete", entityType: "Brand", entityId: id, data: { name: b.name } });
}

/** Markayı adıyla bulur, yoksa oluşturur (ürün talebi onayında kullanılır) */
export async function findOrCreateBrand(name: string) {
  const trimmed = name.trim();
  const existing = await db.brand.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing;
  const slug = await uniqueSlug(trimmed, async (s) => !!(await db.brand.findUnique({ where: { slug: s } })));
  return db.brand.create({ data: { name: trimmed, slug } });
}
