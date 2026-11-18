import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf, supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { pageArgs, z, zBool, zId, zInt, zMoney, zOptText, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifySupplier } from "@/modules/notifications/service";
import { primaryChamberId } from "@/modules/suppliers/self";

/**
 * Tedarikçi paketleri (vitrin / tanıtım). Oda paket tanımlar ve ücretini belirler (sistem fiyat uydurmaz).
 * Tedarikçi paket talep eder → Oda onaylar (ödeme platform dışında alınır, yalnızca kayıt tutulur).
 * Aktif paketler tedarikçiye hak verir: ürün listeleme limiti, sponsorlu ürün ve banner sayısı.
 */

export const DEFAULT_PRODUCT_LIMIT_KEY = "supplier.defaultProductLimit";

const zOptInt = (min: number, max: number) => z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : v), zInt(min, max).optional());

export const packageSchema = z.object({
  name: zText(100, 2),
  type: z.enum(["SHOWCASE", "PROMOTION"]),
  description: zOptText(1000),
  productLimit: zOptInt(1, 100_000),
  sponsoredSlots: zInt(0, 100),
  bannerSlots: zInt(0, 100),
  price: zMoney,
  durationDays: zInt(1, 3650),
  active: zBool,
});

// ───────────── Hak hesabı ─────────────

export interface Entitlements {
  /** null = sınırsız */
  productLimit: number | null;
  sponsoredSlots: number;
  bannerSlots: number;
  activePackages: { id: string; name: string; endsAt: Date }[];
}

export async function getDefaultProductLimit(chamberId: string): Promise<number | null> {
  const s = await db.setting.findUnique({ where: { chamberId_key: { chamberId, key: DEFAULT_PRODUCT_LIMIT_KEY } } });
  return typeof s?.value === "number" && s.value > 0 ? s.value : null;
}

