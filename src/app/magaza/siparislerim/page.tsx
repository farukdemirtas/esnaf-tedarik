import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireMemberPage } from "@/lib/auth/member-page";
import { fmtDateTime, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { listMyOrders } from "@/modules/orders/member";

export const metadata: Metadata = { title: "Siparişlerim" };

type SP = { durum?: string; sayfa?: string };

const TABS: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "acik", label: "Devam eden" },
  { value: "PENDING", label: ORDER_STATUS.PENDING.label },
  { value: "CONFIRMED", label: ORDER_STATUS.CONFIRMED.label },
  { value: "PREPARING", label: ORDER_STATUS.PREPARING.label },
  { value: "SHIPPED", label: ORDER_STATUS.SHIPPED.label },
  { value: "DELIVERED", label: ORDER_STATUS.DELIVERED.label },
  { value: "REJECTED", label: ORDER_STATUS.REJECTED.label },
  { value: "CANCELLED", label: ORDER_STATUS.CANCELLED.label },
];

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth } = await requireMemberPage("memberSelf.orders.view");
  const sp = await searchParams;
  const r = await listMyOrders(auth, { durum: sp.durum, sayfa: sp.sayfa });
  const active = TABS.some((t) => t.value === sp.durum) ? (sp.durum ?? "") : "";

  return (
    <>
      <PageHeader
        title="Siparişlerim"
        description="Verdiğiniz siparişler. Her siparişte, tedarikçi başına ayrı bir alt sipariş ve durum bulunur."
        actions={
          <Link href="/magaza/sepet" className="btn-secondary px-3 py-1.5 text-sm">
            Sepete git
          </Link>
        }
      />

      <nav aria-label="Sipariş durumları" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const isActive = active === t.value;
          return (
            <Link
              key={t.value || "all"}
              href={t.value ? `?durum=${t.value}` : "/magaza/siparislerim"}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                isActive ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {r.items.length === 0 ? (
        active ? (
          <EmptyState title="Bu durumda sipariş bulunamadı.">Farklı bir durum seçin.</EmptyState>
        ) : (
          <EmptyState title="Henüz siparişiniz yok.">
            <Link href="/magaza/urunler" className="font-semibold text-brand-600 hover:underline">
              Ürünlere göz atın
            </Link>{" "}
            ve ilk siparişinizi verin.
          </EmptyState>
        )
      ) : (
        <Table head={["Sipariş no", "Tarih", "Tedarikçiler", "Tutar (KDV dahil)", ""]}>
          {r.items.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/magaza/siparislerim/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {o.orderNumber}
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-xs">{fmtDateTime(o.createdAt)}</Td>
              <Td>
                <ul className="space-y-1.5">
                  {o.supplierOrders.map((so) => (
                    <li key={so.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{so.supplier.tradeName}</span>
                      <StatusBadge map={ORDER_STATUS} value={so.status} />
                      <span className="text-xs text-slate-500">
                        {so._count.items} kalem · {fmtMoney(so.grandTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Td>
              <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(o.grandTotal)}</Td>
              <Td>
                <Link href={`/magaza/siparislerim/${o.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                  Ayrıntı<span className="sr-only"> ({o.orderNumber})</span>
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ durum: active || undefined }} />
    </>
  );
}
