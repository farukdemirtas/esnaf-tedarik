import type { AdStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf, supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { saveFile } from "@/lib/storage";
import { pageArgs, z, zDateTime, zId, zOptId, zOptMoney, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifySupplier } from "@/modules/notifications/service";
import { primaryChamberId } from "@/modules/suppliers/self";
import { supplierEntitlements } from "./packages";

/**
 * Banner reklamları. Oda doğrudan yayınlar veya tedarikçinin talebini onaylar.
 * Hedef bağlantı yalnızca platform içi /magaza adresleri olabilir (açık yönlendirme önlenir).
 * Gösterim ve tıklama sayıları tutulur.
 */

export const AD_SLOTS = [
  { code: "home-top", name: "Mağaza ana sayfa üst bant", width: 1200, height: 300 },
  { code: "products-top", name: "Ürünler sayfası üst bant", width: 1200, height: 200 },
] as const;

const zTarget = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(300)
    .regex(/^\/magaza(\/[A-Za-z0-9\-_/?=&%.]*)?$/, "Bağlantı /magaza ile başlayan bir platform adresi olmalıdır (örn. /magaza/tedarikciler/firma).")
    .optional(),
);

export const adSchema = z.object({
  slotId: zId,
  title: zText(120, 3),
  targetUrl: zTarget,
  startsAt: zDateTime,
  endsAt: zDateTime,
});
export const odaAdSchema = adSchema.extend({ supplierId: zOptId, fee: zOptMoney });

function checkDates(d: { startsAt: Date; endsAt: Date }) {
  if (d.endsAt <= d.startsAt) throw new UserError("Bitiş tarihi başlangıçtan sonra olmalıdır.", "endsAt");
  if (d.endsAt <= new Date()) throw new UserError("Bitiş tarihi geçmiş olamaz.", "endsAt");
}

async function slotOf(chamberId: string, slotId: string) {
  const slot = await db.adSlot.findFirst({ where: { id: slotId, chamberId, active: true } });
  if (!slot) throw new UserError("Geçerli bir reklam alanı seçin.", "slotId");
  return slot;
}

/** Oda için reklam alanları; yoksa varsayılanları oluşturur */
export async function ensureSlots(chamberId: string) {
  for (const s of AD_SLOTS)
    await db.adSlot.upsert({ where: { chamberId_code: { chamberId, code: s.code } }, update: {}, create: { chamberId, ...s } });
  return db.adSlot.findMany({ where: { chamberId }, orderBy: { code: "asc" } });
}

// ───────────── Oda ─────────────

export async function listAds(auth: AuthContext, f: { status?: string; page?: string }) {
  assertPermission(auth, "ads.manage");
  const chamberId = chamberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "APPROVED", "REJECTED", "ENDED"].includes(f.status ?? "") ? (f.status as AdStatus) : undefined;
  const where: Prisma.AdvertisementWhereInput = { slot: { chamberId }, ...(status ? { status } : {}) };
  const [items, total, slots, counts] = await Promise.all([
    db.advertisement.findMany({ where, orderBy: [{ status: "asc" }, { startsAt: "desc" }], skip, take, include: { slot: true, supplier: { select: { id: true, tradeName: true } } } }),
    db.advertisement.count({ where }),
    ensureSlots(chamberId),
    db.advertisement.groupBy({ by: ["status"], where: { slot: { chamberId } }, _count: true }),
  ]);
  return { items, total, page, size, slots, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<AdStatus, number>> };
}

async function findAd(auth: AuthContext, id: string) {
  const ad = await db.advertisement.findFirst({ where: { id, slot: { chamberId: chamberIdOf(auth) } }, include: { slot: true, supplier: { select: { id: true, tradeName: true } } } });
  if (!ad) throw new NotFoundError("Reklam bulunamadı.");
  return ad;
}

export async function getAd(auth: AuthContext, id: string) {
  assertPermission(auth, "ads.manage");
  return findAd(auth, id);
}

export async function createAd(auth: AuthContext, input: unknown, image: Buffer | null) {
  assertPermission(auth, "ads.manage");
  const chamberId = chamberIdOf(auth);
  const d = odaAdSchema.parse(input);
  checkDates(d);
  await slotOf(chamberId, d.slotId);
  if (d.supplierId && !(await db.supplier.findFirst({ where: { id: d.supplierId, chambers: { some: { chamberId } } } })))
    throw new UserError("Tedarikçi bulunamadı.", "supplierId");
  if (!image) throw new UserError("Banner görseli yükleyin (JPG, PNG veya WEBP).", "image");
  const saved = await saveFile("ads", image, ["image"]);
  const ad = await db.advertisement.create({
    data: { slotId: d.slotId, supplierId: d.supplierId ?? null, title: d.title, imagePath: saved.key, targetUrl: d.targetUrl ?? null, startsAt: d.startsAt, endsAt: d.endsAt, fee: d.fee ?? null, status: "APPROVED" },
  });
  await audit({ userId: auth.userId, action: "ad.create", entityType: "Advertisement", entityId: ad.id, data: { title: d.title } });
  return ad;
}

export async function approveAd(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "ads.manage");
  const ad = await findAd(auth, id);
  if (ad.status !== "PENDING") throw new UserError("Yalnızca bekleyen reklamlar onaylanabilir.");
  if (ad.endsAt <= new Date()) throw new UserError("Reklamın bitiş tarihi geçmiş.");
  const { fee } = z.object({ fee: zOptMoney }).parse(input ?? {});
  await db.advertisement.update({ where: { id }, data: { status: "APPROVED", ...(fee ? { fee } : {}) } });
  if (ad.supplierId) await notifySupplier(ad.supplierId, { type: "ad.approved", title: "Reklamınız onaylandı", message: `"${ad.title}" belirtilen tarihlerde yayında.`, link: "/tedarikci/reklamlar" });
  await audit({ userId: auth.userId, action: "ad.approve", entityType: "Advertisement", entityId: id });
}