export async function supplierEntitlements(supplierId: string, now = new Date()): Promise<Entitlements> {
  const subs = await db.supplierSubscription.findMany({
    where: { supplierId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    include: { package: true },
  });
  const base = await getDefaultProductLimit(await primaryChamberId(supplierId));
  let productLimit: number | null = base;
  for (const s of subs) {
    if (s.package.productLimit === null) productLimit = null;
    else if (productLimit !== null) productLimit = Math.max(productLimit, s.package.productLimit);
  }
  // Varsayılan sınır yoksa ve paketlerin hepsi sınırlıysa bile varsayılan "sınırsız" kalır
  if (base === null) productLimit = null;
  return {
    productLimit,
    sponsoredSlots: subs.reduce((n, s) => n + s.package.sponsoredSlots, 0),
    bannerSlots: subs.reduce((n, s) => n + s.package.bannerSlots, 0),
    activePackages: subs.map((s) => ({ id: s.id, name: s.package.name, endsAt: s.endsAt })),
  };
}

/** Yeni teklif açılırken ürün listeleme limiti kontrolü */
export async function assertOfferLimit(supplierId: string) {
  const e = await supplierEntitlements(supplierId);
  if (e.productLimit === null) return;
  const count = await db.supplierProduct.count({ where: { supplierId, removedByAdmin: false } });
  if (count >= e.productLimit)
    throw new UserError(`Ürün listeleme limitinize (${e.productLimit}) ulaştınız. Daha fazla ürün için Pazarlama sayfasından paket talep edin.`);
}

// ───────────── Oda: paketler ─────────────

export async function listPackages(auth: AuthContext) {
  assertPermission(auth, "package.manage");
  const chamberId = chamberIdOf(auth);
  const [packages, defaultLimit] = await Promise.all([
    db.supplierPackage.findMany({
      where: { chamberId },
      orderBy: [{ active: "desc" }, { price: "asc" }],
      include: { _count: { select: { subscriptions: { where: { status: "ACTIVE", endsAt: { gt: new Date() } } } } } },
    }),
    getDefaultProductLimit(chamberId),
  ]);
  return { packages, defaultLimit };
}

export async function getPackage(auth: AuthContext, id: string) {
  assertPermission(auth, "package.manage");
  const p = await db.supplierPackage.findFirst({ where: { id, chamberId: chamberIdOf(auth) } });
  if (!p) throw new NotFoundError("Paket bulunamadı.");
  return p;
}

export async function createPackage(auth: AuthContext, input: unknown) {
  assertPermission(auth, "package.manage");
  const d = packageSchema.parse(input);
  const p = await db.supplierPackage.create({ data: { ...d, description: d.description ?? null, productLimit: d.productLimit ?? null, chamberId: chamberIdOf(auth) } });
  await audit({ userId: auth.userId, action: "package.create", entityType: "SupplierPackage", entityId: p.id, data: d });
  return p;
}

export async function updatePackage(auth: AuthContext, id: string, input: unknown) {
  await getPackage(auth, id);
  const d = packageSchema.parse(input);
  await db.supplierPackage.update({ where: { id }, data: { ...d, description: d.description ?? null, productLimit: d.productLimit ?? null } });
  await audit({ userId: auth.userId, action: "package.update", entityType: "SupplierPackage", entityId: id, data: d });
}

export async function setDefaultProductLimit(auth: AuthContext, input: unknown) {
  assertPermission(auth, "package.manage");
  const { limit } = z.object({ limit: zOptInt(1, 100_000) }).parse(input);
  const chamberId = chamberIdOf(auth);
  await db.setting.upsert({
    where: { chamberId_key: { chamberId, key: DEFAULT_PRODUCT_LIMIT_KEY } },
    update: { value: limit ?? 0 },
    create: { chamberId, key: DEFAULT_PRODUCT_LIMIT_KEY, value: limit ?? 0 },
  });
  await audit({ userId: auth.userId, action: "package.defaultLimit", data: { limit: limit ?? null } });
}

// ───────────── Oda: abonelikler ─────────────

export async function listSubscriptions(auth: AuthContext, f: { status?: string; page?: string }) {
  assertPermission(auth, "package.manage");
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"].includes(f.status ?? "") ? (f.status as SubscriptionStatus) : undefined;
  const where: Prisma.SupplierSubscriptionWhereInput = { package: { chamberId: chamberIdOf(auth) }, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    db.supplierSubscription.findMany({
      where,
      orderBy: [{ status: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      include: { package: { select: { name: true, type: true } }, supplier: { select: { id: true, tradeName: true } } },
    }),
    db.supplierSubscription.count({ where }),
  ]);
  const now = new Date();
  return { items: items.map((s) => ({ ...s, expired: s.status === "ACTIVE" && s.endsAt <= now })), total, page, size };
}

async function findSubscription(auth: AuthContext, id: string) {
  const s = await db.supplierSubscription.findFirst({ where: { id, package: { chamberId: chamberIdOf(auth) } }, include: { package: true } });
  if (!s) throw new NotFoundError("Paket kaydı bulunamadı.");
  return s;
}

function period(durationDays: number, from = new Date()) {
  return { startsAt: from, endsAt: new Date(from.getTime() + durationDays * 86400_000) };
}

export async function approveSubscription(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "package.manage");
  const s = await findSubscription(auth, id);
  if (s.status !== "PENDING") throw new UserError("Yalnızca bekleyen talepler onaylanabilir.");
  const { note } = z.object({ note: zOptText(300) }).parse(input ?? {});
  const p = period(s.package.durationDays);
  await db.supplierSubscription.update({ where: { id }, data: { status: "ACTIVE", ...p, pricePaid: s.package.price, note: note ?? s.note } });
  await notifySupplier(s.supplierId, { type: "package.approved", title: "Paketiniz aktif", message: `"${s.package.name}" paketi ${p.endsAt.toLocaleDateString("tr-TR")} tarihine kadar aktif.`, link: "/tedarikci/pazarlama" });
  await audit({ userId: auth.userId, action: "package.subscription.approve", entityType: "SupplierSubscription", entityId: id });
}

export async function rejectSubscription(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "package.manage");
  const s = await findSubscription(auth, id);
  if (s.status !== "PENDING" && s.status !== "ACTIVE") throw new UserError("Bu kayıt zaten sonuçlanmış.");
  const { note } = z.object({ note: zText(300, 3) }).parse(input);
  await db.supplierSubscription.update({ where: { id }, data: { status: "CANCELLED", note } });
  await notifySupplier(s.supplierId, {
    type: "package.cancelled",
    title: s.status === "PENDING" ? "Paket talebiniz reddedildi" : "Paketiniz iptal edildi",
    message: `"${s.package.name}": ${note}`,
    link: "/tedarikci/pazarlama",
  });
  await audit({ userId: auth.userId, action: "package.subscription.cancel", entityType: "SupplierSubscription", entityId: id, data: { note } });
}

