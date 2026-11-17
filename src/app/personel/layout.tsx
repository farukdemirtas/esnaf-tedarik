import { PanelShell } from "@/components/panel/panel-shell";
import { odaNav } from "@/lib/auth/oda";
import { requirePanel } from "@/lib/auth/server";

/** Personel paneli, yönetici sayfalarını kullanır; menü ve sayfalar kişinin izinlerine göre süzülür. */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePanel("staff");
  return (
    <PanelShell panel="staff" auth={auth} nav={odaNav("/personel")}>
      {children}
    </PanelShell>
  );
}
