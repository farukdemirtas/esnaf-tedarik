import { audit } from "@/lib/audit";
import { clearSessionCookie, clientIpFromRequest, isSameOrigin, readCookie, seeOther } from "@/lib/http";
import { SESSION_COOKIE, revokeSessionToken, validateSessionToken } from "@/modules/auth/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Geçersiz istek kaynağı", { status: 403 });
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const session = await validateSessionToken(token);
    await revokeSessionToken(token);
    if (session) await audit({ userId: session.userId, action: "auth.logout", ip: clientIpFromRequest(req) });
  }
  return seeOther("/giris?cikis=1", clearSessionCookie());
}