/** Oda, ödemesi alınmış paketi doğrudan tanımlar */
export async function assignSubscription(auth: AuthContext, input: unknown) {
  assertPermission(auth, "package.manage");
  const chamberId = chamberIdOf(auth);
  const d = z.object({ supplierId: zId, packageId: zId, note: zOptText(300) }).parse(input);
  const pkg = await db.supplierPackage.findFirst({ where: { id: d.packageId, chamberId } });
  if (!pkg) throw new UserError("Paket bulunamadı.", "packageId");
  const sup = await db.supplier.findFirst({ where: { id: d.supplierId, status: "APPROVED", chambers: { some: { chamberId } } } });
  if (!sup) throw new UserError("Onaylı bir tedarikçi seçin.", "supplierId");
  const s = await db.supplierSubscription.create({
    data: { supplierId: sup.id, packageId: pkg.id, status: "ACTIVE", ...period(pkg.durationDays), pricePaid: pkg.price, note: d.note },
  });
  await notifySupplier(sup.id, { type: "package.approved", title: "Paketiniz aktif", message: `"${pkg.name}" paketi tanımlandı.`, link: "/tedarikci/pazarlama" });
  await audit({ userId: auth.userId, action: "package.subscription.assign", entityType: "SupplierSubscription", entityId: s.id, data: d });
  return s;
}

// ───────────── Tedarikçi ─────────────

export async function getMyMarketing(auth: AuthContext) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const chamberId = await primaryChamberId(supplierId);
  const [packages, subscriptions, entitlements, offerCount, sponsoredActive, bannersActive] = await Promise.all([
    db.supplierPackage.findMany({ where: { chamberId, active: true }, orderBy: { price: "asc" } }),
    db.supplierSubscription.findMany({ where: { supplierId }, orderBy: { createdAt: "desc" }, include: { package: { select: { name: true, type: true } } } }),
    supplierEntitlements(supplierId),
    db.supplierProduct.count({ where: { supplierId, removedByAdmin: false } }),
    db.sponsoredProduct.count({ where: { supplierProduct: { supplierId }, active: true, endsAt: { gt: new Date() } } }),
    db.advertisement.count({ where: { supplierId, status: { in: ["PENDING", "APPROVED"] }, endsAt: { gt: new Date() } } }),
  ]);
  return { packages, subscriptions, entitlements, usage: { offerCount, sponsoredActive, bannersActive } };
}

export async function requestPackage(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const { packageId, note } = z.object({ packageId: zId, note: zOptText(300) }).parse(input);
  const pkg = await db.supplierPackage.findFirst({ where: { id: packageId, active: true, chamberId: await primaryChamberId(supplierId) } });
  if (!pkg) throw new UserError("Paket bulunamadı.", "packageId");
  const pending = await db.supplierSubscription.findFirst({ where: { supplierId, packageId, status: "PENDING" } });
  if (pending) throw new UserError("Bu paket için bekleyen bir talebiniz var.");
  const s = await db.supplierSubscription.create({
    data: { supplierId, packageId, status: "PENDING", startsAt: new Date(), endsAt: new Date(), pricePaid: pkg.price, note },
  });
  await audit({ userId: auth.userId, action: "package.request", entityType: "SupplierSubscription", entityId: s.id, data: { package: pkg.name } });
  return s;
}

export async function cancelMyPackageRequest(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.marketing");
  const s = await db.supplierSubscription.findFirst({ where: { id, supplierId: supplierIdOf(auth) } });
  if (!s) throw new NotFoundError("Talep bulunamadı.");
  if (s.status !== "PENDING") throw new UserError("Yalnızca bekleyen talepler geri çekilebilir.");
  await db.supplierSubscription.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "package.request.withdraw", entityType: "SupplierSubscription", entityId: id });
}
