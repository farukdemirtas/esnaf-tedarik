import { withBase } from "@/lib/base-path";
import { activeAds } from "@/modules/revenue/ads";

/**
 * Banner reklam alanı (sunucu bileşeni). Yayındaki reklamları getirir (gösterim sayılır),
 * tıklama /api/reklam/<id> üzerinden sayılır ve güvenli adrese yönlendirilir.
 * Reklam yoksa hiçbir şey göstermez.
 */
export async function AdBanner({ chamberId, slotCode, limit = 1, className = "" }: { chamberId: string; slotCode: string; limit?: 1 | 2 | 3; className?: string }) {
  const ads = await activeAds(chamberId, slotCode, Math.min(3, Math.max(1, limit)));
  if (ads.length === 0) return null;
  return (
    <section aria-label="Reklam" className={`mb-6 ${className}`}>
      <ul className={`grid gap-3 ${ads.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {ads.map((ad) => (
          <li key={ad.id} className="relative">
            <a
              href={withBase(`/api/reklam/${ad.id}`)}
              className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              style={{ aspectRatio: `${ad.slot.width} / ${ad.slot.height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={withBase(`/api/files/${ad.imagePath}`)} alt={ad.title} width={ad.slot.width} height={ad.slot.height} className="h-full w-full object-cover" />
            </a>
            <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
              Reklam
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
