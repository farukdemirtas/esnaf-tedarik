import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Badge, EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, Table, Td } from "@/components/panel/ui";
import { removeOfferAction, restoreOfferAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtDateTime, fmtMoney, fmtNumber, PACK_TYPE } from "@/lib/format";
import { listOffers } from "@/modules/catalog/offers-admin";
import { listSuppliers } from "@/modules/suppliers/service";

export const metadata: Metadata = { title: "Tedarikçi Teklifleri" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ q?: string; tedarikci?: string; durum?: string; sayfa?: string }> }) {
  const { auth, can } = await requireOdaPage("offer.view");
  const sp = await searchParams;
  const [r, sups] = await Promise.all([
    listOffers(auth, { q: sp.q, supplierId: sp.tedarikci, state: sp.durum, page: sp.sayfa }),
    can("supplier.view") ? listSuppliers(auth, { status: "APPROVED", page: "1" }) : null,
  ]);

  return (
    <>
      <PageHeader title="Tedarikçi Teklifleri" description="Tedarikçilerin ürünler için girdiği fiyat ve stoklar. Uygunsuz teklifler yayından kaldırılabilir." />
      <FilterBar>
        <FilterInput name="q" label="Ürün" defaultValue={sp.q} placeholder="Ürün adı veya barkod" />
        {sups && <FilterSelect name="tedarikci" label="Tedarikçi" defaultValue={sp.tedarikci} options={sups.items.map((s) => ({ value: s.id, label: s.tradeName }))} />}
        <FilterSelect
          name="durum"
          label="Durum"
          defaultValue={sp.durum}
          options={[
            { value: "active", label: "Yayında" },
            { value: "inactive", label: "Tedarikçi pasif yaptı" },
            { value: "removed", label: "Oda kaldırdı" },
          ]}
        />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Teklif bulunamadı.">Tedarikçiler ürün ve fiyat girişini kendi panellerinden yapar.</EmptyState>
      ) : (
        <Table head={["Ürün", "Tedarikçi", "Paket", "Paket fiyatı", "KDV", "Min.", "Stok", "Güncelleme", "Durum"]}>
          {r.items.map((o) => (
            <tr key={o.id}>
              <Td>
                <div className="font-medium">{o.product.name}</div>
                <div className="text-xs text-slate-500">{o.product.brand.name}</div>
              </Td>
              <Td>{o.supplier.tradeName}</Td>
              <Td>
                {PACK_TYPE[o.packType]}
                {o.unitsPerPack > 1 ? ` × ${o.unitsPerPack}` : ""}
              </Td>
              <Td>{fmtMoney(o.packPrice)}</Td>
              <Td>%{o.vatRate}</Td>
              <Td>{fmtNumber(o.minOrderQty)}</Td>
              <Td>{fmtNumber(o.stock?.quantity ?? 0)}</Td>
              <Td className="text-xs">{fmtDateTime(o.updatedAt)}</Td>
              <Td>
                {o.removedByAdmin ? (
                  <div className="space-y-1">
                    <Badge tone="red">Kaldırıldı</Badge>
                    <div className="max-w-[200px] text-xs text-slate-500">{o.removalReason}</div>
                    {can("offer.moderate") && (
                      <ActionForm action={restoreOfferAction} compact>
                        <input type="hidden" name="id" value={o.id} />
                        <SubmitButton variant="small">Yeniden yayınla</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {o.active ? <Badge tone="green">Yayında</Badge> : <Badge>Pasif</Badge>}
                    {can("offer.moderate") && (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-red-700">Yayından kaldır</summary>
                        <ActionForm action={removeOfferAction} compact className="mt-2 w-56 space-y-2">
                          <input type="hidden" name="id" value={o.id} />
                          <Field name="reason" label="Gerekçe" required maxLength={500} />
                          <SubmitButton variant="small-danger">Kaldır</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q, tedarikci: sp.tedarikci, durum: sp.durum }} />
    </>
  );
}
