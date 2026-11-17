import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import type { PermissionCode } from "@/lib/permissions";
import { getClientIp, requirePanel } from "./server";

export type OdaBase = "/yonetim" | "/personel";

/**
 * Oda arka ofis sayfaları hem yönetici (/yonetim) hem personel (/personel) panelinde
 * aynı bileşenle sunulur. Hangi panelde olunduğu istek yolundan belirlenir.
 */
export async function odaBase(): Promise<OdaBase> {
  const p = (await headers()).get("x-pathname") ?? "";
  return p.startsWith("/personel") ? "/personel" : "/yonetim";
}

/** Sayfa koruması: panel izni + sayfanın gerektirdiği izinler */
export async function requireOdaPage(...perms: PermissionCode[]) {
  const base = await odaBase();
  const auth = await requirePanel(base === "/personel" ? "staff" : "admin");
  const missing = perms.find((p) => !auth.permissions.has(p));
  if (missing) {
    await audit({ userId: auth.userId, action: "access.denied", data: { permission: missing, base }, ip: await getClientIp() });
    redirect("/yetkisiz");
  }
  return { auth, base, can: (c: PermissionCode) => auth.permissions.has(c) };
}

export function odaNav(base: OdaBase) {
  return [
    { href: base, label: "Gösterge Paneli", exact: true },
    { href: `${base}/uyeler`, label: "Üyeler", permission: "member.view" },
    { href: `${base}/aidatlar`, label: "Aidatlar", permission: "dues.view" },
    { href: `${base}/tedarikciler`, label: "Tedarikçiler", permission: "supplier.view" },
    { href: `${base}/kategoriler`, label: "Kategoriler", permission: "category.manage" },
    { href: `${base}/markalar`, label: "Markalar", permission: "brand.manage" },
    { href: `${base}/urunler`, label: "Ürün Kataloğu", permission: "product.manage" },
    { href: `${base}/urun-talepleri`, label: "Ürün Talepleri", permission: "productRequest.review" },
    { href: `${base}/teklifler`, label: "Tedarikçi Teklifleri", permission: "offer.view" },
    { href: `${base}/kampanyalar`, label: "Kampanyalar", permission: "campaign.review" },
    { href: `${base}/siparisler`, label: "Siparişler", permission: "order.viewAll" },
    { href: `${base}/duyurular`, label: "Duyurular", permission: "announcement.manage" },
    { href: `${base}/kullanicilar`, label: "Kullanıcılar ve Yetkiler", permission: "user.manage" },
    { href: `${base}/denetim`, label: "Denetim Kayıtları", permission: "audit.view" },
    { href: `${base}/ayarlar`, label: "Ayarlar", permission: "settings.manage" },
  ];
}
