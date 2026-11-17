import type { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { pageArgs, z, zBool, zOptText, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifySupplier } from "@/modules/notifications/service";

/** Oda'nın kampanya onay süreci. Kampanyalar tedarikçi panelinde oluşturulur (Aşama 4). */

export async function listCampaigns(auth: AuthContext, f: { status?: string; page?: string }) {
  assertPermission(auth, "campaign.review");
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "APPROVED", "REJECTED", "ENDED", "DRAFT"].includes(f.status ?? "") ? (f.status as CampaignStatus) : undefined;
  const where = { chamberId: chamberIdOf(auth), ...(status ? { status } : { status: { not: "DRAFT" as const } }) };
  const [items, total] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      skip,
      take,
      include: { supplier: { select: { id: true, tradeName: true } }, _count: { select: { discounts: true, orderItems: true } } },
    }),
    db.campaign.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function getCampaign(auth: AuthContext, id: string) {
  assertPermission(auth, "campaign.review");
  const c = await db.campaign.findFirst({
    where: { id, chamberId: chamberIdOf(auth) },
    include: {
      supplier: { select: { id: true, tradeName: true } },
      discounts: { include: { supplierProduct: { include: { product: { include: { brand: true } } } } }, orderBy: { minQty: "asc" } },
      _count: { select: { orderItems: true } },
    },
  });
  if (!c) throw new NotFoundError("Kampanya bulunamadı.");
  return c;
}

async function findCampaign(auth: AuthContext, id: string) {
  const c = await db.campaign.findFirst({ where: { id, chamberId: chamberIdOf(auth) }, include: { _count: { select: { discounts: true } } } });
  if (!c) throw new NotFoundError("Kampanya bulunamadı.");
  return c;
}

export async function approveCampaign(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "campaign.review");
  const c = await findCampaign(auth, id);
  if (c.status !== "PENDING") throw new UserError("Yalnızca onay bekleyen kampanyalar onaylanabilir.");
  if (c.endsAt <= new Date()) throw new UserError("Kampanyanın bitiş tarihi geçmiş; onaylanamaz.");
  if (c._count.discounts === 0) throw new UserError("Kampanyada indirimli ürün tanımlı değil.");
  const { note, featured } = z.object({ note: zOptText(500), featured: zBool }).parse(input);
  await db.campaign.update({
    where: { id },
    data: { status: "APPROVED", reviewNote: note ?? null, reviewedById: auth.userId, reviewedAt: new Date(), featured },
  });
  await notifySupplier(c.supplierId, { type: "campaign.approved", title: "Kampanyanız onaylandı", message: `"${c.title}" onaylandı ve belirtilen tarihlerde üyelere gösterilecek.`, link: "/tedarikci" });
  await audit({ userId: auth.userId, action: "campaign.approve", entityType: "Campaign", entityId: id, data: { note, featured } });
}

export async function rejectCampaign(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "campaign.review");
  const c = await findCampaign(auth, id);
  if (c.status !== "PENDING") throw new UserError("Yalnızca onay bekleyen kampanyalar reddedilebilir.");
  const { note } = z.object({ note: zText(500, 3) }).parse(input);
  await db.campaign.update({ where: { id }, data: { status: "REJECTED", reviewNote: note, reviewedById: auth.userId, reviewedAt: new Date() } });
  await notifySupplier(c.supplierId, { type: "campaign.rejected", title: "Kampanyanız reddedildi", message: `"${c.title}": ${note}`, link: "/tedarikci" });
  await audit({ userId: auth.userId, action: "campaign.reject", entityType: "Campaign", entityId: id, data: { note } });
}

export async function setCampaignFeatured(auth: AuthContext, id: string, featured: boolean) {
  assertPermission(auth, "campaign.review");
  const c = await findCampaign(auth, id);
  if (c.status !== "APPROVED") throw new UserError("Yalnızca onaylı kampanyalar ana sayfada öne çıkarılabilir.");
  await db.campaign.update({ where: { id }, data: { featured } });
  await audit({ userId: auth.userId, action: featured ? "campaign.feature" : "campaign.unfeature", entityType: "Campaign", entityId: id });
}

export async function endCampaign(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "campaign.review");
  const c = await findCampaign(auth, id);
  if (c.status !== "APPROVED") throw new UserError("Yalnızca yayındaki kampanyalar sonlandırılabilir.");
  const { note } = z.object({ note: zText(500, 3) }).parse(input);
  await db.campaign.update({ where: { id }, data: { status: "ENDED", featured: false, reviewNote: note } });
  await notifySupplier(c.supplierId, { type: "campaign.ended", title: "Kampanyanız sonlandırıldı", message: `"${c.title}" Oda tarafından sonlandırıldı: ${note}`, link: "/tedarikci" });
  await audit({ userId: auth.userId, action: "campaign.end", entityType: "Campaign", entityId: id, data: { note } });
}
