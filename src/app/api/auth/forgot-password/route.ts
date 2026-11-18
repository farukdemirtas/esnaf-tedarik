import { clientIpFromRequest, isSameOrigin, seeOther } from "@/lib/http";
import { requestPasswordResetByEmail } from "@/modules/auth/service";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Geçersiz istek kaynağı", { status: 403 });
  const form = await req.formData();
  if (form.get("website")) return seeOther("/sifremi-unuttum?gonderildi=1"); // bot tuzağı
  const r = await requestPasswordResetByEmail(form.get("identifier"), clientIpFromRequest(req));
  if (r === "RATE_LIMITED") return seeOther("/sifremi-unuttum?hata=cok-fazla");
  if (r === "DISABLED") return seeOther("/sifremi-unuttum");
  return seeOther("/sifremi-unuttum?gonderildi=1");
}
