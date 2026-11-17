import type { Prisma, UserStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission, hasRole } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { ForbiddenError, NotFoundError, UserError } from "@/lib/errors";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";
import { pageArgs, z, zOptEmail, zOptPhone, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { createAccount, issueTempPassword } from "./accounts";

/** Kişiye özel olarak verilebilecek/kaldırılabilecek izinler (Oda kullanıcıları için) */
export const OVERRIDABLE_PERMISSIONS = (Object.keys(PERMISSIONS) as PermissionCode[]).filter(
  (p) => !p.startsWith("panel.") && !p.startsWith("supplierSelf.") && !p.startsWith("memberSelf."),
);

const ADMIN_ROLES = ["CHAMBER_ADMIN", "SUPER_ADMIN"];

export const chamberUserSchema = z.object({
  fullName: zText(100, 2),
  username: zText(50, 3),
  email: zOptEmail,
  phone: zOptPhone,
  role: z.enum(["CHAMBER_ADMIN", "CHAMBER_STAFF"]),
});

export async function listUsers(auth: AuthContext, f: { q?: string; type?: string; status?: string; page?: string }) {
  assertPermission(auth, "user.manage");
  const { skip, take, page, size } = pageArgs(f.page);
  const q = f.q?.trim();
  const status = ["ACTIVE", "PASSIVE", "LOCKED"].includes(f.status ?? "") ? (f.status as UserStatus) : undefined;
  const scope = f.type === "supplier" ? "SUPPLIER" : f.type === "member" ? "MEMBER" : f.type === "chamber" ? "CHAMBER" : undefined;
  const where: Prisma.UserWhereInput = {
    chamberId: chamberIdOf(auth),
    ...(status ? { status } : {}),
    ...(scope ? { roles: { some: { role: { scope: scope === "CHAMBER" ? { in: ["CHAMBER", "PLATFORM"] } : scope } } } } : {}),
    ...(q ? { OR: [{ username: { contains: q.toLowerCase() } }, { fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { username: "asc" },
      skip,
      take,
      include: {
        roles: { include: { role: true } },
        supplierUser: { include: { supplier: { select: { id: true, tradeName: true } } } },
        memberUser: { include: { member: { select: { id: true, businessName: true } } } },
      },
    }),
    db.user.count({ where }),
  ]);
  return { items, total, page, size };
}

async function findUser(auth: AuthContext, id: string) {
  const u = await db.user.findFirst({
    where: { id, chamberId: chamberIdOf(auth) },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      permissions: { include: { permission: true } },
      supplierUser: { include: { supplier: { select: { id: true, tradeName: true } } } },
      memberUser: { include: { member: { select: { id: true, businessName: true } } } },
    },
  });
  if (!u) throw new NotFoundError("Kullanıcı bulunamadı.");
  return u;
}

export async function getUser(auth: AuthContext, id: string) {
  assertPermission(auth, "user.manage");
  const u = await findUser(auth, id);
  const recentLogins = await db.loginAttempt.findMany({ where: { username: u.username }, orderBy: { createdAt: "desc" }, take: 10 });
  return { user: u, recentLogins };
}

function isChamberUser(u: { roles: { role: { scope: string } }[] }) {
  return u.roles.some((r) => r.role.scope === "CHAMBER" || r.role.scope === "PLATFORM");
}
function isAdminUser(u: { roles: { role: { code: string } }[] }) {
  return u.roles.some((r) => ADMIN_ROLES.includes(r.role.code));
}

/** Yönetici hesaplarına yalnızca yöneticiler dokunabilir; kişi kendi hesabını buradan değiştiremez */
function assertCanManage(auth: AuthContext, target: Awaited<ReturnType<typeof findUser>>) {
  if (target.id === auth.userId) throw new UserError("Kendi hesabınızda bu işlemi yapamazsınız.");
  if (isAdminUser(target) && !hasRole(auth, ...ADMIN_ROLES)) throw new ForbiddenError("Yönetici hesapları yalnızca yöneticiler tarafından değiştirilebilir.");
}

export async function createChamberUser(auth: AuthContext, input: unknown) {
  assertPermission(auth, "user.manage");
  const d = chamberUserSchema.parse(input);
  if (d.role === "CHAMBER_ADMIN" && !hasRole(auth, ...ADMIN_ROLES)) throw new ForbiddenError("Yönetici hesabını yalnızca yöneticiler oluşturabilir.");
  return db.$transaction(async (tx) => {
    const acc = await createAccount(tx, { chamberId: chamberIdOf(auth), username: d.username, fullName: d.fullName, email: d.email, phone: d.phone, role: d.role });
    await audit({ userId: auth.userId, action: "user.create", entityType: "User", entityId: acc.user.id, data: { username: acc.username, role: d.role } }, tx);
    return { userId: acc.user.id, username: acc.username, tempPassword: acc.tempPassword };
  });
}

export async function updateUserProfile(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "user.manage");
  const target = await findUser(auth, id);
  if (target.id !== auth.userId) assertCanManage(auth, target);
  const d = z.object({ fullName: zText(100, 2), email: zOptEmail, phone: zOptPhone }).parse(input);
  if (d.email) {
    const clash = await db.user.findFirst({ where: { email: d.email, id: { not: id } } });
    if (clash) throw new UserError("Bu e-posta adresi başka bir kullanıcıda kayıtlı.", "email");
  }
  await db.user.update({ where: { id }, data: { fullName: d.fullName, email: d.email ?? null, phone: d.phone ?? null } });
  await audit({ userId: auth.userId, action: "user.update", entityType: "User", entityId: id, data: d });
}

