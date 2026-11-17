import type { DueStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { pageArgs, z, zDate, zInt, zMoney, zOptText, zPeriod } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { DUES_SETTING_KEY, getDuesBlockThreshold } from "./dues";

/** Aidat yönetimi. Tahsilat sistem dışında yapılır; burada yalnızca kayıt tutulur. */

export const dueSchema = z.object({ period: zPeriod, amount: zMoney, dueDate: zDate });

async function findDue(auth: AuthContext, id: string) {
  const due = await db.membershipDue.findFirst({ where: { id, chamberId: chamberIdOf(auth) } });
  if (!due) throw new NotFoundError("Aidat kaydı bulunamadı.");
  return due;
}

export async function listDues(auth: AuthContext, f: { period?: string; status?: string; overdue?: string; q?: string; page?: string }) {
  assertPermission(auth, "dues.view");
  const chamberId = chamberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page, 50);
  const status = ["UNPAID", "PAID", "WAIVED"].includes(f.status ?? "") ? (f.status as DueStatus) : undefined;
  const q = f.q?.trim();
  const where: Prisma.MembershipDueWhereInput = {
    chamberId,
    ...(f.period && /^\d{4}-\d{2}$/.test(f.period) ? { period: f.period } : {}),
    ...(status ? { status } : {}),
    ...(f.overdue === "1" ? { status: "UNPAID", dueDate: { lt: new Date() } } : {}),
    ...(q ? { member: { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { registryNumber: { contains: q } }] } } : {}),
  };
  const [items, total, sums] = await Promise.all([
    db.membershipDue.findMany({
      where,
      orderBy: [{ period: "desc" }, { member: { businessName: "asc" } }],
      skip,
      take,
      include: { member: { select: { id: true, businessName: true, registryNumber: true } } },
    }),
    db.membershipDue.count({ where }),
    db.membershipDue.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true }),
  ]);
  return { items, total, page, size, sums };
}

/** Vadesi geçmiş aidatı olan üyeler ve sipariş engeli durumu */
export async function overdueMembers(auth: AuthContext) {
  assertPermission(auth, "dues.view");
  const chamberId = chamberIdOf(auth);
  const threshold = await getDuesBlockThreshold(chamberId);
  const groups = await db.membershipDue.groupBy({
    by: ["memberId"],
    where: { chamberId, status: "UNPAID", dueDate: { lt: new Date() } },
    _count: true,
    _sum: { amount: true },
  });
  const members = await db.member.findMany({
    where: { id: { in: groups.map((g) => g.memberId) } },
    select: { id: true, businessName: true, registryNumber: true, status: true },
  });
  const byId = new Map(members.map((m) => [m.id, m]));
  return {
    threshold,
    rows: groups
      .map((g) => ({ member: byId.get(g.memberId)!, count: g._count, amount: g._sum.amount, blocked: g._count >= threshold }))
      .filter((r) => r.member)
      .sort((a, b) => b.count - a.count),
  };
}

/** Bir dönem için tüm aktif üyelere aidat kaydı açar (var olanlar atlanır) */
export async function createDuesForPeriod(auth: AuthContext, input: unknown) {
  assertPermission(auth, "dues.manage");
  const chamberId = chamberIdOf(auth);
  const d = dueSchema.parse(input);
  const members = await db.member.findMany({ where: { chamberId, status: "ACTIVE" }, select: { id: true } });
  if (members.length === 0) throw new UserError("Aktif üye bulunmuyor.");
  const res = await db.membershipDue.createMany({
    data: members.map((m) => ({ chamberId, memberId: m.id, period: d.period, amount: d.amount, dueDate: d.dueDate, recordedById: auth.userId })),
    skipDuplicates: true,
  });
  await audit({ userId: auth.userId, action: "dues.createPeriod", data: { period: d.period, amount: d.amount, created: res.count } });
  return { created: res.count, skipped: members.length - res.count };
}

export async function addDue(auth: AuthContext, memberId: string, input: unknown) {
  assertPermission(auth, "dues.manage");
  const chamberId = chamberIdOf(auth);
  const member = await db.member.findFirst({ where: { id: memberId, chamberId } });
  if (!member) throw new NotFoundError("Üye bulunamadı.");
  const d = dueSchema.parse(input);
  const exists = await db.membershipDue.findUnique({ where: { memberId_period: { memberId, period: d.period } } });
  if (exists) throw new UserError("Bu üye için bu döneme ait aidat kaydı zaten var.", "period");
  const due = await db.membershipDue.create({
    data: { chamberId, memberId, period: d.period, amount: d.amount, dueDate: d.dueDate, recordedById: auth.userId },
  });
  await audit({ userId: auth.userId, action: "dues.add", entityType: "MembershipDue", entityId: due.id, data: { memberId, ...d } });
}

export async function markDuePaid(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "dues.manage");
  const due = await findDue(auth, id);
  const d = z.object({ paidAt: zDate, note: zOptText(300) }).parse(input);
  if (d.paidAt > new Date()) throw new UserError("Ödeme tarihi ileri bir tarih olamaz.", "paidAt");
  await db.membershipDue.update({ where: { id }, data: { status: "PAID", paidAt: d.paidAt, note: d.note ?? due.note, recordedById: auth.userId } });
  await audit({ userId: auth.userId, action: "dues.paid", entityType: "MembershipDue", entityId: id, data: { paidAt: d.paidAt } });
}

export async function waiveDue(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "dues.manage");
  await findDue(auth, id);
  const { note } = z.object({ note: z.string().trim().min(3, "Muafiyet gerekçesi girin.").max(300) }).parse(input);
  await db.membershipDue.update({ where: { id }, data: { status: "WAIVED", paidAt: null, note, recordedById: auth.userId } });
  await audit({ userId: auth.userId, action: "dues.waive", entityType: "MembershipDue", entityId: id, data: { note } });
}

export async function reopenDue(auth: AuthContext, id: string) {
  assertPermission(auth, "dues.manage");
  await findDue(auth, id);
  await db.membershipDue.update({ where: { id }, data: { status: "UNPAID", paidAt: null, recordedById: auth.userId } });
  await audit({ userId: auth.userId, action: "dues.reopen", entityType: "MembershipDue", entityId: id });
}

export async function deleteDue(auth: AuthContext, id: string) {
  assertPermission(auth, "dues.manage");
  const due = await findDue(auth, id);
  if (due.status !== "UNPAID") throw new UserError("Yalnızca ödenmemiş (hatalı girilmiş) kayıtlar silinebilir.");
  await db.membershipDue.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "dues.delete", entityType: "MembershipDue", entityId: id, data: { memberId: due.memberId, period: due.period } });
}

export async function updateDuesThreshold(auth: AuthContext, input: unknown) {
  assertPermission(auth, "settings.manage");
  const chamberId = chamberIdOf(auth);
  const { threshold } = z.object({ threshold: zInt(1, 24) }).parse(input);
  await db.setting.upsert({
    where: { chamberId_key: { chamberId, key: DUES_SETTING_KEY } },
    update: { value: threshold },
    create: { chamberId, key: DUES_SETTING_KEY, value: threshold },
  });
  await audit({ userId: auth.userId, action: "settings.duesThreshold", data: { threshold } });
}
