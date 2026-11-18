import { db } from "@/lib/db";
import { isEmailEnabled, sendMail } from "@/lib/mailer";

/**
 * Bekleyen e-posta bildirimlerini gönderir. Tek işçi süreci varsayılır (`npm run worker`).
 * Adres önceliği: kullanıcının e-postası → üye işletmenin e-postası → tedarikçi firmanın e-postası.
 * Adres yoksa SKIPPED, gönderim hatasında FAILED olarak işaretlenir (3 denemeden sonra).
 */

export async function resolveEmail(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true, memberUser: { select: { member: { select: { email: true } } } }, supplierUser: { select: { supplier: { select: { email: true } } } } },
  });
  if (!u || u.status !== "ACTIVE") return null;
  const e = u.email ?? u.memberUser?.member.email ?? u.supplierUser?.supplier.email ?? null;
  return e && !e.endsWith(".invalid") ? e : null;
}

export function absoluteLink(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${link.startsWith("/") ? link : `/${link}`}` : undefined;
}

export async function dispatchPendingEmails(limit = 50) {
  if (!isEmailEnabled()) return { sent: 0, skipped: 0, failed: 0 };
  const pending = await db.notification.findMany({ where: { channel: "EMAIL", delivery: "PENDING" }, orderBy: { createdAt: "asc" }, take: limit });
  const r = { sent: 0, skipped: 0, failed: 0 };
  for (const n of pending) {
    const to = await resolveEmail(n.userId);
    if (!to) {
      await db.notification.update({ where: { id: n.id }, data: { delivery: "SKIPPED" } });
      r.skipped++;
      continue;
    }
    try {
      await sendMail({ to, subject: n.title, text: n.message, link: absoluteLink(n.link) });
      await db.notification.update({ where: { id: n.id }, data: { delivery: "SENT" } });
      r.sent++;
    } catch (e) {
      console.error("[e-posta]", n.id, e instanceof Error ? e.message : e);
      await db.notification.update({ where: { id: n.id }, data: { delivery: "FAILED" } });
      r.failed++;
    }
  }
  return r;
}
