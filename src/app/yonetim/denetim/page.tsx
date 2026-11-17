import type { Metadata } from "next";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, Table, Td, toOptions } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtDateTime } from "@/lib/format";
import { listAuditLogs } from "@/modules/admin/service";

export const metadata: Metadata = { title: "Denetim Kayıtları" };

const ENTITY: Record<string, string> = {
  Member: "Üye",
  Supplier: "Tedarikçi",
  User: "Kullanıcı",
  Product: "Ürün",
  Category: "Kategori",
  Brand: "Marka",
  Campaign: "Kampanya",
  Announcement: "Duyuru",
  MembershipDue: "Aidat",
  SupplierProduct: "Tedarikçi teklifi",
  ProductRequest: "Ürün talebi",
  Address: "Adres",
};

/** Sık görülen işlem kodlarının Türkçe karşılıkları; listede olmayanlar ham kodla gösterilir */
const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Giriş",
  "auth.logout": "Çıkış",
  "auth.login.denied": "Giriş reddedildi",
  "auth.login.locked": "Hesap kilitlendi",
  "auth.login.rateLimited": "Çok fazla giriş denemesi",
  "auth.password.changed": "Şifre değiştirildi",
  "auth.password.changeFailed": "Şifre değiştirme başarısız",
  "auth.reset.created": "Şifre yenileme bağlantısı oluşturuldu",
  "auth.reset.used": "Şifre yenileme bağlantısı kullanıldı",
  "access.denied": "Yetkisiz erişim denemesi",
  "application.member": "Üyelik başvurusu",
  "application.supplier": "Tedarikçi başvurusu",
  "member.create": "Üye eklendi",
  "member.update": "Üye güncellendi",
  "member.approve": "Üye onaylandı",
  "member.reject": "Üye başvurusu reddedildi",
  "member.activate": "Üye aktifleştirildi",
  "member.deactivate": "Üye pasife alındı",
  "member.address.add": "Üye adresi eklendi",
  "member.address.delete": "Üye adresi silindi",
  "member.user.passwordReset": "Üye şifresi sıfırlandı",
  "dues.add": "Aidat kaydı eklendi",
  "dues.createPeriod": "Dönem aidatları oluşturuldu",
  "dues.paid": "Aidat ödendi",
  "dues.waive": "Aidat muaf tutuldu",
  "dues.reopen": "Aidat yeniden açıldı",
  "dues.delete": "Aidat kaydı silindi",
  "supplier.create": "Tedarikçi eklendi",
  "supplier.update": "Tedarikçi güncellendi",
  "supplier.approve": "Tedarikçi onaylandı",
  "supplier.reject": "Tedarikçi reddedildi",
  "supplier.suspend": "Tedarikçi askıya alındı",
  "supplier.reactivate": "Tedarikçi yeniden aktifleştirildi",
  "supplier.user.add": "Tedarikçi kullanıcısı eklendi",
  "supplier.user.activate": "Tedarikçi kullanıcısı aktifleştirildi",
  "supplier.user.deactivate": "Tedarikçi kullanıcısı pasife alındı",
  "supplier.user.passwordReset": "Tedarikçi kullanıcı şifresi sıfırlandı",
  "category.create": "Kategori eklendi",
  "category.update": "Kategori güncellendi",
  "category.delete": "Kategori silindi",
  "brand.create": "Marka eklendi",
  "brand.update": "Marka güncellendi",
  "brand.delete": "Marka silindi",
  "product.create": "Ürün eklendi",
  "product.update": "Ürün güncellendi",
  "product.image.add": "Ürün görseli eklendi",
  "product.image.delete": "Ürün görseli silindi",
  "productRequest.approve": "Ürün talebi onaylandı",
  "productRequest.reject": "Ürün talebi reddedildi",
  "offer.remove": "Teklif yayından kaldırıldı",
  "offer.restore": "Teklif yeniden yayına alındı",
  "campaign.approve": "Kampanya onaylandı",
  "campaign.reject": "Kampanya reddedildi",
  "campaign.end": "Kampanya sonlandırıldı",
  "campaign.feature": "Kampanya öne çıkarıldı",
  "campaign.unfeature": "Kampanya öne çıkarma kaldırıldı",
  "announcement.create": "Duyuru eklendi",
  "announcement.update": "Duyuru güncellendi",
  "announcement.delete": "Duyuru silindi",
  "user.create": "Kullanıcı oluşturuldu",
  "user.update": "Kullanıcı güncellendi",
  "user.activate": "Kullanıcı aktifleştirildi",
  "user.deactivate": "Kullanıcı pasife alındı",
  "user.unlock": "Hesap kilidi açıldı",
  "user.passwordReset": "Kullanıcı şifresi sıfırlandı",
  "user.permissions": "Yetkiler değiştirildi",
  "settings.chamber": "Oda bilgileri güncellendi",
  "settings.duesThreshold": "Aidat kuralı güncellendi",
};

