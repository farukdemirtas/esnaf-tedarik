import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

export const SESSION_COOKIE = "et_session";
/** Mutlak oturum süresi */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Bu süre boyunca hiç işlem yapılmazsa oturum düşer */
export const SESSION_IDLE_MS = 3 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export async function createSession(userId: string, ip?: string | null, userAgent?: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      ip: ip ?? null,
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/** Token'ı doğrular; geçersiz/süresi dolmuş oturumu siler. */
export async function validateSessionToken(token: string) {
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + SESSION_IDLE_MS <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

export async function revokeSessionToken(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

/** Kullanıcının tüm oturumlarını kapatır (pasife alma, şifre değişikliği). */
export async function revokeAllUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
