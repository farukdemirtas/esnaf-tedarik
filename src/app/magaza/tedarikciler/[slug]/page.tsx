import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DL, EmptyState, FilterBar, FilterInput, PageHeader, Pagination, Section } from "@/components/panel/ui";
import { DeliveryNotice, fmtDeliveryDays, ProductGrid } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { NotFoundError } from "@/lib/errors";
import { fmtDate, fmtMoney } from "@/lib/format";
import { listShopCatalogs } from "@/modules/revenue/catalogs";
import { getShopSupplier } from "@/modules/shop/catalog";

export const metadata: Metadata = { title: "Tedarikçi" };

type Search = { q?: string; kampanya?: string; stokta?: string; sayfa?: string };

export default async function ShopSupplierPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { auth } = await requireMemberPage("memberSelf.shop");
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const filter = { q: sp.q, kampanya: sp.kampanya === "1" ? "1" : undefined, stokta: sp.stokta === "1" ? "1" : undefined };
  const [data, allCatalogs] = await Promise.all([
    getShopSupplier(auth, slug, { ...filter, sayfa: sp.sayfa }).catch((e) => {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }),
    listShopCatalogs(auth),
  ]);
  const catalogs = allCatalogs.items.filter((c) => c.supplier.slug === slug);
  const s = data.supplier;
  const filtered = Object.values(filter).some(Boolean);

  return (
    <>
      <PageHeader title={s.tradeName} back={{ href: "/magaza/tedarikciler", label: "Tedarikçiler" }} />
      <DeliveryNotice ctx={data.ctx} />

      <Section className="mb-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          {s.logoPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={withBase(`/api/files/${s.logoPath}`)} alt={`${s.tradeName} logosu`} className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-contain" />
          )}
          <div className="min-w-0 flex-1">
            {s.description && <p className="mb-4 whitespace-pre-line text-sm text-slate-700">{s.description}</p>}
            <DL
              items={[
                ["Telefon", s.phone ? <a href={`tel:${s.phone}`} className="text-brand-600 hover:underline">{s.phone}</a> : "—"],
                ["E-posta", s.email ? <a href={`mailto:${s.email}`} className="text-brand-600 hover:underline">{s.email}</a> : "—"],
                [`Teslimat günleri (${data.ctx.districtName ?? "ilçeniz"})`, fmtDeliveryDays(data.area.deliveryDays)],
                ["Min. sipariş tutarı (ilçeniz için)", data.area.minOrderAmount ? `${fmtMoney(data.area.minOrderAmount)} (KDV hariç)` : "Yok"],
                ...(s.address ? ([["Adres", s.address]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </div>
        </div>
      </Section>

      {catalogs.length > 0 && (
        <section className="mb-6" aria-labelledby="tedarikci-kataloglari">
          <h2 id="tedarikci-kataloglari" className="mb-2 text-lg font-semibold text-slate-900">
            Dijital kataloglar
          </h2>
          <ul className="flex flex-wrap gap-2">
            {catalogs.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/magaza/kataloglar/${c.id}`}
                  className="inline-flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-brand-200 hover:shadow"
                >
                  <span className="font-semibold text-brand-700">{c.title}</span>
                  <span className="text-xs text-slate-500">
                    {c._count.items} ürün{c.endsAt && ` · Son gün: ${fmtDate(c.endsAt)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Ürünler</h2>
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Ürün adı, marka veya barkod" />
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
      {data.items.length === 0 ? (
        <EmptyState title={filtered ? "Aramanıza uygun ürün bulunamadı." : "Bu tedarikçinin bölgenizde satışta ürünü yok."} />
      ) : (
        <ProductGrid products={data.items} />
      )}
      {data.total > 0 && <Pagination page={data.page} size={data.size} total={data.total} params={filter} />}
    </>
  );
}
