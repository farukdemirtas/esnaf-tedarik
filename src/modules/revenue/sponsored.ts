import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf, supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { z, zDateTime, zId, zInt, zOptMoney } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { supplierEntitlements } from "./packages";

/**
 * Sponsorlu ürünler: tedarikçi paket hakkı kadar teklifini öne çıkarır; Oda tümünü yönetebilir.
 * Üyeye yalnızca görünür tekliflerde, "Sponsorlu" etiketiyle gösterilir.
 */

export const sponsoredSchema = z.object({ supplierProductId: zId, startsAt: zDateTime, endsAt: zDateTime });

function checkDates(d: { startsAt: Date; endsAt: Date }) {
  if (d.endsAt <= d.startsAt) throw new UserError("Bitiş tarihi başlangıçtan sonra olmalıdır.", "endsAt");
  if (d.endsAt <= new Date()) throw new UserError("Bitiş tarihi geçmiş olamaz.", "endsAt");
}

const include = { supplierProduct: { include: { product: { select: { id: true, name: true } }, supplier: { select: { id: true, tradeName: true } } } } } as const;

export async function listMySponsored(auth: AuthContext) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const [items, offers, entitlements] = await Promise.all([
    db.sponsoredProduct.findMany({ where: { supplierProduct: { supplierId } }, orderBy: [{ active: "desc" }, { endsAt: "desc" }], include }),
    db.supplierProduct.findMany({ where: { supplierId, active: true, removedByAdmin: false }, include: { product: { select: { name: true } } }, orderBy: { product: { name: "asc" } } }),
    supplierEntitlements(supplierId),
  ]);
  const now = new Date();
  const used = items.filter((s) => s.active && s.endsAt > now).length;
  return { items, offers, entitlements, used };
}

export async function addMySponsored(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.marketing");
  const supplierId = supplierIdOf(auth);
  const d = sponsoredSchema.parse(input);
  checkDates(d);
  const offer = await db.supplierProduct.findFirst({ where: { id: d.supplierProductId, supplierId, active: true, removedByAdmin: false } });
  if (!offer) throw new UserError("Satıştaki bir ürününüzü seçin.", "supplierProductId");
  const { sponsoredSlots } = await supplierEntitlements(supplierId);
  const used = await db.sponsoredProduct.count({ where: { supplierProduct: { supplierId }, active: true, endsAt: { gt: new Date() } } });
  if (used >= sponsoredSlots)
    throw new UserError(sponsoredSlots === 0 ? "Sponsorlu ürün hakkınız yok. Vitrin/tanıtım paketi talep edin." : `Sponsorlu ürün hakkınızın tamamını (${sponsoredSlots}) kullanıyorsunuz.`);
  const s = await db.sponsoredProduct.create({ data: { supplierProductId: offer.id, startsAt: d.startsAt, endsAt: d.endsAt } });
  await audit({ userId: auth.userId, action: "sponsored.add", entityType: "SponsoredProduct", entityId: s.id });
  return s;
}

export async function stopMySponsored(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.marketing");
  const s = await db.sponsoredProduct.findFirst({ where: { id, supplierProduct: { supplierId: supplierIdOf(auth) } } });
  if (!s) throw new NotFoundError("Kayıt bulunamadı.");
  await db.sponsoredProduct.update({ where: { id }, data: { active: false } });
  await audit({ userId: auth.userId, action: "sponsored.stop", entityType: "SponsoredProduct", entityId: id });
}

// ───────────── Oda ─────────────

export async function listAllSponsored(auth: AuthContext) {
  assertPermission(auth, "ads.manage");
  const chamberId = chamberIdOf(auth);
  return db.sponsoredProduct.findMany({
    where: { supplierProduct: { product: { chamberId } } },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { endsAt: "desc" }],
    include,
    take: 200,
  });
}

export async function odaAddSponsored(auth: AuthContext, input: unknown) {
  assertPermission(auth, "ads.manage");
  const d = sponsoredSchema.extend({ sortOrder: zInt(0, 1000), fee: zOptMoney }).parse(input);
  checkDates(d);
  const offer = await db.supplierProduct.findFirst({ where: { id: d.supplierProductId, removedByAdmin: false, product: { chamberId: chamberIdOf(auth) } } });
  if (!offer) throw new UserError("Teklif bulunamadı.", "supplierProductId");
  const s = await db.sponsoredProduct.create({ data: { supplierProductId: offer.id, startsAt: d.startsAt, endsAt: d.endsAt, sortOrder: d.sortOrder, fee: d.fee ?? null } });
  await audit({ userId: auth.userId, action: "sponsored.odaAdd", entityType: "SponsoredProduct", entityId: s.id });
  return s;
}

export async function odaSetSponsoredActive(auth: AuthContext, id: string, active: boolean) {
  assertPermission(auth, "ads.manage");
  const s = await db.sponsoredProduct.findFirst({ where: { id, supplierProduct: { product: { chamberId: chamberIdOf(auth) } } } });
  if (!s) throw new NotFoundError("Kayıt bulunamadı.");
  await db.sponsoredProduct.update({ where: { id }, data: { active } });
  await audit({ userId: auth.userId, action: active ? "sponsored.activate" : "sponsored.stop", entityType: "SponsoredProduct", entityId: id });
}
