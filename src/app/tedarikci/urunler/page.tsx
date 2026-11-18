import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, EmptyState, FilterBar, FilterInput, FilterSelect, LinkButton, PageHeader, Pagination, Table, Td } from "@/components/panel/ui";
import { setOfferActiveAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtMoney, fmtNumber, PACK_TYPE } from "@/lib/format";
import { listMyOffers } from "@/modules/catalog/offers-supplier";
import { listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Ürünlerim" };

const STATE_OPTIONS = [
  { value: "active", label: "Satışta" },
  { value: "inactive", label: "Satışa kapalı" },
  { value: "removed", label: "Oda kaldırdı" },
  { value: "lowstock", label: "Stoğu azalan (≤5)" },
];

export default async function MyOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; durum?: string; kategori?: string; sayfa?: string }>;
}) {
  const { auth, can } = await requireSupplierPage();
  const sp = await searchParams;
  const [r, cats] = await Promise.all([
    listMyOffers(auth, { q: sp.q, state: sp.durum, categoryId: sp.kategori, page: sp.sayfa }),
    listCategoryTree(auth.chamberId!),
  ]);
  const canEdit = can("supplierSelf.offers");
  // Yeni ürün sayfası fiyat girişi de gerektirir
  const canAdd = canEdit && can("supplierSelf.pricing");
  const filtered = Boolean(sp.q || sp.durum || sp.kategori);

  return (
    <>
      <PageHeader
        title="Ürünlerim"
        description="Satışa sunduğunuz ürünler. Fiyatlar KDV hariçtir; stok, sipariş birimi (koli, adet, kg, paket) cinsindendir."
        actions={canAdd ? <LinkButton href="/tedarikci/urunler/yeni">+ Yeni ürün ekle</LinkButton> : undefined}
      />
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Ürün adı veya barkod" />
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={STATE_OPTIONS} />
        <FilterSelect name="kategori" label="Kategori" defaultValue={sp.kategori} options={cats.map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }))} />
      </FilterBar>
      {r.items.length === 0 ? (
        filtered ? (
          <EmptyState title="Aramanıza uygun ürün bulunamadı.">Filtreleri değiştirerek tekrar deneyin.</EmptyState>
        ) : (
          <EmptyState title="Henüz satışa sunduğunuz ürün yok.">
            {canAdd ? (
              <Link href="/tedarikci/urunler/yeni" className="font-semibold text-brand-600 hover:underline">
                Katalogdan ürün seçip fiyatınızı girin →
              </Link>
            ) : (
              "Ürün ekleme yetkiniz yok; firma yöneticinize başvurun."
            )}
          </EmptyState>
        )
      ) : (
        <Table head={["", "Ürün", "Paket", "Fiyat", "Stok", "En az", "Durum", ""]}>
          {r.items.map((o) => {
            const stock = o.stock?.quantity ?? 0;
            const low = Number(stock.toString()) <= 5;
            return (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td className="w-14">
                  {o.product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={withBase(`/api/files/${o.product.images[0].path}`)} alt="" className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-slate-100" />
                  )}
                </Td>
                <Td>
                  <Link href={`/tedarikci/urunler/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                    {o.product.name}
                  </Link>
                  <div className="text-xs text-slate-500">{o.product.brand.name}</div>
                </Td>
                <Td className="whitespace-nowrap">
                  {PACK_TYPE[o.packType]}
                  {o.unitsPerPack > 1 ? ` × ${o.unitsPerPack}` : ""}
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="font-medium tabular-nums">{fmtMoney(o.packPrice)}</div>
                  <div className="text-xs text-slate-500">KDV dahil {fmtMoney(o.packPrice.mul(100 + o.vatRate).div(100))}</div>
                </Td>
                <Td className={`tabular-nums ${low ? "font-semibold text-red-700" : ""}`}>{fmtNumber(stock)}</Td>
                <Td className="tabular-nums">{fmtNumber(o.minOrderQty)}</Td>
                <Td>{o.removedByAdmin ? <Badge tone="red">Oda kaldırdı</Badge> : o.active ? <Badge tone="green">Satışta</Badge> : <Badge>Kapalı</Badge>}</Td>
                <Td>
                  {canEdit && !o.removedByAdmin && (
                    <ActionForm action={setOfferActiveAction} compact>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="active" value={o.active ? "0" : "1"} />
                      <SubmitButton variant="small" className="whitespace-nowrap">
                        {o.active ? "Satışı kapat" : "Satışa aç"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q, durum: sp.durum, kategori: sp.kategori }} />
    </>
  );
}
