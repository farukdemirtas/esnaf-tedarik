import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { pageArgs } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";

/** Kullanıcının kendi bildirimleri (her kullanıcı yalnızca kendisininkini görür) */

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listMyNotifications(auth: AuthContext, f: { page?: string; unread?: string }) {
  const { skip, take, page, size } = pageArgs(f.page, 30);
  const where = { userId: auth.userId, ...(f.unread === "1" ? { readAt: null } : {}) };
  const [items, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function markNotificationRead(auth: AuthContext, id: string) {
  const n = await db.notification.updateMany({ where: { id, userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
  if (n.count === 0 && !(await db.notification.findFirst({ where: { id, userId: auth.userId } }))) throw new NotFoundError("Bildirim bulunamadı.");
}

export async function markAllNotificationsRead(auth: AuthContext) {
  const r = await db.notification.updateMany({ where: { userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}