export async function rejectAd(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "ads.manage");
  const ad = await findAd(auth, id);
  if (ad.status !== "PENDING") throw new UserError("Yalnızca bekleyen reklamlar reddedilebilir.");
  const { note } = z.object({ note: zText(300, 3) }).parse(input);
  await db.advertisement.update({ where: { id }, data: { status: "REJECTED" } });
  if (ad.supplierId) await notifySupplier(ad.supplierId, { type: "ad.rejected", title: "Reklam talebiniz reddedildi", message: `"${ad.title}": ${note}`, link: "/tedarikci/reklamlar" });
  await audit({ userId: auth.userId, action: "ad.reject", entityType: "Advertisement", entityId: id, data: { note } });
}

export async function endAd(auth: AuthContext, id: string) {
  assertPermission(auth, "ads.manage");
  const ad = await findAd(auth, id);
  if (ad.status !== "APPROVED") throw new UserError("Yalnızca yayındaki reklamlar sonlandırılabilir.");
  await db.advertisement.update({ where: { id }, data: { status: "ENDED", endsAt: ad.endsAt < new Date() ? ad.endsAt : new Date() } });
  await audit({ userId: auth.userId, action: "ad.end", entityType: "Advertisement", entityId: id });
}

// ───────────── Tedarikçi ─────────────

export async function listMyAds(auth: AuthContext) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const chamberId = await primaryChamberId(supplierId);
  const [items, slots, entitlements] = await Promise.all([
    db.advertisement.findMany({ where: { supplierId }, orderBy: { createdAt: "desc" }, include: { slot: true } }),
    ensureSlots(chamberId),
    supplierEntitlements(supplierId),
  ]);
  const used = items.filter((a) => (a.status === "PENDING" || a.status === "APPROVED") && a.endsAt > new Date()).length;
  return { items, slots: slots.filter((s) => s.active), entitlements, used };
}

export async function requestAd(auth: AuthContext, input: unknown, image: Buffer | null) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const chamberId = await primaryChamberId(supplierId);
  const d = adSchema.parse(input);
  checkDates(d);
  await slotOf(chamberId, d.slotId);
  const { bannerSlots } = await supplierEntitlements(supplierId);
  const used = await db.advertisement.count({ where: { supplierId, status: { in: ["PENDING", "APPROVED"] }, endsAt: { gt: new Date() } } });
  if (used >= bannerSlots)
    throw new UserError(bannerSlots === 0 ? "Banner reklam hakkınız yok. Tanıtım paketi talep edin." : `Banner hakkınızın tamamını (${bannerSlots}) kullanıyorsunuz.`);
  if (!image) throw new UserError("Banner görseli yükleyin (JPG, PNG veya WEBP).", "image");
  const saved = await saveFile("ads", image, ["image"]);
  const ad = await db.advertisement.create({
    data: { slotId: d.slotId, supplierId, title: d.title, imagePath: saved.key, targetUrl: d.targetUrl ?? null, startsAt: d.startsAt, endsAt: d.endsAt, status: "PENDING" },
  });
  await audit({ userId: auth.userId, action: "ad.request", entityType: "Advertisement", entityId: ad.id, data: { title: d.title } });
  return ad;
}

export async function withdrawMyAd(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.marketing");
  const ad = await db.advertisement.findFirst({ where: { id, supplierId: supplierIdOf(auth) } });
  if (!ad) throw new NotFoundError("Reklam bulunamadı.");
  if (ad.status !== "PENDING" && ad.status !== "REJECTED") throw new UserError("Yalnızca bekleyen veya reddedilen reklam silinebilir.");
  await db.advertisement.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "ad.withdraw", entityType: "Advertisement", entityId: id });
}

// ───────────── Üye görünümü ─────────────

/** Yayındaki bannerlar (gösterim sayısı artırılır) */
export async function activeAds(chamberId: string, slotCode: string, limit = 3) {
  const now = new Date();
  const ads = await db.advertisement.findMany({
    where: {
      slot: { chamberId, code: slotCode, active: true },
      status: "APPROVED",
      startsAt: { lte: now },
      endsAt: { gt: now },
      OR: [{ supplierId: null }, { supplier: { status: "APPROVED" } }],
    },
    orderBy: [{ startsAt: "desc" }],
    take: limit,
    select: { id: true, title: true, imagePath: true, targetUrl: true, slot: { select: { width: true, height: true } } },
  });
  if (ads.length) await db.advertisement.updateMany({ where: { id: { in: ads.map((a) => a.id) } }, data: { impressions: { increment: 1 } } });
  return ads;
}

/** Tıklama kaydı; güvenli hedef adresi döner */
export async function registerAdClick(auth: AuthContext, id: string): Promise<string> {
  const chamberId = chamberIdOf(auth);
  const ad = await db.advertisement.findFirst({ where: { id, slot: { chamberId }, status: "APPROVED" } });
  if (!ad) return "/magaza";
  await db.advertisement.update({ where: { id }, data: { clicks: { increment: 1 } } });
  const t = ad.targetUrl ?? "";
  return /^\/magaza(\/|$|\?)/.test(t) ? t : "/magaza";
}
