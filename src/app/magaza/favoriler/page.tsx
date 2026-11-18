import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { EmptyState, PageHeader, Pagination } from "@/components/panel/ui";
import { DeliveryNotice, ProductGrid } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { listFavorites } from "@/modules/shop/favorites";

export const metadata: Metadata = { title: "Favorilerim" };

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ sayfa?: string }> }) {
  const { auth } = await requireMemberPage("memberSelf.shop");
  const sp = await searchParams;
  const list = await listFavorites(auth, sp.sayfa);

  return (
    <>
      <PageHeader title="Favorilerim" description="Sık aldığınız ürünlere buradan hızlıca ulaşın." />
      <DeliveryNotice ctx={list.ctx} />
      {list.hiddenCount > 0 && (
        <div className="mb-4">
          <Alert tone="info">{list.hiddenCount} favori ürün bölgenizde şu an satışta değil.</Alert>
        </div>
      )}
      {list.items.length === 0 ? (
        list.hiddenCount > 0 ? null : (
          <EmptyState title="Henüz favori ürününüz yok.">
            Ürün sayfasındaki &quot;Favorilere ekle&quot; düğmesiyle ekleyebilirsiniz.{" "}
            <Link href="/magaza/urunler" className="text-brand-600 hover:underline">
              Ürünlere göz atın
            </Link>
            .
          </EmptyState>
        )
      ) : (
        <ProductGrid products={list.items} />
      )}
      {list.total > 0 && <Pagination page={list.page} size={list.size} total={list.total} params={{}} />}
    </>
  );
}
