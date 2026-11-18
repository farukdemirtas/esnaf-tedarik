import type { Metadata } from "next";
import { Alert } from "@/components/brand";
import { LinkButton, PageHeader, StatCard } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { dashboardStats } from "@/modules/admin/service";

export const metadata: Metadata = { title: "Gösterge Paneli" };

export default async function OdaDashboard({ searchParams }: { searchParams: Promise<{ sifre?: string }> }) {
  const { auth, base, can } = await requireOdaPage();
  const s = await dashboardStats(auth);
  const sp = await searchParams;
  const n = (v: number | null) => v ?? 0;

  const cards = [
    s.members !== null && <StatCard key="m" label="Toplam üye" value={s.members} hint={`${n(s.activeMembers)} aktif`} href={`${base}/uyeler`} />,
    s.suppliers !== null && <StatCard key="s" label="Tedarikçi" value={s.suppliers} hint={`${n(s.activeSuppliers)} aktif`} href={`${base}/tedarikciler`} />,
    s.products !== null && <StatCard key="p" label="Katalogdaki ürün" value={s.products} />,
    s.ordersToday !== null && <StatCard key="o" label="Bugünkü sipariş" value={s.ordersToday} hint={`Bu ay: ${n(s.ordersMonth)}`} href={`${base}/siparisler`} />,
  ].filter(Boolean);
  const pending = [
    s.pendingMembers !== null && <StatCard key="pm" label="Üyelik başvurusu" value={s.pendingMembers} href={`${base}/uyeler?durum=PENDING`} />,
    s.pendingSuppliers !== null && <StatCard key="ps" label="Tedarikçi başvurusu" value={s.pendingSuppliers} href={`${base}/tedarikciler?durum=PENDING`} />,
    s.pendingCampaigns !== null && <StatCard key="pc" label="Onay bekleyen kampanya" value={s.pendingCampaigns} href={`${base}/kampanyalar?durum=PENDING`} />,
    s.pendingRequests !== null && <StatCard key="pr" label="Yeni ürün talebi" value={s.pendingRequests} href={`${base}/urun-talepleri`} />,
    s.overdue !== null && <StatCard key="od" label="Gecikmiş aidatı olan üye" value={s.overdue} href={`${base}/aidatlar`} />,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Gösterge Paneli"
        description={`Tüm rakamlar canlı veritabanından gelir.${can("report.view") ? " Tarih aralığına göre ayrıntılı satış raporları Raporlar sayfasındadır." : ""}`}
        actions={can("report.view") ? <LinkButton href={`${base}/raporlar`} variant="secondary">Raporlar</LinkButton> : undefined}
      />
      {sp.sifre && (
        <div className="mb-6">
          <Alert tone="success">Şifreniz değiştirildi.</Alert>
        </div>
      )}
      {cards.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards}</div>}
      {pending.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Bekleyen işler</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{pending}</div>
        </>
      )}
    </>
  );
}
