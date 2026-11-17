import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { z, zBool, zDateTime, zId, zMoney, zOptText, zQuantity, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { primaryChamberId } from "@/modules/suppliers/self";

/**
 * Tedarikçi kampanyaları. Akış: Taslak → (onaya gönder) → Onay bekliyor → Oda onayı/reddi.
 * Yalnızca taslak veya reddedilmiş kampanya düzenlenebilir; reddedilen düzenlenince taslağa döner.
 */

const D = Prisma.Decimal;

export const campaignSchema = z.object({
  title: zText(150, 3),
  description: zOptText(1000),
  type: z.enum(["CHAMBER_SPECIAL", "VOLUME", "DATE_RANGE"]),
  membersOnly: zBool,
  startsAt: zDateTime,
  endsAt: zDateTime,
});

export const discountSchema = z.object({
  supplierProductId: zId,
  kind: z.enum(["FIXED_PRICE", "PERCENT", "AMOUNT"]),
  value: zMoney,
  minQty: zQuantity,
});

function validateDates(d: { startsAt: Date; endsAt: Date }) {
  if (d.endsAt <= d.startsAt) throw new UserError("Bitiş tarihi başlangıçtan sonra olmalıdır.", "endsAt");
  if (d.endsAt <= new Date()) throw new UserError("Bitiş tarihi geçmiş olamaz.", "endsAt");
}

async function findMyCampaign(auth: AuthContext, id: string) {
  const c = await db.campaign.findFirst({ where: { id, supplierId: supplierIdOf(auth) }, include: { _count: { select: { discounts: true, orderItems: true } } } });
  if (!c) throw new NotFoundError("Kampanya bulunamadı.");
  return c;
}

function assertEditable(c: { status: string }) {
  if (c.status !== "DRAFT" && c.status !== "REJECTED")
    throw new UserError("Yalnızca taslak veya reddedilmiş kampanyalar düzenlenebilir. Onay bekleyen kampanyayı önce geri çekin.");
}

export async function listMyCampaigns(auth: AuthContext) {
  assertPermission(auth, "supplierSelf.campaigns");
  return db.campaign.findMany({
    where: { supplierId: supplierIdOf(auth) },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: { _count: { select: { discounts: true, orderItems: true } } },
  });
}

export async function getMyCampaign(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await db.campaign.findFirst({
    where: { id, supplierId: supplierIdOf(auth) },
    include: {
      discounts: { include: { supplierProduct: { include: { product: { include: { brand: true } } } } }, orderBy: [{ supplierProductId: "asc" }, { minQty: "asc" }] },
      _count: { select: { orderItems: true } },
    },
  });
  if (!c) throw new NotFoundError("Kampanya bulunamadı.");
  return c;
}

export async function createMyCampaign(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.campaigns");
  const supplierId = supplierIdOf(auth);
  const d = campaignSchema.parse(input);
  validateDates(d);
  const c = await db.campaign.create({
    data: { ...d, description: d.description ?? null, chamberId: await primaryChamberId(supplierId), supplierId, status: "DRAFT" },
  });
  await audit({ userId: auth.userId, action: "supplierCampaign.create", entityType: "Campaign", entityId: c.id, data: { title: d.title } });
  return c;
}

export async function updateMyCampaign(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await findMyCampaign(auth, id);
  assertEditable(c);
  const d = campaignSchema.parse(input);
  validateDates(d);
  await db.campaign.update({ where: { id }, data: { ...d, description: d.description ?? null, status: "DRAFT" } });
  await audit({ userId: auth.userId, action: "supplierCampaign.update", entityType: "Campaign", entityId: id, data: { title: d.title } });
}

/** İndirim değerinin, ürünün normal paket fiyatına göre anlamlı olduğunu doğrular */
export function validateDiscountValue(kind: string, value: string, packPrice: Prisma.Decimal) {
  const v = new D(value);
  if (v.lte(0)) throw new UserError("İndirim değeri 0'dan büyük olmalıdır.", "value");
  if (kind === "PERCENT" && v.gte(100)) throw new UserError("Yüzde indirim 100'den küçük olmalıdır.", "value");
  if (kind === "FIXED_PRICE" && v.gte(packPrice)) throw new UserError(`Kampanya fiyatı normal fiyattan (${packPrice.toFixed(2)} ₺) düşük olmalıdır.`, "value");
  if (kind === "AMOUNT" && v.gte(packPrice)) throw new UserError(`İndirim tutarı normal fiyattan (${packPrice.toFixed(2)} ₺) küçük olmalıdır.`, "value");
}

export async function addMyDiscount(auth: AuthContext, campaignId: string, input: unknown) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await findMyCampaign(auth, campaignId);
  assertEditable(c);
  const d = discountSchema.parse(input);
  const offer = await db.supplierProduct.findFirst({ where: { id: d.supplierProductId, supplierId: supplierIdOf(auth), removedByAdmin: false } });
  if (!offer) throw new UserError("Geçerli bir ürününüzü seçin.", "supplierProductId");
  validateDiscountValue(d.kind, d.value, offer.packPrice);
  if (new D(d.minQty).lt(offer.minOrderQty)) throw new UserError(`Asgari miktar, ürünün asgari sipariş miktarından (${offer.minOrderQty.toString()}) az olamaz.`, "minQty");
  const dup = await db.discount.findFirst({ where: { campaignId, supplierProductId: d.supplierProductId, minQty: d.minQty } });
  if (dup) throw new UserError("Bu ürün için aynı asgari miktarla bir kademe zaten var.", "minQty");
  await db.$transaction([
    db.discount.create({ data: { campaignId, ...d } }),
    db.campaign.update({ where: { id: campaignId }, data: { status: "DRAFT" } }),
  ]);
  await audit({ userId: auth.userId, action: "supplierCampaign.discount.add", entityType: "Campaign", entityId: campaignId, data: d });
}

