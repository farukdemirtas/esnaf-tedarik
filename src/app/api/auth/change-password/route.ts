import { homePanel, PANEL_PATHS } from "@/lib/permissions";
import { clientIpFromRequest, isSameOrigin, readCookie, seeOther } from "@/lib/http";
import { buildAuthContext } from "@/modules/auth/context";
import { SESSION_COOKIE } from "@/modules/auth/session";
import { changePassword } from "@/modules/auth/service";

const CODES = {
  INVALID_INPUT: "eksik",
  MISMATCH: "eslesmiyor",
  WRONG_CURRENT: "mevcut-yanlis",
  SAME_AS_OLD: "ayni",
  POLICY: "politika",
} as const;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Geçersiz istek kaynağı", { status: 403 });
  const token = readCookie(req, SESSION_COOKIE);
  const auth = token ? await buildAuthContext(token) : null;
  if (!auth) return seeOther("/giris");

  const form = await req.formData();
  const result = await changePassword(
    auth.userId,
    auth.sessionId,
    {
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword"),
      confirmPassword: form.get("confirmPassword"),
    },
    clientIpFromRequest(req),
  );
  if (!result.ok) return seeOther(`/sifre-degistir?hata=${CODES[result.error]}`);
  const panel = homePanel(auth.permissions);
  return seeOther(`${panel ? PANEL_PATHS[panel] : "/"}?sifre=degisti`);
}
