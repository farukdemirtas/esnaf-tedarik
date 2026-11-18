import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/brand";
import { AuthShell } from "@/components/auth-shell";
import { getAuth } from "@/lib/auth/server";
import { homePanel, PANEL_PATHS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Giriş" };

const ERRORS: Record<string, string> = {
  gecersiz: "Kullanıcı adı veya şifre hatalı.",
  kilitli: "Çok fazla hatalı deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.",
  pasif: "Hesabınız pasif durumdadır. Lütfen Oda ile iletişime geçin.",
  "tedarikci-onaysiz": "Firma hesabınız henüz onaylanmamış veya askıya alınmıştır.",
  "uye-pasif": "Üyeliğiniz aktif değildir. Lütfen Oda ile iletişime geçin.",
  "yetki-yok": "Hesabınıza tanımlı bir yetki bulunmuyor. Lütfen Oda ile iletişime geçin.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string; next?: string; cikis?: string; sifirlandi?: string }>;
}) {
  const auth = await getAuth();
  if (auth) {
    const panel = homePanel(auth.permissions);
    redirect(auth.mustChangePassword ? "/sifre-degistir" : panel ? PANEL_PATHS[panel] : "/yetkisiz");
  }
  const sp = await searchParams;

  return (
    <AuthShell title="Sisteme Giriş" subtitle="Oda tarafından size verilen kullanıcı adı ve şifre ile giriş yapın.">
      <div className="space-y-4">
        {sp.hata && <Alert tone="error">{ERRORS[sp.hata] ?? ERRORS.gecersiz}</Alert>}
        {sp.cikis && <Alert tone="info">Güvenli çıkış yapıldı.</Alert>}
        {sp.sifirlandi && <Alert tone="success">Şifreniz yenilendi. Yeni şifrenizle giriş yapabilirsiniz.</Alert>}

        <form method="post" action={withBase("/api/auth/login")} className="space-y-4">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <div>
            <label htmlFor="username" className="label">
              Kullanıcı adı veya e-posta
            </label>
            <input id="username" name="username" className="input" autoComplete="username" required autoFocus maxLength={100} />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Şifre
            </label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required maxLength={200} />
          </div>
          <button type="submit" className="btn-primary w-full">
            Giriş Yap
          </button>
        </form>

        <div className="flex flex-col gap-2.5 border-t border-slate-200/80 pt-4 text-sm">
          <Link href="/sifremi-unuttum" className="font-medium text-brand-700 transition hover:text-brand-900 hover:underline">
            Şifremi unuttum
          </Link>
          <Link href="/basvuru" className="font-medium text-brand-700 transition hover:text-brand-900 hover:underline">
            Üyelik veya tedarikçi başvurusu
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