export async function setUserActive(auth: AuthContext, id: string, active: boolean) {
  assertPermission(auth, "user.manage");
  const target = await findUser(auth, id);
  assertCanManage(auth, target);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status: active ? "ACTIVE" : "PASSIVE", ...(active ? { lockedUntil: null, failedLoginCount: 0 } : {}) } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await audit({ userId: auth.userId, action: active ? "user.activate" : "user.deactivate", entityType: "User", entityId: id }, tx);
  });
}

export async function unlockUser(auth: AuthContext, id: string) {
  assertPermission(auth, "user.manage");
  const target = await findUser(auth, id);
  assertCanManage(auth, target);
  await db.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0, ...(target.status === "LOCKED" ? { status: "ACTIVE" } : {}) } });
  await audit({ userId: auth.userId, action: "user.unlock", entityType: "User", entityId: id });
}

export async function resetUserPassword(auth: AuthContext, id: string) {
  assertPermission(auth, "user.manage");
  const target = await findUser(auth, id);
  assertCanManage(auth, target);
  return db.$transaction(async (tx) => {
    const tempPassword = await issueTempPassword(tx, id);
    await audit({ userId: auth.userId, action: "user.passwordReset", entityType: "User", entityId: id }, tx);
    return { username: target.username, tempPassword };
  });
}

/**
 * Kişiye özel izinler: her izin için "inherit" (rolden gelsin), "grant" (ver) veya "deny" (kaldır).
 * Kurallar: yalnızca Oda kullanıcılarına uygulanır; kişi kendi iznini değiştiremez;
 * sahip olmadığı bir izni başkasına veremez (yetki yükseltme engeli).
 */
export async function setUserPermissions(auth: AuthContext, id: string, input: Record<string, unknown>) {
  assertPermission(auth, "user.manage");
  const target = await findUser(auth, id);
  assertCanManage(auth, target);
  if (!isChamberUser(target)) throw new UserError("Kişiye özel izinler yalnızca Oda kullanıcıları için tanımlanabilir.");

  const desired = new Map<string, "grant" | "deny">();
  for (const code of OVERRIDABLE_PERMISSIONS) {
    const v = input[`perm.${code}`];
    if (v === "grant" || v === "deny") desired.set(code, v);
  }
  for (const [code, v] of desired)
    if (v === "grant" && !auth.permissions.has(code)) throw new ForbiddenError(`Sahip olmadığınız bir izni veremezsiniz: ${PERMISSIONS[code as PermissionCode].description}`);

  const perms = await db.permission.findMany({ where: { code: { in: [...desired.keys()] } } });
  await db.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: id } });
    if (perms.length)
      await tx.userPermission.createMany({ data: perms.map((p) => ({ userId: id, permissionId: p.id, granted: desired.get(p.code) === "grant" })) });
    // Yetki değişikliği hemen etkili olur (her istekte yeniden okunur); güvenlik için açık oturumlar kapatılır
    await tx.session.deleteMany({ where: { userId: id } });
    await audit({ userId: auth.userId, action: "user.permissions", entityType: "User", entityId: id, data: Object.fromEntries(desired) }, tx);
  });
}
