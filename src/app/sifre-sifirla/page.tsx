import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { AuthShell } from "@/components/auth-shell";
import { NewPasswordFields, PASSWORD_ERRORS } from "@/components/password-fields";

export const metadata: Metadata = { title: "Şifre Yenile", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; hata?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Yeni Şifre Belirle">
      <div className="space-y-4">
        {sp.hata && <Alert tone="error">{PASSWORD_ERRORS[sp.hata] ?? PASSWORD_ERRORS.eksik}</Alert>}
        {sp.token ? (
          <form method="post" action={withBase("/api/auth/reset-password")} className="space-y-4">
            <input type="hidden" name="token" value={sp.token} />
            <NewPasswordFields />
            <button type="submit" className="btn-primary w-full">
              Şifremi Kaydet
            </button>
          </form>
        ) : (
          !sp.hata && <Alert tone="error">{PASSWORD_ERRORS["gecersiz-baglanti"]}</Alert>
        )}
        <Link href="/giris" className="block text-sm text-brand-600 hover:underline">
          Giriş sayfasına dön
        </Link>
      </div>
    </AuthShell>
  );
}
