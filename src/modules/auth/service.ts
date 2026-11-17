import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { homePanel, PANEL_PATHS, resolvePermissions } from "@/lib/permissions";
import { burnPasswordCheck, checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/auth/password";
import { normalizeUsername } from "@/lib/auth/username";
import { loadEligibleUser, type IneligibleReason } from "./context";
import { createSession, revokeAllUserSessions } from "./session";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS_PER_USER = 5;
export const MAX_FAILS_PER_IP = 30;
export const LOCK_MS = 15 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export type LoginError = "INVALID" | "RATE_LIMITED" | IneligibleReason;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; redirectTo: string }
  | { ok: false; error: LoginError };

export async function login(input: unknown, ip: string | null, userAgent: string | null): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const username = normalizeUsername(parsed.data.username);
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);

  // IP bazlı kaba kuvvet koruması
  if (ip) {
    const ipFails = await db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } });
    if (ipFails >= MAX_FAILS_PER_IP) {
      await audit({ action: "auth.login.rateLimited", data: { username, scope: "ip" }, ip });
      return { ok: false, error: "RATE_LIMITED" };
    }
  }

  const user = await db.user.findFirst({
    where: { OR: [{ username }, { email: username }] },
    select: { id: true, passwordHash: true, lockedUntil: true },
  });

  if (!user) {
    await burnPasswordCheck(parsed.data.password);
    await db.loginAttempt.create({ data: { username, ip, success: false } });
    return { ok: false, error: "INVALID" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await db.loginAttempt.create({ data: { username, ip, success: false } });
    return { ok: false, error: "RATE_LIMITED" };
  }

  const valid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!valid) {
    await db.loginAttempt.create({ data: { username, ip, success: false } });
    const updated = await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILS_PER_USER) {
      await db.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + LOCK_MS), failedLoginCount: 0 },
      });
      await audit({ userId: user.id, action: "auth.login.locked", entityType: "User", entityId: user.id, ip });
    }
    return { ok: false, error: "INVALID" };
  }

  const eligible = await loadEligibleUser(user.id);
  if (!eligible.ok) {
    await db.loginAttempt.create({ data: { username, ip, success: false } });
    await audit({ userId: user.id, action: "auth.login.denied", data: { reason: eligible.reason }, ip });
    return { ok: false, error: eligible.reason };
  }

  const u = eligible.user;
  const perms = resolvePermissions(
    u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)),
    u.permissions.map((p) => ({ code: p.permission.code, granted: p.granted })),
  );
  const panel = homePanel(perms);
  if (!panel) return { ok: false, error: "NO_ROLE" };

  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.loginAttempt.create({ data: { username, ip, success: true } }),
  ]);
  const { token, expiresAt } = await createSession(u.id, ip, userAgent);
  await audit({ userId: u.id, action: "auth.login", ip });

  return { ok: true, token, expiresAt, redirectTo: u.mustChangePassword ? "/sifre-degistir" : PANEL_PATHS[panel] };
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(1).max(200),
    confirmPassword: z.string().min(1).max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "MISMATCH" });

export type ChangePasswordError = "INVALID_INPUT" | "MISMATCH" | "WRONG_CURRENT" | "SAME_AS_OLD" | "POLICY";

export async function changePassword(
  userId: string,
  sessionId: string,
  input: unknown,
  ip: string | null,
): Promise<{ ok: true } | { ok: false; error: ChangePasswordError; message?: string }> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === "MISMATCH");
    return { ok: false, error: mismatch ? "MISMATCH" : "INVALID_INPUT" };
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    await audit({ userId, action: "auth.password.changeFailed", ip });
    return { ok: false, error: "WRONG_CURRENT" };
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) return { ok: false, error: "SAME_AS_OLD" };
  const policy = checkPasswordPolicy(parsed.data.newPassword, user.username);
  if (policy) return { ok: false, error: "POLICY", message: policy };

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });
  // Diğer cihazlardaki oturumlar kapatılır
  await revokeAllUserSessions(userId, sessionId);
  await audit({ userId, action: "auth.password.changed", entityType: "User", entityId: userId, ip });
  return { ok: true };
}

/**
 * Şifre sıfırlama bağlantısı oluşturur. Yetkili kullanıcı (Oda) tarafından çağrılır;
 * e-posta sağlayıcısı tanımlanana kadar bağlantı yöneticiye gösterilir ve kişiye iletilir.
 */
export async function createPasswordResetToken(userId: string, createdById: string | null, ip: string | null) {
  const token = randomToken(32);
  await db.$transaction([
    db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordResetToken.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    }),
  ]);
  await audit({ userId: createdById, action: "auth.reset.created", entityType: "User", entityId: userId, ip });
  return token;
}

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(100),
    newPassword: z.string().min(1).max(200),
    confirmPassword: z.string().min(1).max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "MISMATCH" });

export async function resetPasswordWithToken(
  input: unknown,
  ip: string | null,
): Promise<{ ok: true } | { ok: false; error: "INVALID_TOKEN" | "MISMATCH" | "POLICY" | "INVALID_INPUT"; message?: string }> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === "MISMATCH");
    return { ok: false, error: mismatch ? "MISMATCH" : "INVALID_INPUT" };
  }
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return { ok: false, error: "INVALID_TOKEN" };
  const policy = checkPasswordPolicy(parsed.data.newPassword, record.user.username);
  if (policy) return { ok: false, error: "POLICY", message: policy };

  await db.$transaction([
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
  ]);
  await revokeAllUserSessions(record.userId);
  await audit({ userId: record.userId, action: "auth.reset.used", entityType: "User", entityId: record.userId, ip });
  return { ok: true };
}
