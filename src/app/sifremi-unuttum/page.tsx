import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Şifremi Unuttum" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // E-posta/SMS sağlayıcısı tanımlanana kadar şifre sıfırlama Oda üzerinden yapılır.
  const chamber = await db.chamber.findFirst({ where: { active: true }, select: { name: true, phone: true, email: true } });
  return (
    <AuthShell title="Şifremi Unuttum">
      <div className="space-y-4 text-slate-700">
        <p>
          Güvenliğiniz için şifre yenileme işlemi Oda tarafından yapılır. Kimliğiniz doğrulandıktan sonra size tek
          kullanımlık bir şifre yenileme bağlantısı iletilecektir.
        </p>
        {chamber && (
          <div className="card p-4 text-sm">
            <div className="font-semibold text-slate-900">{chamber.name}</div>
            {chamber.phone && <div className="mt-1">Telefon: {chamber.phone}</div>}
            {chamber.email && <div>E-posta: {chamber.email}</div>}
          </div>
        )}
        <Link href="/giris" className="btn-secondary w-full">
          Giriş sayfasına dön
        </Link>
      </div>
    </AuthShell>
  );
}
