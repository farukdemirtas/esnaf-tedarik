/**
 * İzin kataloğu ve varsayılan rol → izin eşlemesi.
 * Seed bu dosyadan beslenir; kontroller her zaman veritabanındaki
 * (yöneticinin değiştirebildiği) izin kümesi üzerinden yapılır.
 */

export const PERMISSIONS = {
  // Panel erişimi
  "panel.admin": { group: "Panel", description: "Yönetici paneline erişim" },
  "panel.staff": { group: "Panel", description: "Personel paneline erişim" },
  "panel.supplier": { group: "Panel", description: "Tedarikçi paneline erişim" },
  "panel.member": { group: "Panel", description: "Üye (mağaza) paneline erişim" },

  // Üye ve aidat
  "member.view": { group: "Üyeler", description: "Üyeleri görüntüleme" },
  "member.create": { group: "Üyeler", description: "Üye ekleme" },
  "member.update": { group: "Üyeler", description: "Üye bilgilerini güncelleme" },
  "member.approve": { group: "Üyeler", description: "Üyelik başvurularını onaylama/reddetme" },
  "member.setStatus": { group: "Üyeler", description: "Üye hesabını aktif/pasif yapma" },
  "member.resetPassword": { group: "Üyeler", description: "Üye şifresi sıfırlama" },
  "dues.view": { group: "Aidat", description: "Aidat durumlarını görüntüleme" },
  "dues.manage": { group: "Aidat", description: "Aidat kaydı girme ve düzenleme" },

  // Tedarikçi
  "supplier.view": { group: "Tedarikçiler", description: "Tedarikçileri görüntüleme" },
  "supplier.create": { group: "Tedarikçiler", description: "Tedarikçi ekleme" },
  "supplier.update": { group: "Tedarikçiler", description: "Tedarikçi bilgilerini güncelleme" },
  "supplier.approve": { group: "Tedarikçiler", description: "Tedarikçi başvurularını onaylama" },
  "supplier.setStatus": { group: "Tedarikçiler", description: "Tedarikçiyi askıya alma / aktifleştirme" },

  // Katalog
  "category.manage": { group: "Katalog", description: "Kategori yönetimi" },
  "brand.manage": { group: "Katalog", description: "Marka yönetimi" },
  "product.manage": { group: "Katalog", description: "Ana ürün kataloğu yönetimi" },
  "productRequest.review": { group: "Katalog", description: "Tedarikçi ürün taleplerini inceleme" },
  "offer.view": { group: "Katalog", description: "Tüm tedarikçi tekliflerini görüntüleme" },
  "offer.moderate": { group: "Katalog", description: "Teklifleri yayından kaldırma" },

  // Kampanya, sipariş, rapor
  "campaign.review": { group: "Kampanya", description: "Kampanya onaylama / reddetme" },
  "order.viewAll": { group: "Sipariş", description: "Tüm siparişleri görüntüleme" },
  "report.view": { group: "Rapor", description: "Sistem raporlarını görüntüleme" },

  // Gelir modeli
  "ads.manage": { group: "Gelir", description: "Reklam alanları ve banner yönetimi" },
  "package.manage": { group: "Gelir", description: "Tedarikçi paketleri ve ücretleri" },
  "catalog.review": { group: "Gelir", description: "Dijital katalog onayı" },

  // Sistem
  "announcement.manage": { group: "Sistem", description: "Duyuru yayınlama" },
  "user.manage": { group: "Sistem", description: "Kullanıcı ve yetki yönetimi" },
  "audit.view": { group: "Sistem", description: "Denetim kayıtlarını görüntüleme" },
  "settings.manage": { group: "Sistem", description: "Sistem ayarları" },

  // Tedarikçi (kendi firması)
  "supplierSelf.profile": { group: "Tedarikçi (kendi)", description: "Firma profilini düzenleme" },
  "supplierSelf.offers": { group: "Tedarikçi (kendi)", description: "Ürün/teklif ekleme ve düzenleme" },
  "supplierSelf.pricing": { group: "Tedarikçi (kendi)", description: "Fiyat ve stok güncelleme" },
  "supplierSelf.campaigns": { group: "Tedarikçi (kendi)", description: "Kampanya oluşturma" },
  "supplierSelf.orders.view": { group: "Tedarikçi (kendi)", description: "Kendi siparişlerini görüntüleme" },
  "supplierSelf.orders.process": { group: "Tedarikçi (kendi)", description: "Sipariş durumunu güncelleme" },
  "supplierSelf.reports": { group: "Tedarikçi (kendi)", description: "Firma raporları" },
  "supplierSelf.users": { group: "Tedarikçi (kendi)", description: "Firma çalışanlarını yönetme" },
  "supplierSelf.marketing": { group: "Tedarikçi (kendi)", description: "Paket, reklam, sponsorlu ürün ve dijital katalog" },

  // Üye (kendi işletmesi)
  "memberSelf.shop": { group: "Üye (kendi)", description: "Ürünlere göz atma ve karşılaştırma" },
  "memberSelf.cart": { group: "Üye (kendi)", description: "Sepet yönetimi" },
  "memberSelf.order": { group: "Üye (kendi)", description: "Sipariş verme" },
  "memberSelf.orders.view": { group: "Üye (kendi)", description: "Kendi siparişlerini görüntüleme" },
  "memberSelf.account": { group: "Üye (kendi)", description: "Hesap bilgilerini güncelleme" },
} as const satisfies Record<string, { group: string; description: string }>;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLE_CODES = [
  "SUPER_ADMIN",
  "CHAMBER_ADMIN",
  "CHAMBER_STAFF",
  "SUPPLIER_OWNER",
  "SUPPLIER_STAFF",
  "MEMBER_OWNER",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

const chamberAdminPerms = ALL_PERMISSIONS.filter(
  (p) =>
    !p.startsWith("supplierSelf.") &&
    !p.startsWith("memberSelf.") &&
    p !== "panel.supplier" &&
    p !== "panel.member" &&
    p !== "panel.staff",
);

export const ROLE_DEFINITIONS: Record<
  RoleCode,
  { name: string; scope: "PLATFORM" | "CHAMBER" | "SUPPLIER" | "MEMBER"; description: string; permissions: PermissionCode[] }
> = {
  SUPER_ADMIN: {
    name: "Platform Yöneticisi",
    scope: "PLATFORM",
    description: "Teknik sorumlu; tüm Odalar",
    permissions: chamberAdminPerms,
  },
  CHAMBER_ADMIN: {
    name: "Oda Yöneticisi",
    scope: "CHAMBER",
    description: "Oda yönetimi; Oda'nın tüm verileri",
    permissions: chamberAdminPerms,
  },
  CHAMBER_STAFF: {
    name: "Oda Personeli",
    scope: "CHAMBER",
    description: "Sınırlı yetkili Oda personeli",
    permissions: [
      "panel.staff",
      "member.view",
      "member.update",
      "member.approve",
      "dues.view",
      "dues.manage",
      "supplier.view",
      "order.viewAll",
      "report.view",
    ],
  },
  SUPPLIER_OWNER: {
    name: "Tedarikçi Yetkilisi",
    scope: "SUPPLIER",
    description: "Firma yetkilisi; yalnızca kendi firması",
    permissions: [
      "panel.supplier",
      "supplierSelf.profile",
      "supplierSelf.offers",
      "supplierSelf.pricing",
      "supplierSelf.campaigns",
      "supplierSelf.orders.view",
      "supplierSelf.orders.process",
      "supplierSelf.reports",
      "supplierSelf.users",
      "supplierSelf.marketing",
    ],
  },
  SUPPLIER_STAFF: {
    name: "Tedarikçi Çalışanı",
    scope: "SUPPLIER",
    description: "Sipariş hazırlama; fiyat değiştiremez",
    permissions: ["panel.supplier", "supplierSelf.orders.view", "supplierSelf.orders.process"],
  },
  MEMBER_OWNER: {
    name: "Üye İşletme",
    scope: "MEMBER",
    description: "Bakkal / market sahibi; yalnızca kendi işletmesi",
    permissions: [
      "panel.member",
      "memberSelf.shop",
      "memberSelf.cart",
      "memberSelf.order",
      "memberSelf.orders.view",
      "memberSelf.account",
    ],
  },
};

/** Rol izinleri + kişiye özel ekleme/çıkarma → nihai izin kümesi */
export function resolvePermissions(
  rolePermissions: string[],
  overrides: { code: string; granted: boolean }[],
): Set<string> {
  const set = new Set(rolePermissions);
  for (const o of overrides) {
    if (o.granted) set.add(o.code);
    else set.delete(o.code);
  }
  return set;
}

export type PanelKey = "admin" | "staff" | "supplier" | "member";

export const PANEL_PATHS: Record<PanelKey, string> = {
  admin: "/yonetim",
  staff: "/personel",
  supplier: "/tedarikci",
  member: "/magaza",
};

/** Kullanıcının girişte yönlendirileceği panel (öncelik sırasıyla) */
export function homePanel(perms: Set<string>): PanelKey | null {
  if (perms.has("panel.admin")) return "admin";
  if (perms.has("panel.staff")) return "staff";
  if (perms.has("panel.supplier")) return "supplier";
  if (perms.has("panel.member")) return "member";
  return null;
}
