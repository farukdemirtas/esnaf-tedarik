import { PanelShell } from "@/components/panel/panel-shell";
import { requirePanel } from "@/lib/auth/server";
import { MEMBER_NAV } from "@/lib/auth/member-page";
import { cartCount } from "@/modules/shop/cart";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePanel("member");
  const inCart = await cartCount(auth);
  const nav = MEMBER_NAV.map((i) => (i.href === "/magaza/sepet" && inCart > 0 ? { ...i, label: `Sepetim (${inCart})` } : i));
  return (
    <PanelShell panel="member" auth={auth} nav={nav} notificationsHref="/magaza/bildirimler">
      {children}
    </PanelShell>
  );
}
