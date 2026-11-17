import { PanelShell } from "@/components/panel/panel-shell";
import { odaNav } from "@/lib/auth/oda";
import { requirePanel } from "@/lib/auth/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePanel("admin");
  return (
    <PanelShell panel="admin" auth={auth} nav={odaNav("/yonetim")}>
      {children}
    </PanelShell>
  );
}
