import type { Metadata } from "next";
import { Alert } from "@/components/brand";
import { EmptyState, FilterBar, FilterInput, PageHeader, Section, StatCard, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtMoney, fmtNumber, ORDER_STATUS, PACK_TYPE } from "@/lib/format";
import { supplierReport, type Granularity } from "@/modules/reports/supplier";

export const metadata: Metadata = { title: "Raporlar" };

type SP = { bas?: string; bit?: string; grup?: string };

const GROUPS: { value: Granularity; label: string; title: string }[] = [
  { value: "day", label: "Günlük", title: "Günlük satış" },
  { value: "week", label: "Haftalık", title: "Haftalık satış" },
  { value: "month", label: "Aylık", title: "Aylık satış" },
];

/** "YYYY-MM-DD" → UTC gece yarısı (tarih etiketi için; saat dilimi kayması olmaz) */
const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

function bucketLabel(ymd: string, unit: Granularity) {
  const d = utc(ymd);
  if (unit === "month") return d.toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
  if (unit === "week") return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" })} haftası`;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
}

/** Seçilen aralıktaki tüm dönemler (satış olmayan günler/haftalar da 0 olarak gösterilir) */
function allBuckets(from: string, to: string, unit: Granularity) {
  const d = utc(from);
  const end = utc(to);
  if (unit === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Pazartesi
  if (unit === "month") d.setUTCDate(1);
  const out: string[] = [];
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    if (unit === "day") d.setUTCDate(d.getUTCDate() + 1);
    else if (unit === "week") d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const STATUS_ORDER = Object.keys(ORDER_STATUS);

export default async function SupplierReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth } = await requireSupplierPage("supplierSelf.reports");
  const sp = await searchParams;
  const r = await supplierReport(auth, { from: sp.bas, to: sp.bit, group: sp.grup });

  const invalidRange = r.range.from > r.range.to;
  const byBucket = new Map(r.series.map((s) => [s.bucket, s]));
  const keys = Array.from(new Set([...allBuckets(r.range.from, r.range.to, r.unit), ...byBucket.keys()])).sort();
  const series = keys.map((k) => ({ bucket: k, label: bucketLabel(k, r.unit), orders: byBucket.get(k)?.orders ?? 0, total: byBucket.get(k)?.total ?? 0 }));
  const max = Math.max(0, ...series.map((s) => s.total));
  const group = GROUPS.find((g) => g.value === r.unit) ?? GROUPS[0];
  const byStatus = [...r.byStatus].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const rangeText = `${utc(r.range.from).toLocaleDateString("tr-TR", { timeZone: "UTC" })} – ${utc(r.range.to).toLocaleDateString("tr-TR", { timeZone: "UTC" })}`;

  const statusSection = byStatus.length > 0 && (
    <Section title="Durumlara göre siparişler">
      <ul className="divide-y divide-slate-100">
        {byStatus.map((s) => (
          <li key={s.status} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <StatusBadge map={ORDER_STATUS} value={s.status} />
            <span className="text-right tabular-nums">
              <span className="font-semibold">{s.count}</span> sipariş
              <span className="block text-xs text-slate-500">{fmtMoney(s.total ?? 0)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );

  return (
    <>
      <PageHeader title="Raporlar" description="Firmanızın satış özeti. Reddedilen ve iptal edilen siparişler satışa dahil edilmez; tutarlar KDV dahildir." />

      <FilterBar>
        <FilterInput name="bas" label="Başlangıç" type="date" defaultValue={r.range.from} />
        <FilterInput name="bit" label="Bitiş" type="date" defaultValue={r.range.to} />
        <label className="min-w-[150px]">
          <span className="label">Gruplama</span>
          <select name="grup" defaultValue={r.unit} className="input py-2">
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sipariş sayısı" value={fmtNumber(r.salesCount)} hint="Reddedilen ve iptal edilenler hariç" />
        <StatCard label="Satış tutarı" value={fmtMoney(r.salesTotal)} hint="KDV dahil" />
        <StatCard label="Teslim edilen" value={fmtNumber(r.deliveredCount)} hint={`${fmtMoney(r.deliveredTotal)} (KDV dahil)`} />
        <StatCard label="Toplam indirim" value={fmtMoney(r.discountTotal)} hint="Kampanya indirimleri" />
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
              <figure>
                <figcaption className="sr-only">
                  {group.title}, {rangeText}
                </figcaption>
                <ul className="space-y-1.5">
                  {series.map((s) => {
                    const pct = max > 0 ? (s.total / max) * 100 : 0;
                    return (
                      <li
                        key={s.bucket}
                        title={`${s.label}: ${fmtMoney(s.total)} · ${s.orders} sipariş`}
                        className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 rounded px-1 py-0.5 text-sm hover:bg-slate-50 sm:grid-cols-[8.5rem_1fr_auto]"
                      >
                        <span className="truncate text-xs text-slate-600">{s.label}</span>
                        <span className="relative block h-3.5" aria-hidden>
                          {s.total > 0 && <span className="absolute inset-y-0 left-0 rounded-r bg-brand-500" style={{ width: `${Math.max(pct, 0.75)}%` }} />}
                        </span>
                        <span className="whitespace-nowrap text-right text-xs tabular-nums text-slate-800">
                          {s.total > 0 ? fmtMoney(s.total) : "—"}
                          <span className="ml-1.5 hidden text-slate-500 sm:inline">({s.orders})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </figure>

              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium text-brand-700 hover:underline">Tablo olarak göster</summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      {group.title}, {rangeText}
                    </caption>
                    <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-3 py-2">
                          Dönem
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          Sipariş
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          Tutar
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {series.map((s) => (
                        <tr key={s.bucket}>
                          <th scope="row" className="px-3 py-1.5 font-normal">
                            {s.label}
                          </th>
                          <td className="px-3 py-1.5 text-right tabular-nums">{s.orders}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Section>

            <div>{statusSection}</div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section>
              <h2 className="mb-3 font-semibold text-slate-900">En çok satan ürünler</h2>
              <Table head={["Ürün", "Paket", "Miktar", "Tutar"]}>
                {r.topProducts.map((p) => (
                  <tr key={`${p.supplierProductId}-${p.productName}-${p.brandName}-${p.packType}`}>
                    <Td>
                      <div className="font-medium">{p.productName}</div>
                      <div className="text-xs text-slate-500">{p.brandName}</div>
                    </Td>
                    <Td className="whitespace-nowrap">{PACK_TYPE[p.packType] ?? p.packType}</Td>
                    <Td className="tabular-nums">{fmtNumber(p.quantity)}</Td>
                    <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(p.total)}</Td>
                  </tr>
                ))}
              </Table>
            </section>

            <section>
              <h2 className="mb-3 font-semibold text-slate-900">En çok sipariş veren üyeler</h2>
              <Table head={["Üye", "Sipariş", "Tutar"]}>
                {r.topMembers.map((m) => (
                  <tr key={m.memberId}>
                    <Td className="font-medium">{m.businessName}</Td>
                    <Td className="tabular-nums">{m.orders}</Td>
                    <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(m.total)}</Td>
                  </tr>
                ))}
              </Table>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
