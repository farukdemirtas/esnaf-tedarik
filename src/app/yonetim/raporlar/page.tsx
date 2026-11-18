import type { Metadata } from "next";
import { Alert } from "@/components/brand";
import { fillSeries, fmtShare, fmtYmd, InlineBar, SeriesBars, type Granularity } from "@/components/panel/charts";
import { EmptyState, FilterBar, FilterInput, PageHeader, Section, StatCard, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtMoney, fmtNumber, ORDER_STATUS } from "@/lib/format";
import { chamberReport } from "@/modules/reports/admin";

export const metadata: Metadata = { title: "Raporlar" };

type SP = { from?: string; to?: string; group?: string };

const GROUPS: { value: Granularity; label: string; title: string }[] = [
  { value: "day", label: "Günlük", title: "Günlük satış" },
  { value: "week", label: "Haftalık", title: "Haftalık satış" },
  { value: "month", label: "Aylık", title: "Aylık satış" },
];

const STATUS_ORDER = Object.keys(ORDER_STATUS);
const num = (v: { toString(): string } | number) => Number(v.toString());

export default async function ChamberReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth } = await requireOdaPage("report.view");
  const sp = await searchParams;
  const r = await chamberReport(auth, { from: sp.from, to: sp.to, group: sp.group });

  const invalidRange = r.range.from > r.range.to;
  const rangeText = `${fmtYmd(r.range.from)} – ${fmtYmd(r.range.to)}`;
  const group = GROUPS.find((g) => g.value === r.unit) ?? GROUPS[0];
  const series = invalidRange ? [] : fillSeries(r.series, r.range.from, r.range.to, r.unit);
  const salesTotal = num(r.salesTotal);

  const byStatus = [...r.byStatus].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const statusTotal = byStatus.reduce((s, x) => s + x.count, 0);
  const statusMax = Math.max(0, ...byStatus.map((s) => s.count));

  const suppliers = r.topSuppliers.map((s) => ({ ...s, total: num(s.total) }));
  const members = r.topMembers.map((m) => ({ ...m, total: num(m.total) }));
  const products = r.topProducts.map((p) => ({ ...p, total: num(p.total) }));
  const categories = r.topCategories.map((c) => ({ ...c, total: num(c.total) }));
  const maxOf = (xs: { total: number }[]) => Math.max(0, ...xs.map((x) => x.total));

  const statusSection = byStatus.length > 0 && (
    <Section title="Durumlara göre siparişler">
      <figure>
        <figcaption className="sr-only">Durumlara göre tedarikçi siparişi sayıları, {rangeText}</figcaption>
        <ul className="space-y-3">
          {byStatus.map((s) => {
            const tone = ORDER_STATUS[s.status]?.tone ?? "slate";
            return (
              <li key={s.status} className="text-sm" title={`${ORDER_STATUS[s.status]?.label ?? s.status}: ${s.count} sipariş, ${fmtMoney(s.total)}`}>
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge map={ORDER_STATUS} value={s.status} />
                  <span className="text-right tabular-nums">
                    <span className="font-semibold">{fmtNumber(s.count)}</span> sipariş
                    <span className="ml-1 text-xs text-slate-500">({fmtShare(s.count, statusTotal)})</span>
                  </span>
                </div>
                <InlineBar value={s.count} max={statusMax} tone={tone} />
                <div className="mt-0.5 text-right text-xs tabular-nums text-slate-500">{fmtMoney(s.total)}</div>
              </li>
            );
          })}
        </ul>
      </figure>
      <p className="mt-4 text-xs text-slate-500">Tüm durumlar dahil; bir üye siparişi birden çok tedarikçiye bölünebildiği için tedarikçi siparişleri sayılır.</p>
    </Section>
  );

  return (
    <>
      <PageHeader title="Raporlar" description="Odanıza bağlı tüm üye ve tedarikçilerin sipariş ve satış özeti. Tutarlar KDV dahildir (aksi belirtilmedikçe)." />
      <p className="-mt-4 mb-4 text-sm text-slate-500">Satış: reddedilen ve iptal edilen siparişler hariç.</p>

      <FilterBar>
        <FilterInput name="from" label="Başlangıç" type="date" defaultValue={r.range.from} />
        <FilterInput name="to" label="Bitiş" type="date" defaultValue={r.range.to} />
        <label className="min-w-[150px]">
          <span className="label">Gruplama</span>
          <select name="group" defaultValue={r.unit} className="input py-2">
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      {invalidRange && (
        <div className="mb-4">
          <Alert tone="warning">Başlangıç tarihi bitiş tarihinden sonra olamaz. Tarihleri düzeltip yeniden filtreleyin.</Alert>
        </div>
      )}

      <p className="mb-3 text-sm text-slate-500">Dönem: {rangeText}</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Sipariş sayısı" value={fmtNumber(r.salesCount)} hint={`Tedarikçi siparişi · ${fmtNumber(r.orderCount)} üye siparişi (tümü)`} />
        <StatCard label="Satış" value={fmtMoney(r.salesTotal)} hint={`KDV dahil · KDV: ${fmtMoney(r.vatTotal)}`} />
        <StatCard label="Net satış" value={fmtMoney(r.netTotal)} hint="KDV hariç, indirim sonrası" />
        <StatCard label="Kampanya indirimi" value={fmtMoney(r.campaignDiscount)} hint={`${fmtNumber(r.campaignLineCount)} kampanyalı kalem`} />
        <StatCard
          label="Sipariş veren / aktif üye"
          value={`${fmtNumber(r.orderingMembers)} / ${fmtNumber(r.activeMembers)}`}
          hint={`Katılım oranı: ${fmtShare(r.orderingMembers, r.activeMembers)}`}
        />
      </div>

      {r.salesCount === 0 ? (
        <div className="space-y-6">
          <EmptyState title="Bu tarih aralığında satış yok.">Farklı bir tarih aralığı seçmeyi deneyin.</EmptyState>
          {statusSection}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-3">
            <Section title={`${group.title} (KDV dahil)`} className="xl:col-span-2">
              <SeriesBars series={series} caption={`${group.title}, ${rangeText}`} />
            </Section>
            <div>{statusSection}</div>
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <RankSection title="En çok satış yapan tedarikçiler" head={["Tedarikçi", "Sipariş", "Tutar", "Pay"]}>
              {suppliers.map((s) => (
                <tr key={s.supplierId}>
                  <Td className="min-w-[12rem]">
                    <div className="font-medium">{s.tradeName}</div>
                    <InlineBar value={s.total} max={maxOf(suppliers)} />
                  </Td>
                  <Td className="tabular-nums">{fmtNumber(s.orders)}</Td>
                  <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(s.total)}</Td>
                  <Td className="tabular-nums text-slate-600">{fmtShare(s.total, salesTotal)}</Td>
                </tr>
              ))}
            </RankSection>

            <RankSection title="En çok sipariş veren üyeler" head={["Üye", "Sipariş", "Tutar", "Pay"]}>
              {members.map((m) => (
                <tr key={m.memberId}>
                  <Td className="min-w-[12rem]">
                    <div className="font-medium">{m.businessName}</div>
                    <InlineBar value={m.total} max={maxOf(members)} />
                  </Td>
                  <Td className="tabular-nums">{fmtNumber(m.orders)}</Td>
                  <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(m.total)}</Td>
                  <Td className="tabular-nums text-slate-600">{fmtShare(m.total, salesTotal)}</Td>
                </tr>
              ))}
            </RankSection>

            <RankSection title="En çok satan ürünler" head={["Ürün", "Sipariş kalemi", "Tutar", "Pay"]}>
              {products.map((p) => (
                <tr key={p.productId}>
                  <Td className="min-w-[12rem]">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.brand}</div>
                    <InlineBar value={p.total} max={maxOf(products)} />
                  </Td>
                  <Td className="tabular-nums">{fmtNumber(p.lines)}</Td>
                  <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(p.total)}</Td>
                  <Td className="tabular-nums text-slate-600">{fmtShare(p.total, salesTotal)}</Td>
                </tr>
              ))}
            </RankSection>

            <RankSection title="En çok satan kategoriler" head={["Kategori", "Tutar", "Pay"]}>
              {categories.map((c) => (
                <tr key={c.categoryId}>
                  <Td className="min-w-[12rem]">
                    <div className="font-medium">{c.name}</div>
                    <InlineBar value={c.total} max={maxOf(categories)} />
                  </Td>
                  <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(c.total)}</Td>
                  <Td className="tabular-nums text-slate-600">{fmtShare(c.total, salesTotal)}</Td>
                </tr>
              ))}
            </RankSection>
          </div>
          <p className="text-xs text-slate-500">Listelerde ilk 10 kayıt gösterilir. &quot;Pay&quot;, dönemin toplam satışı (KDV dahil) içindeki payıdır; kategoriler ana kategori altında toplanır.</p>
        </div>
      )}
    </>
  );
}

function RankSection({ title, head, children }: { title: string; head: string[]; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
      {children.length === 0 ? <EmptyState title="Kayıt yok." /> : <Table head={head}>{children}</Table>}
    </section>
  );
}
