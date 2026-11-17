import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { getAuth } from "@/lib/auth/server";
import { homePanel, PANEL_PATHS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Yetkisiz Erişim" };

export default async function ForbiddenPage() {
  const auth = await getAuth();
  const panel = auth ? homePanel(auth.permissions) : null;
  return (
    <AuthShell title="Bu sayfaya erişim yetkiniz yok" subtitle="Erişim denemesi kayıt altına alınmıştır.">
      <a href={panel ? PANEL_PATHS[panel] : "/giris"} className="btn-primary w-full">
        {panel ? "Kendi panelime dön" : "Giriş sayfası"}
      </a>
    </AuthShell>
  );
}
