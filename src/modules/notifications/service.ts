import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { isEmailEnabled } from "@/lib/mailer";

type Tx = PrismaClient | Prisma.TransactionClient;

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Bildirim oluşturur: her zaman panel içi (IN_APP); e-posta yapılandırılmışsa ayrıca EMAIL kaydı
 * (PENDING) eklenir ve bildirim işçisi (`npm run worker`) tarafından gönderilir. Böylece bildirim,
 * çağıran işlemle (ör. sipariş transaction'ı) birlikte kalıcı olur; gönderim hatası işlemi bozmaz.
 */
export async function notifyUsers(userIds: string[], n: NotificationInput, tx: Tx = db) {
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...n, channel: "IN_APP" as const, delivery: "SENT" as const })),
  });
  if (isEmailEnabled())
    await tx.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...n, channel: "EMAIL" as const, delivery: "PENDING" as const })),
    });
}

/** Bir tedarikçi firmanın tüm aktif kullanıcılarına bildirim */
export async function notifySupplier(supplierId: string, n: NotificationInput, tx: Tx = db) {
  const users = await tx.supplierUser.findMany({ where: { supplierId, user: { status: "ACTIVE" } }, select: { userId: true } });
  await notifyUsers(users.map((u) => u.userId), n, tx);
}

export async function notifyMember(memberId: string, n: NotificationInput, tx: Tx = db) {
  const users = await tx.memberUser.findMany({ where: { memberId, user: { status: "ACTIVE" } }, select: { userId: true } });
  await notifyUsers(users.map((u) => u.userId), n, tx);
}
