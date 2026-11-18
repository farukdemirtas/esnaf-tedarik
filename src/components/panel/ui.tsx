import Link from "next/link";
import type { Tone } from "@/lib/format";

export function StatCard({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const inner = (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-brand-950">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </>
  );
  const cls = "card group relative block overflow-hidden p-5 hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-[0_18px_40px_-24px_rgba(20,80,100,0.45)]";
  const body = (
    <>
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-brand-100/50 transition group-hover:bg-accent-300/30" aria-hidden />
      <div className="relative">{inner}</div>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-brand-600 hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-brand-950 sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-brand-50 ring-1 ring-brand-100" aria-hidden />
      <div className="font-semibold text-slate-800">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Section({ title, actions, children, className = "" }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          {title && <h2 className="font-display text-lg font-semibold tracking-tight text-brand-950">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-900 ring-amber-600/15",
  red: "bg-red-50 text-red-800 ring-red-600/15",
  slate: "bg-slate-100/90 text-slate-700 ring-slate-500/15",
  blue: "bg-brand-50 text-brand-800 ring-brand-600/15",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-semibold tracking-wide ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const s = map[value] ?? { label: value, tone: "slate" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Yatay kaydırılabilir tablo (mobilde taşmayı önler) */
export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200/80 bg-brand-50/50 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/90">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function Pagination({ page, size, total, params }: { page: number; size: number; total: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return <p className="mt-3 text-sm text-slate-500">{total} kayıt</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("sayfa", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-500">
        {total} kayıt · Sayfa {page}/{pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className="btn-secondary px-3 py-1.5 text-sm" href={href(page - 1)}>
            Önceki
          </Link>
        )}
        {page < pages && (
          <Link className="btn-secondary px-3 py-1.5 text-sm" href={href(page + 1)}>
            Sonraki
          </Link>
        )}
      </div>
    </div>
  );
}

/** GET ile çalışan filtre çubuğu (JavaScript gerektirmez) */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
      {children}
      <button type="submit" className="btn-primary py-2">
        Filtrele
      </button>
    </form>
  );
}

export function FilterInput({ name, label, defaultValue, placeholder, type = "text" }: { name: string; label: string; defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <label className="min-w-[160px] flex-1">
      <span className="label">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="input py-2" />
    </label>
  );
}

export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  all = "Tümü",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  all?: string;
}) {
  return (
    <label className="min-w-[150px]">
      <span className="label">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className="input py-2">
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link href={href} className={variant === "primary" ? "btn-primary" : "btn-secondary"}>
      {children}
    </Link>
  );
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

export function toOptions<T extends string>(map: Record<T, string | { label: string }>) {
  return (Object.entries(map) as [T, string | { label: string }][]).map(([value, v]) => ({
    value,
    label: typeof v === "string" ? v : v.label,
  }));
}
