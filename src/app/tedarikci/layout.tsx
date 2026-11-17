import { PanelShell } from "@/components/panel/panel-shell";
import { requirePanel } from "@/lib/auth/server";
import { SUPPLIER_NAV } from "@/lib/auth/supplier-page";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePanel("supplier");
  return (
    <PanelShell panel="supplier" auth={auth} nav={SUPPLIER_NAV} notificationsHref="/tedarikci/bildirimler">
      {children}
    </PanelShell>
  );
}
