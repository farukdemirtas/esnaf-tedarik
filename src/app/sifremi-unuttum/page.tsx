import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/brand";
import { db } from "@/lib/db";
import { isEmailEnabled } from "@/lib/mailer";

export const metadata: Metadata = { title: "Şifremi Unuttum" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ gonderildi?: string; hata?: string }> }) {
  const sp = await searchParams;
  const emailOn = isEmailEnabled();
  const chamber = await db.chamber.findFirst({ where: { active: true }, select: { name: true, phone: true, email: true } });
  const contact = chamber && (
    <div className="card p-4 text-sm">
      <div className="font-semibold text-slate-900">{chamber.name}</div>
      {chamber.phone && <div className="mt-1">Telefon: {chamber.phone}</div>}
      {chamber.email && <div>E-posta: {chamber.email}</div>}
    </div>
  );
  return (
    <AuthShell title="Şifremi Unuttum">
      <div className="space-y-4 text-slate-700">
        {sp.gonderildi && (
          <Alert tone="success">
            Bilgileriniz kayıtlıysa şifre yenileme bağlantısı e-posta adresinize gönderildi. Gelen kutunuzu (ve istenmeyen e-posta klasörünü) kontrol edin. Bağlantı 1 saat geçerlidir.
          </Alert>
        )}
        {sp.hata === "cok-fazla" && <Alert tone="error">Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.</Alert>}
        {emailOn ? (
          <>
            <p>Kullanıcı adınızı veya kayıtlı e-posta adresinizi yazın; size tek kullanımlık bir şifre yenileme bağlantısı gönderelim.</p>
            <form method="post" action={withBase("/api/auth/forgot-password")} className="space-y-3">
              <div>
                <label htmlFor="identifier" className="label">Kullanıcı adı veya e-posta</label>
                <input id="identifier" name="identifier" required minLength={3} maxLength={150} autoComplete="username" className="input" />
              </div>
              <div aria-hidden className="hidden">
                <input name="website" tabIndex={-1} autoComplete="off" />
              </div>
              <button type="submit" className="btn-primary w-full">Bağlantı gönder</button>
            </form>
            <p className="text-sm text-slate-500">E-posta adresiniz kayıtlı değilse şifrenizi Oda yeniler:</p>
            {contact}
          </>
        ) : (
          <>
            <p>
              Güvenliğiniz için şifre yenileme işlemi Oda tarafından yapılır. Kimliğiniz doğrulandıktan sonra size tek kullanımlık bir şifre yenileme
              bağlantısı iletilecektir.
            </p>
            {contact}
          </>
        )}
        <Link href="/giris" className="btn-secondary w-full">
          Giriş sayfasına dön
        </Link>
      </div>
    </AuthShell>
  );
}
