import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar, FilterInput, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtDateTime, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { listMySupplierOrders, OPEN_STATUSES } from "@/modules/orders/supplier";

export const metadata: Metadata = { title: "Siparişler" };

type SP = { durum?: string; q?: string; sayfa?: string };

const TABS: { value: string; label: string }[] = [
  { value: "open", label: "Açık" },
  { value: "PENDING", label: "Yeni" },
  { value: "CONFIRMED", label: ORDER_STATUS.CONFIRMED.label },
  { value: "PREPARING", label: ORDER_STATUS.PREPARING.label },
  { value: "SHIPPED", label: ORDER_STATUS.SHIPPED.label },
  { value: "DELIVERED", label: ORDER_STATUS.DELIVERED.label },
  { value: "REJECTED", label: ORDER_STATUS.REJECTED.label },
  { value: "CANCELLED", label: ORDER_STATUS.CANCELLED.label },
  { value: "", label: "Tümü" },
];

function addressOf(snapshot: unknown): Record<string, string | undefined> {
  return (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {}) as Record<string, string | undefined>;
}

export default async function SupplierOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth } = await requireSupplierPage("supplierSelf.orders.view");
  const sp = await searchParams;
  const r = await listMySupplierOrders(auth, { status: sp.durum, q: sp.q, page: sp.sayfa });

  const counts = r.counts as Record<string, number | undefined>;
  const allCount = Object.values(counts).reduce<number>((a, b) => a + (b ?? 0), 0);
  const countOf = (value: string) =>
    value === "open" ? OPEN_STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0) : value === "" ? allCount : (counts[value] ?? 0);
  const active = sp.durum ?? "";
  const tabHref = (value: string) => {
    const p = new URLSearchParams();
    if (value) p.set("durum", value);
    if (sp.q) p.set("q", sp.q);
    const s = p.toString();
    return s ? `?${s}` : "/tedarikci/siparisler";
  };
  const filtered = Boolean(sp.durum || sp.q);

  return (
    <>
      <PageHeader title="Siparişler" description="Üyelerin firmanıza verdiği siparişler. Yeni siparişleri onaylayın veya reddedin; durum değiştikçe üyeye bildirim gider." />

      <nav aria-label="Sipariş durumları" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const isActive = active === t.value;
          const n = countOf(t.value);
          return (
            <Link
              key={t.value || "all"}
              href={tabHref(t.value)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                isActive ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  isActive ? "bg-white/20 text-white" : t.value === "PENDING" && n > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </nav>

      <FilterBar>
        {sp.durum && <input type="hidden" name="durum" value={sp.durum} />}
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Sipariş no veya üye işletme adı" />
      </FilterBar>

      {r.items.length === 0 ? (
        allCount === 0 ? (
          <EmptyState title="Henüz sipariş yok.">Üyeler sipariş verdiğinde burada görünecek ve bildirim alacaksınız.</EmptyState>
        ) : (
          <EmptyState title="Sipariş bulunamadı.">{filtered ? "Farklı bir durum seçin veya aramayı değiştirin." : null}</EmptyState>
        )
      ) : (
        <Table head={["Sipariş no", "Tarih", "Üye", "İlçe", "Kalem", "Tutar", "Durum"]}>
          {r.items.map((o) => {
            const addr = addressOf(o.order.addressSnapshot);
            const pending = o.status === "PENDING";
            return (
              <tr key={o.id} className={pending ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-slate-50"}>
                <Td>
                  <Link href={`/tedarikci/siparisler/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                    {o.subNumber}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(o.createdAt)}</Td>
                <Td>
                  <div className="font-medium">{o.order.member.businessName}</div>
                  {o.order.member.phone && (
                    <a href={`tel:${o.order.member.phone}`} className="text-xs text-slate-500 hover:underline">
                      {o.order.member.phone}
                    </a>
                  )}
                </Td>
                <Td>{typeof addr.district === "string" && addr.district ? addr.district : "—"}</Td>
                <Td className="tabular-nums">{o._count.items}</Td>
                <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(o.grandTotal)}</Td>
                <Td>
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ durum: sp.durum, q: sp.q }} />
    </>
  );
}
