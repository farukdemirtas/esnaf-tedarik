import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, Section } from "@/components/panel/ui";
import { ProductGrid } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { NotFoundError } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { getShopCatalog } from "@/modules/revenue/catalogs";

export const metadata: Metadata = { title: "Katalog" };

export default async function ShopCatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth } = await requireMemberPage("memberSelf.shop");
  const { id } = await params;
  const { catalog: c, products } = await getShopCatalog(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  return (
    <>
      <PageHeader title={c.title} back={{ href: "/magaza/kataloglar", label: "Kataloglar" }} />

      <Section className="mb-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          {c.coverPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={withBase(`/api/files/${c.coverPath}`)}
              alt={`${c.title} kapağı`}
              className="w-full max-w-xs shrink-0 self-start rounded-lg border border-slate-200 bg-white object-contain sm:w-48"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-700">
            <p>
              Tedarikçi:{" "}
              <Link href={`/magaza/tedarikciler/${c.supplier.slug}`} className="font-semibold text-brand-600 hover:underline">
                {c.supplier.tradeName}
              </Link>
            </p>
            <p>
              Geçerlilik: {fmtDate(c.startsAt)} – {c.endsAt ? fmtDate(c.endsAt) : "süresiz"}
            </p>
            {c.filePath && (
              <p className="pt-2">
                <a href={withBase(`/api/files/${c.filePath}`)} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex py-2">
                  PDF kataloğu aç<span className="sr-only"> (yeni sekmede açılır)</span>
                </a>
              </p>
            )}
          </div>
        </div>
      </Section>

      <h2 className="mb-1 text-lg font-semibold text-slate-900">Katalogdaki ürünler</h2>
      <p className="mb-3 text-sm text-slate-600">
        Gösterilen fiyatlar sizin için geçerli güncel fiyatlardır (KDV hariç); PDF katalogdaki fiyatlardan farklı olabilir.
      </p>
      {products.length === 0 ? <EmptyState title="Bu katalogdaki ürünler şu an bölgenizde satışta değil." /> : <ProductGrid products={products} />}
    </>
  );
}
