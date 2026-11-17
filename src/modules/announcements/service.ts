import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { z, zBool, zOptDateTime, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";

export const announcementSchema = z.object({
  title: zText(150, 3),
  body: zText(5000, 3),
  audience: z.enum(["ALL", "MEMBERS", "SUPPLIERS", "STAFF"]),
  pinned: zBool,
  publishedAt: zOptDateTime,
  expiresAt: zOptDateTime,
});

function validateDates(d: z.infer<typeof announcementSchema>) {
  const pub = d.publishedAt ?? new Date();
  if (d.expiresAt && d.expiresAt <= pub) throw new UserError("Bitiş tarihi yayın tarihinden sonra olmalıdır.", "expiresAt");
  return pub;
}

export async function listAnnouncements(auth: AuthContext) {
  assertPermission(auth, "announcement.manage");
  return db.announcement.findMany({ where: { chamberId: chamberIdOf(auth) }, orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], take: 200 });
}

export async function getAnnouncement(auth: AuthContext, id: string) {
  assertPermission(auth, "announcement.manage");
  const a = await db.announcement.findFirst({ where: { id, chamberId: chamberIdOf(auth) } });
  if (!a) throw new NotFoundError("Duyuru bulunamadı.");
  return a;
}

export async function createAnnouncement(auth: AuthContext, input: unknown) {
  assertPermission(auth, "announcement.manage");
  const d = announcementSchema.parse(input);
  const publishedAt = validateDates(d);
  const a = await db.announcement.create({
    data: { chamberId: chamberIdOf(auth), title: d.title, body: d.body, audience: d.audience, pinned: d.pinned, publishedAt, expiresAt: d.expiresAt, createdById: auth.userId },
  });
  await audit({ userId: auth.userId, action: "announcement.create", entityType: "Announcement", entityId: a.id, data: { title: d.title, audience: d.audience } });
}

export async function updateAnnouncement(auth: AuthContext, id: string, input: unknown) {
  await getAnnouncement(auth, id);
  const d = announcementSchema.parse(input);
  const publishedAt = validateDates(d);
  await db.announcement.update({ where: { id }, data: { title: d.title, body: d.body, audience: d.audience, pinned: d.pinned, publishedAt, expiresAt: d.expiresAt ?? null } });
  await audit({ userId: auth.userId, action: "announcement.update", entityType: "Announcement", entityId: id, data: { title: d.title } });
}

export async function deleteAnnouncement(auth: AuthContext, id: string) {
  const a = await getAnnouncement(auth, id);
  await db.announcement.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "announcement.delete", entityType: "Announcement", entityId: id, data: { title: a.title } });
}

/** Panellerde gösterilecek yayındaki duyurular */
export async function activeAnnouncements(chamberId: string, audiences: ("ALL" | "MEMBERS" | "SUPPLIERS" | "STAFF")[], take = 5) {
  const now = new Date();
  return db.announcement.findMany({
    where: { chamberId, audience: { in: audiences }, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take,
  });
}
