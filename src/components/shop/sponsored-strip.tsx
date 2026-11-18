import { Badge } from "@/components/panel/ui";
import { ProductCard } from "@/components/shop/product-card";
import type { AuthContext } from "@/modules/auth/context";
import { sponsoredProducts } from "@/modules/shop/catalog";

/** Sponsorlu (öne çıkarılan) ürünler şeridi. Ürün yoksa hiçbir şey göstermez. */
export async function SponsoredStrip({ auth, limit = 4, className = "mt-8" }: { auth: AuthContext; limit?: number; className?: string }) {
  const products = await sponsoredProducts(auth, limit);
  if (products.length === 0) return null;
  return (
    <section className={className} aria-labelledby="one-cikan-urunler">
      <h2 id="one-cikan-urunler" className="mb-3 text-lg font-semibold text-slate-900">
        Öne çıkan ürünler
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id} className="relative flex">
            <ProductCard product={p} />
            <span className="pointer-events-none absolute top-2 right-2">
              <Badge tone="blue">Sponsorlu</Badge>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