export async function removeMyDiscount(auth: AuthContext, discountId: string) {
  assertPermission(auth, "supplierSelf.campaigns");
  const disc = await db.discount.findFirst({ where: { id: discountId, campaign: { supplierId: supplierIdOf(auth) } }, include: { campaign: true } });
  if (!disc) throw new NotFoundError("İndirim bulunamadı.");
  assertEditable(disc.campaign);
  await db.discount.delete({ where: { id: discountId } });
  await audit({ userId: auth.userId, action: "supplierCampaign.discount.remove", entityType: "Campaign", entityId: disc.campaignId });
}

export async function submitMyCampaign(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await findMyCampaign(auth, id);
  if (c.status !== "DRAFT" && c.status !== "REJECTED") throw new UserError("Bu kampanya zaten onaya gönderilmiş veya sonuçlanmış.");
  if (c._count.discounts === 0) throw new UserError("Onaya göndermeden önce en az bir indirimli ürün ekleyin.");
  if (c.endsAt <= new Date()) throw new UserError("Kampanyanın bitiş tarihi geçmiş; tarihleri güncelleyin.");
  await db.campaign.update({ where: { id }, data: { status: "PENDING", reviewNote: null } });
  await audit({ userId: auth.userId, action: "supplierCampaign.submit", entityType: "Campaign", entityId: id });
}

export async function withdrawMyCampaign(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await findMyCampaign(auth, id);
  if (c.status !== "PENDING") throw new UserError("Yalnızca onay bekleyen kampanya geri çekilebilir.");
  await db.campaign.update({ where: { id }, data: { status: "DRAFT" } });
  await audit({ userId: auth.userId, action: "supplierCampaign.withdraw", entityType: "Campaign", entityId: id });
}

export async function deleteMyCampaign(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await findMyCampaign(auth, id);
  assertEditable(c);
  if (c._count.orderItems > 0) throw new UserError("Bu kampanyayla sipariş alınmış; silinemez.");
  await db.campaign.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "supplierCampaign.delete", entityType: "Campaign", entityId: id, data: { title: c.title } });
}

/** Yayındaki kampanyayı tedarikçi erken bitirebilir (ör. stok tükendi) */
export async function endMyCampaign(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.campaigns");
  const c = await findMyCampaign(auth, id);
  if (c.status !== "APPROVED") throw new UserError("Yalnızca yayındaki kampanya sonlandırılabilir.");
  await db.campaign.update({ where: { id }, data: { status: "ENDED", featured: false } });
  await audit({ userId: auth.userId, action: "supplierCampaign.end", entityType: "Campaign", entityId: id });
}
