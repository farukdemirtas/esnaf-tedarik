import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Badge, EmptyState, FilterBar, FilterInput, PageHeader, Pagination, Table, Td } from "@/components/panel/ui";
import { bulkPriceStockAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { moneyInput, PACK_TYPE } from "@/lib/format";
import { listMyOffers } from "@/modules/catalog/offers-supplier";

export const metadata: Metadata = { title: "Toplu Fiyat ve Stok" };

export default async function BulkPriceStockPage({ searchParams }: { searchParams: Promise<{ q?: string; sayfa?: string }> }) {
  const { auth } = await requireSupplierPage("supplierSelf.pricing");
  const sp = await searchParams;
  const r = await listMyOffers(auth, { q: sp.q, page: sp.sayfa });

  return (
    <>
      <PageHeader title="Toplu Fiyat ve Stok" description="Tüm ürünlerinizin fiyat ve stoğunu tek ekranda güncelleyin. Fiyatlar KDV hariçtir." />
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Ürün adı veya barkod" />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title={sp.q ? "Aramanıza uygun ürün bulunamadı." : "Henüz satışa sunduğunuz ürün yok."}>
          {!sp.q && (
            <Link href="/tedarikci/urunler" className="font-semibold text-brand-600 hover:underline">
              Ürünlerim sayfasına git →
            </Link>
          )}
        </EmptyState>
      ) : (
        <ActionForm action={bulkPriceStockAction} className="space-y-4">
          <Alert tone="info">
            Değiştirmek istediğiniz kutuları düzeltip <strong>Değişiklikleri kaydet</strong> düğmesine basın. Yalnızca değişen satırlar kaydedilir. Bir
            satırda hata varsa <strong>hiçbir değişiklik kaydedilmez</strong>; hatalı kutuların altında açıklama görünür. Sayfa değiştirmeden önce kaydetmeyi
            unutmayın.
          </Alert>
          <div className="flex justify-end">
            <SubmitButton>Değişiklikleri kaydet</SubmitButton>
          </div>
          <Table head={["Ürün", "Paket", "KDV", "Fiyat (KDV hariç, ₺)", "Stok"]}>
            {r.items.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td>
                  <div className="font-medium text-slate-900">{o.product.name}</div>
                  <div className="text-xs text-slate-500">{o.product.brand.name}</div>
                  {o.removedByAdmin ? (
                    <div className="mt-1">
                      <Badge tone="red">Oda kaldırdı</Badge>
                    </div>
                  ) : (
                    !o.active && (
                      <div className="mt-1">
                        <Badge>Satışa kapalı</Badge>
                      </div>
                    )
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  {PACK_TYPE[o.packType]}
                  {o.unitsPerPack > 1 ? ` × ${o.unitsPerPack}` : ""}
                </Td>
                <Td>%{o.vatRate}</Td>
                <Td>
                  <Field
                    name={`price.${o.id}`}
                    aria-label={`${o.product.name} fiyatı`}
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    defaultValue={moneyInput(o.packPrice)}
                    wrapClassName="w-32"
                  />
                </Td>
                <Td>
                  <Field
                    name={`stock.${o.id}`}
                    aria-label={`${o.product.name} stoğu`}
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    defaultValue={(o.stock?.quantity ?? 0).toString().replace(".", ",")}
                    wrapClassName="w-28"
                  />
                </Td>
              </tr>
            ))}
          </Table>
          <div className="flex justify-end">
            <SubmitButton>Değişiklikleri kaydet</SubmitButton>
          </div>
        </ActionForm>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q }} />
    </>
  );
}
