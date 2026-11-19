import { ShopShell } from "@/components/shop/shop-shell";
import { requirePanel } from "@/lib/auth/server";
import { MEMBER_NAV } from "@/lib/auth/member-page";
import { cartCount } from "@/modules/shop/cart";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePanel("member");
  const inCart = await cartCount(auth);
  return (
    <ShopShell auth={auth} nav={MEMBER_NAV} cartCount={inCart}>
      {children}
    </ShopShell>
  );
}
