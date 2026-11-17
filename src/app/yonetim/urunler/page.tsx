import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar, FilterInput, FilterSelect, LinkButton, PageHeader, Pagination, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { fmtNumber, PRODUCT_STATUS, UNIT_TYPE } from "@/lib/format";
import { listProducts } from "@/modules/catalog/products";
import { listBrands, listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Ürün Kataloğu" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; marka?: string; kategori?: string; durum?: string; sayfa?: string }>;
}) {
  const { auth, base } = await requireOdaPage("product.manage");
  const sp = await searchParams;
  const [r, brands, cats] = await Promise.all([
    listProducts(auth, { q: sp.q, brandId: sp.marka, categoryId: sp.kategori, status: sp.durum, page: sp.sayfa }),
    listBrands(),
    listCategoryTree(chamberIdOf(auth)),
  ]);

  return (
    <>
      <PageHeader
        title="Ürün Kataloğu"
        description="Ana ürün tanımları. Tedarikçiler bu ürünlere kendi fiyat ve stoklarıyla teklif girer."
        actions={<LinkButton href={`${base}/urunler/yeni`}>+ Yeni ürün</LinkButton>}
      />
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Ürün adı veya barkod" />
        <FilterSelect name="marka" label="Marka" defaultValue={sp.marka} options={brands.map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect name="kategori" label="Kategori" defaultValue={sp.kategori} options={cats.map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }))} />
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(PRODUCT_STATUS)} />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Ürün bulunamadı.">Kataloğa ürünü siz ekleyebilir veya tedarikçilerin ürün taleplerini onaylayabilirsiniz.</EmptyState>
      ) : (
        <Table head={["", "Ürün", "Barkod", "Marka", "Kategori", "Birim", "Teklif", "Durum"]}>
          {r.items.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td className="w-14">
                {p.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${p.images[0].path}`} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded bg-slate-100" />
                )}
              </Td>
              <Td>
                <Link href={`${base}/urunler/${p.id}`} className="font-semibold text-brand-700 hover:underline">
                  {p.name}
                </Link>
              </Td>
              <Td className="font-mono text-xs">{p.barcode ?? "—"}</Td>
              <Td>{p.brand.name}</Td>
              <Td>{p.category.name}</Td>
              <Td>
                {p.unitAmount ? `${fmtNumber(p.unitAmount)} ` : ""}
                {UNIT_TYPE[p.unitType]}
              </Td>
              <Td>{p._count.offers}</Td>
              <Td>
                <StatusBadge map={PRODUCT_STATUS} value={p.status} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q, marka: sp.marka, kategori: sp.kategori, durum: sp.durum }} />
    </>
  );
}
