import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, Pagination } from "@/components/panel/ui";
import { AdBanner } from "@/components/shop/ad-banner";
import { DeliveryNotice, ProductGrid } from "@/components/shop/product-card";
import { SponsoredStrip } from "@/components/shop/sponsored-strip";
import { requireMemberPage } from "@/lib/auth/member-page";
import { chamberIdOf } from "@/lib/auth/scope";
import { listShopProducts, shopFacets } from "@/modules/shop/catalog";

export const metadata: Metadata = { title: "Ürünler" };

type Search = { q?: string; kategori?: string; marka?: string; tedarikci?: string; kampanya?: string; stokta?: string; sirala?: string; sayfa?: string };

/** Kategorileri ağaç sırasıyla, alt kategoriler girintili olarak listeler */
function categoryOptions(categories: { id: string; name: string; parentId: string | null }[]) {
  const children = new Map<string | null, typeof categories>();
  for (const c of categories) {
    const key = c.parentId && categories.some((x) => x.id === c.parentId) ? c.parentId : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const out: { value: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of children.get(parent) ?? []) {
      out.push({ value: c.id, label: `${"   ".repeat(depth)}${depth ? "– " : ""}${c.name}` });
      if (depth < 5) walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default async function ShopProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { auth } = await requireMemberPage("memberSelf.shop");
  const sp = await searchParams;
  const filter = {
    q: sp.q,
    kategori: sp.kategori,
    marka: sp.marka,
    tedarikci: sp.tedarikci,
    kampanya: sp.kampanya === "1" ? "1" : undefined,
    stokta: sp.stokta === "1" ? "1" : undefined,
    sirala: sp.sirala === "yeni" || sp.sirala === "fiyat" ? sp.sirala : undefined,
  };
  const [facets, list] = await Promise.all([shopFacets(auth), listShopProducts(auth, { ...filter, sayfa: sp.sayfa })]);
  const filtered = Object.values(filter).some(Boolean);

  return (
    <>
      <PageHeader title="Ürünler" description="Bölgenize hizmet veren tedarikçilerin ürünleri. Fiyatlar koli/paket başınadır." />
      <AdBanner chamberId={chamberIdOf(auth)} slotCode="products-top" />
      <DeliveryNotice ctx={list.ctx} />

      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Ürün adı, marka veya barkod" />
        <FilterSelect name="kategori" label="Kategori" defaultValue={sp.kategori} options={categoryOptions(facets.categories)} />
        <FilterSelect name="marka" label="Marka" defaultValue={sp.marka} options={facets.brands.map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect
          name="tedarikci"
          label="Tedarikçi"
          defaultValue={sp.tedarikci}
          options={facets.suppliers.map((s) => ({ value: s.id, label: s.tradeName }))}
        />
        <label className="min-w-[140px]">
          <span className="label">Sıralama</span>
          <select name="sirala" defaultValue={filter.sirala ?? ""} className="input py-2">
            <option value="">Ada göre (A–Z)</option>
            <option value="yeni">En yeni</option>
            <option value="fiyat">En düşük birim fiyat</option>
          </select>
        </label>
        <div className="flex flex-col gap-1.5 pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" name="kampanya" value="1" defaultChecked={!!filter.kampanya} className="h-5 w-5 rounded border-slate-300 accent-brand-600" />
            Kampanyalı
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" name="stokta" value="1" defaultChecked={!!filter.stokta} className="h-5 w-5 rounded border-slate-300 accent-brand-600" />
            Yalnızca stokta olanlar
          </label>
        </div>
      </FilterBar>

      {filtered && (
        <p className="mb-3 text-sm">
          <Link href="/magaza/urunler" className="text-brand-600 hover:underline">
            Filtreleri temizle
          </Link>
        </p>
      )}

      {!filtered && list.page === 1 && list.ctx.address && <SponsoredStrip auth={auth} limit={4} className="mb-8" />}

      {list.items.length === 0 ? (
        list.ctx.address ? (
          <EmptyState title={filtered ? "Aramanıza uygun ürün bulunamadı." : "Bölgenizde şu an satışta ürün yok."}>
            {filtered && "Farklı bir kelime deneyin veya filtreleri azaltın."}
          </EmptyState>
        ) : null
      ) : (
        <ProductGrid products={list.items} />
      )}
      {list.total > 0 && <Pagination page={list.page} size={list.size} total={list.total} params={filter} />}
    </>
  );
}
