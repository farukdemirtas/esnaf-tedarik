import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar, FilterInput, FilterSelect, LinkButton, PageHeader, Pagination, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtMoney, SUPPLIER_STATUS } from "@/lib/format";
import { listSuppliers } from "@/modules/suppliers/service";

export const metadata: Metadata = { title: "Tedarikçiler" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; durum?: string; sayfa?: string }> }) {
  const { auth, base, can } = await requireOdaPage("supplier.view");
  const sp = await searchParams;
  const r = await listSuppliers(auth, { q: sp.q, status: sp.durum, page: sp.sayfa });

  return (
    <>
      <PageHeader
        title="Tedarikçiler"
        description="Platformda ürün satan firmalar ve başvurular."
        actions={can("supplier.create") && <LinkButton href={`${base}/tedarikciler/yeni`}>+ Yeni tedarikçi</LinkButton>}
      />
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Firma adı, unvan, vergi no" />
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(SUPPLIER_STATUS)} />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Kayıt bulunamadı." />
      ) : (
        <Table head={["Firma", "Vergi no", "Yetkili", "Min. sipariş", "Ürün", "Sipariş", "Durum"]}>
          {r.items.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`${base}/tedarikciler/${s.id}`} className="font-semibold text-brand-700 hover:underline">
                  {s.tradeName}
                </Link>
                <div className="text-xs text-slate-500">{s.legalName}</div>
              </Td>
              <Td>{s.taxNumber}</Td>
              <Td>
                {s.contactName}
                <div className="text-xs text-slate-500">{s.contactPhone ?? s.phone}</div>
              </Td>
              <Td>{fmtMoney(s.minOrderAmount)}</Td>
              <Td>{s._count.products}</Td>
              <Td>{s._count.supplierOrders}</Td>
              <Td>
                <StatusBadge map={SUPPLIER_STATUS} value={s.status} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q, durum: sp.durum }} />
    </>
  );
}
