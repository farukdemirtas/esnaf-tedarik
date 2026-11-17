import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = PrismaClient | Prisma.TransactionClient;

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  link?: string;
}

/** Panel içi bildirim oluşturur. E-posta/SMS kanalları sağlayıcı seçilince eklenecek. */
export async function notifyUsers(userIds: string[], n: NotificationInput, tx: Tx = db) {
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...n, channel: "IN_APP" as const, delivery: "SENT" as const })),
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
