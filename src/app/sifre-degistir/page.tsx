import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import { Alert } from "@/components/brand";
import { AuthShell } from "@/components/auth-shell";
import { NewPasswordFields, PASSWORD_ERRORS } from "@/components/password-fields";
import { requireUser } from "@/lib/auth/server";
import { homePanel, PANEL_PATHS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Şifre Değiştir" };

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  const auth = await requireUser({ allowPasswordChange: true });
  const sp = await searchParams;
  const panel = homePanel(auth.permissions);

  return (
    <AuthShell
      title="Şifre Değiştir"
      subtitle={
        auth.mustChangePassword
          ? "Güvenliğiniz için ilk girişte size verilen şifreyi değiştirmeniz gerekiyor."
          : `${auth.fullName} — hesabınızın şifresini değiştirin.`
      }
    >
      <div className="space-y-4">
        {sp.hata && <Alert tone="error">{PASSWORD_ERRORS[sp.hata] ?? PASSWORD_ERRORS.eksik}</Alert>}
        <form method="post" action={withBase("/api/auth/change-password")} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="label">
              Mevcut şifre
            </label>
            <input id="currentPassword" name="currentPassword" type="password" className="input" autoComplete="current-password" required />
          </div>
          <NewPasswordFields />
          <button type="submit" className="btn-primary w-full">
            Şifreyi Değiştir
          </button>
        </form>
        <p className="text-xs text-slate-500">Şifre değiştiğinde diğer cihazlardaki oturumlarınız kapatılır.</p>
        <div className="flex gap-2 border-t border-slate-200 pt-4">
          {!auth.mustChangePassword && panel && (
            <a href={PANEL_PATHS[panel]} className="btn-secondary flex-1">
              Panele dön
            </a>
          )}
          <form method="post" action={withBase("/api/auth/logout")} className="flex-1">
            <button className="btn-secondary w-full" type="submit">
              Çıkış
            </button>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
