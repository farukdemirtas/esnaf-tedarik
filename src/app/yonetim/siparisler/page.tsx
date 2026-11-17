import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtDateTime, fmtMoney, ORDER_STATUS } from "@/lib/format";
import { listAllSupplierOrders } from "@/modules/admin/service";
import { listSuppliers } from "@/modules/suppliers/service";

export const metadata: Metadata = { title: "Siparişler" };

type SP = { durum?: string; tedarikci?: string; q?: string; bas?: string; bit?: string; sayfa?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth, base, can } = await requireOdaPage("order.viewAll");
  const sp = await searchParams;
  const [r, sups] = await Promise.all([
    listAllSupplierOrders(auth, { status: sp.durum, supplierId: sp.tedarikci, q: sp.q, from: sp.bas, to: sp.bit, page: sp.sayfa }),
    can("supplier.view") ? listSuppliers(auth, { page: "1" }) : null,
  ]);
  const filtered = Boolean(sp.durum || sp.tedarikci || sp.q || sp.bas || sp.bit);

  return (
    <>
      <PageHeader title="Siparişler" description="Üyelerin tedarikçilere verdiği siparişler (salt okunur). Sipariş durumlarını tedarikçiler kendi panellerinden günceller." />
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Sipariş no veya üye işletme" />
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(ORDER_STATUS)} />
        {sups && <FilterSelect name="tedarikci" label="Tedarikçi" defaultValue={sp.tedarikci} options={sups.items.map((s) => ({ value: s.id, label: s.tradeName }))} />}
        <FilterInput name="bas" label="Başlangıç" type="date" defaultValue={sp.bas} />
        <FilterInput name="bit" label="Bitiş" type="date" defaultValue={sp.bit} />
      </FilterBar>

      {r.total > 0 && (
        <div className="card mb-4 flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
          <span className="text-sm text-slate-600">
            {filtered ? "Filtrelenen" : "Tüm"} siparişlerin toplam tutarı ({r.total} sipariş, KDV dahil)
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-900">{fmtMoney(r.sum ?? 0)}</span>
        </div>
      )}

      {r.items.length === 0 ? (
        <EmptyState title="Sipariş bulunamadı.">
          {filtered ? "Filtreleri değiştirmeyi deneyin." : "Üyeler sipariş vermeye başladığında burada listelenecek."}
        </EmptyState>
      ) : (
        <Table head={["Sipariş no", "Tarih", "Üye", "Tedarikçi", "Kalem", "Tutar", "Durum"]}>
          {r.items.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`${base}/siparisler/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {o.subNumber}
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-xs">{fmtDateTime(o.createdAt)}</Td>
              <Td>{o.order.member.businessName}</Td>
              <Td>{o.supplier.tradeName}</Td>
              <Td>{o._count.items}</Td>
              <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(o.grandTotal)}</Td>
              <Td>
                <StatusBadge map={ORDER_STATUS} value={o.status} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ durum: sp.durum, tedarikci: sp.tedarikci, q: sp.q, bas: sp.bas, bit: sp.bit }} />
    </>
  );
}
