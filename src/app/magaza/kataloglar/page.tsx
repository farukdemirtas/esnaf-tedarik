import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/panel/ui";
import { DeliveryNotice } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { fmtDate } from "@/lib/format";
import { listShopCatalogs } from "@/modules/revenue/catalogs";

export const metadata: Metadata = { title: "Dijital kataloglar" };

export default async function ShopCatalogsPage() {
  const { auth } = await requireMemberPage("memberSelf.shop");
  const { ctx, items } = await listShopCatalogs(auth);

  return (
    <>
      <PageHeader title="Dijital kataloglar" description="Bölgenize hizmet veren tedarikçilerin yayındaki katalogları ve broşürleri." />
      <DeliveryNotice ctx={ctx} />

      {items.length === 0 ? (
        ctx.address ? <EmptyState title="Şu an yayında katalog bulunmuyor." /> : null
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <li key={c.id} className="flex">
              <article className="card flex w-full flex-col overflow-hidden">
                <Link href={`/magaza/kataloglar/${c.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" tabIndex={-1} aria-hidden="true">
                  {c.coverPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={withBase(`/api/files/${c.coverPath}`)} alt="" loading="lazy" className="aspect-[4/3] w-full border-b border-slate-100 bg-white object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center border-b border-slate-100 bg-brand-50 text-sm font-semibold text-brand-700">
                      Katalog
                    </div>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.category && <Badge tone="slate">{c.category.name}</Badge>}
                    {c.filePath && <Badge tone="blue">PDF</Badge>}
                  </div>
                  <h2 className="mt-2 font-semibold text-slate-900">
                    <Link href={`/magaza/kataloglar/${c.id}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </h2>
                  <Link href={`/magaza/tedarikciler/${c.supplier.slug}`} className="mt-0.5 text-sm text-brand-600 hover:underline">
                    {c.supplier.tradeName}
                  </Link>
                  <dl className="mt-3 space-y-0.5 text-xs text-slate-600">
                    <div>
                      <dt className="inline">Geçerlilik: </dt>
                      <dd className="inline">
                        {fmtDate(c.startsAt)} – {c.endsAt ? fmtDate(c.endsAt) : "süresiz"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Ürün sayısı: </dt>
                      <dd className="inline tabular-nums">{c._count.items}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto pt-4">
                    <Link href={`/magaza/kataloglar/${c.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                      Kataloğu incele →
                    </Link>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
