import { db } from "@/lib/db";
import { resolvePermissions } from "@/lib/permissions";
import { getMemberDuesState, type DuesState } from "@/modules/members/dues";
import { validateSessionToken } from "./session";

export interface AuthContext {
  sessionId: string;
  userId: string;
  username: string;
  fullName: string;
  chamberId: string | null;
  roles: string[];
  permissions: Set<string>;
  mustChangePassword: boolean;
  supplier: { id: string; name: string } | null;
  member: { id: string; name: string; dues: DuesState } | null;
}

export type IneligibleReason =
  | "USER_PASSIVE"
  | "USER_LOCKED"
  | "SUPPLIER_NOT_APPROVED"
  | "MEMBER_NOT_ACTIVE"
  | "NO_ROLE";

const userInclude = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  permissions: { include: { permission: true } },
  supplierUser: { include: { supplier: true } },
  memberUser: { include: { member: true } },
} as const;

/** Hesabın sisteme girebilecek durumda olup olmadığını kontrol eder (her istekte de çalışır). */
export async function loadEligibleUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user) return { ok: false as const, reason: "USER_PASSIVE" as IneligibleReason };
  if (user.status === "PASSIVE") return { ok: false as const, reason: "USER_PASSIVE" as IneligibleReason };
  if (user.status === "LOCKED" || (user.lockedUntil && user.lockedUntil > new Date()))
    return { ok: false as const, reason: "USER_LOCKED" as IneligibleReason };
  if (user.supplierUser && user.supplierUser.supplier.status !== "APPROVED")
    return { ok: false as const, reason: "SUPPLIER_NOT_APPROVED" as IneligibleReason };
  if (user.memberUser && user.memberUser.member.status !== "ACTIVE")
    return { ok: false as const, reason: "MEMBER_NOT_ACTIVE" as IneligibleReason };
  if (user.roles.length === 0) return { ok: false as const, reason: "NO_ROLE" as IneligibleReason };
  return { ok: true as const, user };
}

export async function buildAuthContext(token: string): Promise<AuthContext | null> {
  const session = await validateSessionToken(token);
  if (!session) return null;
  const res = await loadEligibleUser(session.userId);
  if (!res.ok) {
    // Hesap pasife alınmış / firma askıya alınmışsa oturum anında geçersizdir
    await db.session.deleteMany({ where: { userId: session.userId } });
    return null;
  }
  const u = res.user;
  const rolePerms = u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code));
  const overrides = u.permissions.map((p) => ({ code: p.permission.code, granted: p.granted }));

  let member: AuthContext["member"] = null;
  if (u.memberUser) {
    const m = u.memberUser.member;
    member = { id: m.id, name: m.businessName, dues: await getMemberDuesState(m.id, m.chamberId) };
  }

  return {
    sessionId: session.id,
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    chamberId: u.chamberId,
    roles: u.roles.map((r) => r.role.code),
    permissions: resolvePermissions(rolePerms, overrides),
    mustChangePassword: u.mustChangePassword,
    supplier: u.supplierUser ? { id: u.supplierUser.supplier.id, name: u.supplierUser.supplier.tradeName } : null,
    member,
  };
}
