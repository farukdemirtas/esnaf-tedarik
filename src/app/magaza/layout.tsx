import { PanelShell } from "@/components/panel/panel-shell";
import { requirePanel } from "@/lib/auth/server";

const NAV = [{ href: "/magaza", label: "Ana Sayfa", exact: true }];

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePanel("member");
  return (
    <PanelShell panel="member" auth={auth} nav={NAV}>
      {children}
    </PanelShell>
  );
}
