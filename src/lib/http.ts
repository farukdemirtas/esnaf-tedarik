import { BASE_PATH, withBase } from "@/lib/base-path";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/modules/auth/session";

/**
 * CSRF koruması: durum değiştiren POST isteklerinde Origin başlığı,
 * isteğin geldiği host ile aynı olmalıdır. Origin yoksa istek reddedilir.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIpFromRequest(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

/** POST sonrası göreli yönlendirme (303 See Other) */
export function seeOther(location: string, setCookie?: string): Response {
  const headers = new Headers({ Location: withBase(location) });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 303, headers });
}

function secureFlag() {
  return (process.env.APP_URL ?? "").startsWith("https://") ? "; Secure" : "";
}

function cookiePath() {
  return BASE_PATH || "/";
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=${cookiePath()}; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureFlag()}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=${cookiePath()}; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** Yalnızca uygulama içi göreli yollara yönlendirmeye izin verir (açık yönlendirme koruması) */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}
