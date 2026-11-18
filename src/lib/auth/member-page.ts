import "server-only";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import type { PermissionCode } from "@/lib/permissions";
import { getClientIp, requirePanel } from "./server";

/** Üye (mağaza) paneli sayfa koruması: panel izni + sayfanın gerektirdiği izinler */
export async function requireMemberPage(...perms: PermissionCode[]) {
  const auth = await requirePanel("member");
  const missing = perms.find((p) => !auth.permissions.has(p));
  if (missing) {
    await audit({ userId: auth.userId, action: "access.denied", data: { permission: missing, panel: "member" }, ip: await getClientIp() });
    redirect("/yetkisiz");
  }
  return { auth, memberId: auth.member!.id, can: (c: PermissionCode) => auth.permissions.has(c) };
}

export const MEMBER_NAV = [
  { href: "/magaza", label: "Ana Sayfa", exact: true },
  { href: "/magaza/urunler", label: "Ürünler", permission: "memberSelf.shop" },
  { href: "/magaza/tedarikciler", label: "Tedarikçiler", permission: "memberSelf.shop" },
  { href: "/magaza/kataloglar", label: "Kataloglar", permission: "memberSelf.shop" },
  { href: "/magaza/favoriler", label: "Favorilerim", permission: "memberSelf.shop" },
  { href: "/magaza/sepet", label: "Sepetim", permission: "memberSelf.cart" },
  { href: "/magaza/siparislerim", label: "Siparişlerim", permission: "memberSelf.orders.view" },
  { href: "/magaza/hesabim", label: "Hesabım", permission: "memberSelf.account" },
  { href: "/magaza/bildirimler", label: "Bildirimler" },
];
