import { clientIpFromRequest, isSameOrigin, seeOther } from "@/lib/http";
import { resetPasswordWithToken } from "@/modules/auth/service";

const CODES = {
  INVALID_TOKEN: "gecersiz-baglanti",
  MISMATCH: "eslesmiyor",
  POLICY: "politika",
  INVALID_INPUT: "eksik",
} as const;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Geçersiz istek kaynağı", { status: 403 });
  const form = await req.formData();
  const token = form.get("token")?.toString() ?? "";
  const result = await resetPasswordWithToken(
    { token, newPassword: form.get("newPassword"), confirmPassword: form.get("confirmPassword") },
    clientIpFromRequest(req),
  );
  if (!result.ok) {
    if (result.error === "INVALID_TOKEN") return seeOther(`/sifre-sifirla?hata=${CODES.INVALID_TOKEN}`);
    return seeOther(`/sifre-sifirla?token=${encodeURIComponent(token)}&hata=${CODES[result.error]}`);
  }
  return seeOther("/giris?sifirlandi=1");
}
