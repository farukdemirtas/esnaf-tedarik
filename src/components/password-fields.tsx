import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

export function NewPasswordFields() {
  return (
    <>
      <div>
        <label htmlFor="newPassword" className="label">
          Yeni şifre
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={128}
        />
        <p className="mt-1 text-xs text-slate-500">
          En az {PASSWORD_MIN_LENGTH} karakter; en az bir harf ve bir rakam içermeli.
        </p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="label">
          Yeni şifre (tekrar)
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={128}
        />
      </div>
    </>
  );
}

export const PASSWORD_ERRORS: Record<string, string> = {
  eksik: "Lütfen tüm alanları doldurun.",
  eslesmiyor: "Yeni şifreler birbiriyle eşleşmiyor.",
  "mevcut-yanlis": "Mevcut şifreniz hatalı.",
  ayni: "Yeni şifre mevcut şifreden farklı olmalıdır.",
  politika: `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı, harf ve rakam içermeli ve kullanıcı adınızı içermemelidir.`,
  "gecersiz-baglanti": "Şifre yenileme bağlantısı geçersiz veya süresi dolmuş. Lütfen Oda'dan yeni bağlantı isteyin.",
};
