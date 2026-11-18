import { fmtMoney } from "@/lib/format";

/**
 * Sunucuda üretilen basit grafik yardımcıları (grafik kütüphanesi yok, JavaScript gerektirmez).
 * Görsel çubuklar aria-hidden'dır; değerler her zaman metin olarak da yazılır.
 */

export type Granularity = "day" | "week" | "month";

/** "YYYY-MM-DD" → UTC gece yarısı (tarih etiketi için; saat dilimi kayması olmaz) */
export const utcDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export function fmtYmd(ymd: string) {
  return utcDate(ymd).toLocaleDateString("tr-TR", { timeZone: "UTC" });
}

export function bucketLabel(ymd: string, unit: Granularity) {
  const d = utcDate(ymd);
  if (unit === "month") return d.toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
  if (unit === "week") return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" })} haftası`;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
}

/** Seçilen aralıktaki tüm dönemler (satış olmayan günler/haftalar/aylar da 0 olarak gösterilir) */
export function allBuckets(from: string, to: string, unit: Granularity) {
  const d = utcDate(from);
  const end = utcDate(to);
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

export type SeriesPoint = { bucket: string; label: string; orders: number; total: number };

/** Boş dönemleri 0 ile doldurulmuş, sıralı seri */
export function fillSeries(series: { bucket: string; orders: number; total: number }[], from: string, to: string, unit: Granularity): SeriesPoint[] {
  const byBucket = new Map(series.map((s) => [s.bucket, s]));
  const keys = Array.from(new Set([...allBuckets(from, to, unit), ...byBucket.keys()])).sort();
  return keys.map((k) => ({ bucket: k, label: bucketLabel(k, unit), orders: byBucket.get(k)?.orders ?? 0, total: byBucket.get(k)?.total ?? 0 }));
}

/** Zaman serisi: dönem başına satış tutarı çubuğu + sipariş sayısı; altında tablo görünümü */
export function SeriesBars({ series, caption }: { series: SeriesPoint[]; caption: string }) {
  const max = Math.max(0, ...series.map((s) => s.total));
  return (
    <>
      <figure>
        <figcaption className="sr-only">{caption}</figcaption>
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
                  <span className="ml-1.5 text-slate-500">
                    ({s.orders}
                    <span className="sr-only"> sipariş</span>)
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500" aria-hidden>
          Parantez içindeki sayı, dönemdeki sipariş sayısıdır.
        </p>
      </figure>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-brand-700 hover:underline">Tablo olarak göster</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{caption}</caption>
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
    </>
  );
}

const BAR_TONES = {
  brand: "bg-brand-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-400",
  slate: "bg-slate-400",
  blue: "bg-brand-500",
} as const;

/** Satır içi orantılı çubuk (değer metni ayrıca yazılmalıdır) */
export function InlineBar({ value, max, tone = "brand" }: { value: number; max: number; tone?: keyof typeof BAR_TONES }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {value > 0 && <span className={`block h-full rounded-full ${BAR_TONES[tone]}`} style={{ width: `${Math.max(pct, 1)}%` }} />}
    </span>
  );
}

/** Yüzde metni ("%12,5") */
export function fmtShare(value: number, total: number) {
  if (!(total > 0)) return "—";
  return `%${((value / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}
