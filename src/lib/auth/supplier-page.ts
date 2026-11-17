import "server-only";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import type { PermissionCode } from "@/lib/permissions";
import { getClientIp, requirePanel } from "./server";

/** Tedarikçi paneli sayfa koruması: panel izni + sayfanın gerektirdiği izinler */
export async function requireSupplierPage(...perms: PermissionCode[]) {
  const auth = await requirePanel("supplier");
  const missing = perms.find((p) => !auth.permissions.has(p));
  if (missing) {
    await audit({ userId: auth.userId, action: "access.denied", data: { permission: missing, panel: "supplier" }, ip: await getClientIp() });
    redirect("/yetkisiz");
  }
  return { auth, supplierId: auth.supplier!.id, can: (c: PermissionCode) => auth.permissions.has(c) };
}

export const SUPPLIER_NAV = [
  { href: "/tedarikci", label: "Gösterge Paneli", exact: true },
  { href: "/tedarikci/siparisler", label: "Siparişler", permission: "supplierSelf.orders.view" },
  { href: "/tedarikci/urunler", label: "Ürünlerim" },
  { href: "/tedarikci/fiyat-stok", label: "Toplu Fiyat ve Stok", permission: "supplierSelf.pricing" },
  { href: "/tedarikci/urun-talepleri", label: "Yeni Ürün Talepleri", permission: "supplierSelf.offers" },
  { href: "/tedarikci/kampanyalar", label: "Kampanyalarım", permission: "supplierSelf.campaigns" },
  { href: "/tedarikci/raporlar", label: "Raporlar", permission: "supplierSelf.reports" },
  { href: "/tedarikci/firma", label: "Firma Profili" },
  { href: "/tedarikci/bolgeler", label: "Hizmet Bölgeleri" },
  { href: "/tedarikci/kullanicilar", label: "Kullanıcılar", permission: "supplierSelf.users" },
  { href: "/tedarikci/bildirimler", label: "Bildirimler" },
];
