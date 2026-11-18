import { withBase } from "@/lib/base-path";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { Badge } from "@/components/panel/ui";
import { fmtMoney, fmtNumber, PACK_TYPE, UNIT_TYPE } from "@/lib/format";
import type { ProductSummary, StockState } from "@/modules/shop/catalog";
import type { ShopContext } from "@/modules/shop/context";

/** 1 = Pazartesi … 7 = Pazar */
const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function fmtDeliveryDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return "Belirtilmemiş";
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_SHORT[d - 1] ?? String(d))
    .join(", ");
}

const STOCK: Record<StockState, { label: string; tone: "green" | "amber" | "red" }> = {
  in: { label: "Stokta", tone: "green" },
  low: { label: "Az kaldı", tone: "amber" },
  out: { label: "Stokta yok", tone: "red" },
};

export function StockBadge({ state }: { state: StockState }) {
  const s = STOCK[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Paket adı küçük harfle ("koli", "adet") */
export function packLabel(packType: string): string {
  return (PACK_TYPE[packType] ?? packType).toLocaleLowerCase("tr");
}

export function unitLabel(unitType: string): string {
  return (UNIT_TYPE[unitType] ?? unitType).toLocaleLowerCase("tr");
}

/** Adres yoksa uyarı, varsa geçerli teslimat ilçesi */
export function DeliveryNotice({ ctx }: { ctx: ShopContext }) {
  if (!ctx.address)
    return (
      <div className="mb-4">
        <Alert tone="warning">
          Ürünleri ve fiyatları görebilmek için bir teslimat adresi eklemeniz gerekiyor. Tedarikçiler yalnızca hizmet verdikleri ilçelerde
          satış yapar.{" "}
          <Link href="/magaza/hesabim" className="font-semibold underline">
            Hesabım sayfasından adres ekleyin
          </Link>
          .
        </Alert>
      </div>
    );
  return (
    <p className="mb-4 text-sm text-slate-600">
      Teslimat ilçesi: <strong className="text-slate-900">{ctx.address.districtName}</strong>
      <span className="text-slate-500"> ({ctx.address.title})</span> ·{" "}
      <Link href="/magaza/hesabim" className="text-brand-600 hover:underline">
        Değiştir
      </Link>
    </p>
  );
}

export function ProductImage({ path, alt, className = "" }: { path: string | null; alt: string; className?: string }) {
  if (!path)
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-xs font-medium text-slate-400 ${className}`} aria-hidden="true">
        Görsel yok
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={withBase(`/api/files/${path}`)} alt={alt} loading="lazy" className={`bg-white object-contain ${className}`} />;
}

export function ProductCard({ product: p }: { product: ProductSummary }) {
  const best = p.best;
  const discounted = best && best.finalPackPrice.lt(best.listPackPrice);
  return (
    <article className="card group flex w-full flex-col overflow-hidden hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-[0_18px_40px_-24px_rgba(20,80,100,0.45)]">
      <Link href={`/magaza/urun/${p.id}`} className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <div className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
          <ProductImage path={p.imagePath} alt={p.name} className="aspect-square w-full transition duration-500 group-hover:scale-[1.03]" />
          {p.hasCampaign && (
            <span className="absolute top-2.5 left-2.5">
              <Badge tone="amber">Kampanya</Badge>
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col border-t border-slate-100/80 p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{p.brand.name}</div>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-brand-950">{p.name}</h3>
          {best ? (
            <div className="mt-auto pt-3">
              <div className="text-xs text-slate-500">
                {PACK_TYPE[best.packType] ?? best.packType}
                {best.unitsPerPack > 1 && ` × ${best.unitsPerPack}`} · KDV hariç
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-xl font-semibold tabular-nums tracking-tight text-brand-800">{fmtMoney(best.finalPackPrice)}</span>
                {discounted && <span className="text-xs text-slate-400 line-through tabular-nums">{fmtMoney(best.listPackPrice)}</span>}
              </div>
              <div className="text-xs text-slate-600 tabular-nums">KDV dahil {fmtMoney(best.finalPackPriceVat)}</div>
              <div className="text-xs text-slate-500 tabular-nums">
                Birim: {fmtMoney(best.unitPrice)} / {unitLabel(p.unitType)}
                {p.unitAmount && ` (${fmtNumber(p.unitAmount)})`}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <StockBadge state={best.stock} />
                <span className="text-xs text-slate-500">{p.offerCount} tedarikçi</span>
              </div>
            </div>
          ) : (
            <div className="mt-auto pt-3 text-xs text-slate-500">Bölgenizde teklif yok</div>
          )}
        </div>
      </Link>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}
