import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { Badge, PageHeader, Section, StatCard, startOfToday } from "@/components/panel/ui";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { activeAnnouncements } from "@/modules/announcements/service";
import { OPEN_STATUSES } from "@/modules/orders/supplier";

export const metadata: Metadata = { title: "Gösterge Paneli" };

/** Bu miktar ve altı "stok azaldı" sayılır (ürün listesindeki filtreyle aynı) */
const LOW_STOCK = 5;

export default async function SupplierDashboard({ searchParams }: { searchParams: Promise<{ sifre?: string }> }) {
  const { auth, supplierId, can } = await requireSupplierPage();
  const sp = await searchParams;
  const canOrders = can("supplierSelf.orders.view");
  const canCampaigns = can("supplierSelf.campaigns");

  // Tüm sorgular yalnızca oturumdaki firmanın verisini okur (supplierId)
  const [pendingOrders, openOrders, ordersToday, activeOffers, lowStock, pendingCampaigns, areaCount, offerCount, supplier, latest, announcements] =
    await Promise.all([
      db.supplierOrder.count({ where: { supplierId, status: "PENDING" } }),
      db.supplierOrder.count({ where: { supplierId, status: { in: OPEN_STATUSES } } }),
      db.supplierOrder.count({ where: { supplierId, createdAt: { gte: startOfToday() } } }),
      db.supplierProduct.count({ where: { supplierId, active: true, removedByAdmin: false } }),
      db.supplierProduct.count({ where: { supplierId, active: true, stock: { quantity: { lte: LOW_STOCK } } } }),
      db.campaign.count({ where: { supplierId, status: "PENDING" } }),
      db.deliveryArea.count({ where: { supplierId } }),
      db.supplierProduct.count({ where: { supplierId } }),
      db.supplier.findUnique({ where: { id: supplierId }, select: { logoPath: true } }),
      canOrders
        ? db.supplierOrder.findMany({
            where: { supplierId, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              subNumber: true,
              grandTotal: true,
              createdAt: true,
              order: { select: { member: { select: { businessName: true } } } },
            },
          })
        : [],
      auth.chamberId ? activeAnnouncements(auth.chamberId, ["ALL", "SUPPLIERS"]) : [],
    ]);

  const steps = [
    {
      done: areaCount > 0,
      title: "Hizmet verdiğiniz ilçeleri ve teslimat günlerini girin",
      hint: "Üyeler ürünlerinizi yalnızca bu ilçelerde görür.",
      href: "/tedarikci/bolgeler",
      cta: "Bölgeleri gir",
      allowed: can("supplierSelf.profile"),
    },
    {
      done: offerCount > 0,
      title: "İlk ürününüzü satışa açın",
      hint: "Katalogdan ürün seçip fiyat ve stok girmeniz yeterli.",
      href: "/tedarikci/urunler/yeni",
      cta: "Ürün ekle",
      allowed: can("supplierSelf.offers"),
    },
    {
      done: Boolean(supplier?.logoPath),
      title: "Firma logonuzu yükleyin",
      hint: "Logolu firmalar üyelere daha güven verir.",
      href: "/tedarikci/firma",
      cta: "Logo yükle",
      allowed: can("supplierSelf.profile"),
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader title={auth.supplier!.name} description="Firmanıza ait güncel durum." />
      {sp.sifre && (
        <div className="mb-6">
          <Alert tone="success">Şifreniz değiştirildi.</Alert>
        </div>
      )}

      {remaining > 0 && (
        <Section title={`Başlarken — ${remaining} adım kaldı`} className="mb-6">
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li
                key={s.href}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                  s.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      s.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className={`font-medium ${s.done ? "text-emerald-800 line-through" : "text-slate-900"}`}>
                      {s.title}
                      {s.done && <span className="sr-only"> (tamamlandı)</span>}
                    </div>
                    {!s.done && (
                      <div className="text-sm text-slate-600">{s.allowed ? s.hint : "Bu adımı firma yetkiliniz yapabilir."}</div>
                    )}
                  </div>
                </div>
                {!s.done && s.allowed && (
                  <Link href={s.href} className="btn-primary">
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canOrders && (
          <>
            <StatCard label="Yeni sipariş (onay bekliyor)" value={pendingOrders} href="/tedarikci/siparisler?durum=PENDING" />
            <StatCard label="Açık sipariş" value={openOrders} hint="Henüz teslim edilmemiş" href="/tedarikci/siparisler?durum=open" />
            <StatCard label="Bugün gelen sipariş" value={ordersToday} href="/tedarikci/siparisler" />
          </>
        )}
        <StatCard label="Satıştaki ürün" value={activeOffers} href="/tedarikci/urunler" />
        <StatCard label="Stoğu azalan ürün" value={lowStock} hint={`Stok ${LOW_STOCK} veya altında`} href="/tedarikci/urunler?durum=lowstock" />
        {canCampaigns && (
          <StatCard label="Oda onayı bekleyen kampanya" value={pendingCampaigns} href="/tedarikci/kampanyalar" />
        )}
      </div>

      {(canOrders || announcements.length > 0) && (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {canOrders && (
            <Section
              title="Onay bekleyen siparişler"
              className="xl:col-span-2"
              actions={
                <Link href="/tedarikci/siparisler?durum=PENDING" className="text-sm font-semibold text-brand-600 hover:underline">
                  Tümünü gör →
                </Link>
              }
            >
              {latest.length === 0 ? (
                <p className="text-sm text-slate-500">Onay bekleyen sipariş yok.</p>
              ) : (
                <ul className="-my-2 divide-y divide-slate-100">
                  {latest.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/tedarikci/siparisler/${o.id}`}
                        className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-semibold text-brand-700">{o.subNumber}</div>
                          <div className="truncate text-sm text-slate-700">{o.order.member.businessName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums text-slate-900">{fmtMoney(o.grandTotal)}</div>
                          <div className="text-xs text-slate-500">{fmtDateTime(o.createdAt)}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {announcements.length > 0 && (
            <Section title="Oda duyuruları" className={canOrders ? "" : "xl:col-span-3"}>
              <ul className="space-y-4">
                {announcements.map((a) => (
                  <li key={a.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{a.title}</span>
                      {a.pinned && <Badge tone="amber">Önemli</Badge>}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
                    <div className="mt-1 text-xs text-slate-500">{fmtDate(a.publishedAt)}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </>
  );
}