type SP = { islem?: string; kullanici?: string; varlik?: string; bas?: string; bit?: string; sayfa?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth } = await requireOdaPage("audit.view");
  const sp = await searchParams;
  const entity = sp.varlik && sp.varlik in ENTITY ? sp.varlik : undefined;
  const r = await listAuditLogs(auth, { action: sp.islem, user: sp.kullanici, entity, from: sp.bas, to: sp.bit, page: sp.sayfa });
  const filtered = !!(sp.islem || sp.kullanici || entity || sp.bas || sp.bit);

  return (
    <>
      <PageHeader title="Denetim Kayıtları" description="Sistemde yapılan giriş, değişiklik ve onay işlemlerinin kaydı." />
      <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Denetim kayıtları yalnızca eklenir; uygulama üzerinden değiştirilemez veya silinemez. Şifre gibi hassas alanlar kayda maskelenerek
        yazılır.
      </p>
      <FilterBar>
        <FilterInput name="islem" label="İşlem kodu" defaultValue={sp.islem} placeholder="ör. auth.login, member." />
        <FilterInput name="kullanici" label="Kullanıcı adı" defaultValue={sp.kullanici} />
        <FilterSelect name="varlik" label="Kayıt türü" defaultValue={entity} options={toOptions(ENTITY)} />
        <FilterInput name="bas" label="Başlangıç" type="date" defaultValue={sp.bas} />
        <FilterInput name="bit" label="Bitiş" type="date" defaultValue={sp.bit} />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Kayıt bulunamadı.">{filtered ? "Filtreleri değiştirmeyi deneyin." : undefined}</EmptyState>
      ) : (
        <Table head={["Zaman", "Kullanıcı", "İşlem", "Kayıt", "IP", "Ayrıntı"]}>
          {r.items.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <Td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</Td>
              <Td>
                {l.user ? (
                  <>
                    <code className="font-mono text-xs font-semibold">{l.user.username}</code>
                    {l.user.fullName && <div className="text-xs text-slate-500">{l.user.fullName}</div>}
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Sistem / ziyaretçi</span>
                )}
              </Td>
              <Td>
                <div className="text-slate-900">{ACTION_LABEL[l.action] ?? l.action}</div>
                <code className="font-mono text-xs text-slate-500">{l.action}</code>
              </Td>
              <Td className="text-xs">
                {l.entityType ? (
                  <>
                    <div>{ENTITY[l.entityType] ?? l.entityType}</div>
                    {l.entityId && (
                      <code className="font-mono text-slate-500" title={l.entityId}>
                        {l.entityId.length > 10 ? `${l.entityId.slice(0, 10)}…` : l.entityId}
                      </code>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
              <Td className="whitespace-nowrap font-mono text-xs">{l.ip ?? <span className="text-slate-400">—</span>}</Td>
              <Td>
                {l.data != null ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-brand-600">Göster</summary>
                    <pre className="max-w-md overflow-x-auto text-xs">{JSON.stringify(l.data, null, 2)}</pre>
                  </details>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ islem: sp.islem, kullanici: sp.kullanici, varlik: entity, bas: sp.bas, bit: sp.bit }} />
    </>
  );
}
