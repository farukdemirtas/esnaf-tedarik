import { login } from "@/modules/auth/service";
import { clientIpFromRequest, isSameOrigin, safeNextPath, seeOther, sessionCookie } from "@/lib/http";
import { PANEL_PATHS } from "@/lib/permissions";

const ERROR_CODES: Record<string, string> = {
  INVALID: "gecersiz",
  RATE_LIMITED: "kilitli",
  USER_PASSIVE: "pasif",
  USER_LOCKED: "kilitli",
  SUPPLIER_NOT_APPROVED: "tedarikci-onaysiz",
  MEMBER_NOT_ACTIVE: "uye-pasif",
  NO_ROLE: "yetki-yok",
};

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Geçersiz istek kaynağı", { status: 403 });
  const form = await req.formData();
  const result = await login(
    { username: form.get("username"), password: form.get("password") },
    clientIpFromRequest(req),
    req.headers.get("user-agent"),
  );
  if (!result.ok) return seeOther(`/giris?hata=${ERROR_CODES[result.error] ?? "gecersiz"}`);

  // "next" yalnızca kullanıcının erişebileceği panel kökleriyle sınırlı değil; sayfa kendi korumasını yapar
  const next = safeNextPath(form.get("next")?.toString());
  const target =
    result.redirectTo === "/sifre-degistir" || !next || !Object.values(PANEL_PATHS).some((p) => next.startsWith(p))
      ? result.redirectTo
      : next;
  return seeOther(target, sessionCookie(result.token));
}
