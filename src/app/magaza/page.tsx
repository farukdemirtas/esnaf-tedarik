import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { EmptyState, PageHeader, StatCard } from "@/components/panel/ui";
import { AdBanner } from "@/components/shop/ad-banner";
import { DeliveryNotice, ProductGrid } from "@/components/shop/product-card";
import { SponsoredStrip } from "@/components/shop/sponsored-strip";
import { requirePanel } from "@/lib/auth/server";
import { chamberIdOf, memberScope } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { listShopCatalogs } from "@/modules/revenue/catalogs";
import { shopHome } from "@/modules/shop/catalog";
import type { ProductSummary } from "@/modules/shop/catalog";

type HomeCampaign = NonNullable<Awaited<ReturnType<typeof shopHome>>>["campaigns"][number];

function daysLeft(endsAt: Date) {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}

function CampaignCard({ campaign: c, hero = false, span = false }: { campaign: HomeCampaign; hero?: boolean; span?: boolean }) {
  const wide = hero;
  const left = daysLeft(c.endsAt);
  const href = `/magaza/urunler?kampanya=1&tedarikci=${encodeURIComponent(c.supplierId)}`;
  return (
    <li className={span ? "lg:col-span-2" : "flex"}>
      <Link
        href={href}
        className={`group relative isolate flex w-full flex-col overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-0.5 ${
          wide ? "min-h-[250px] justify-between p-6 text-white sm:p-8" : "border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-brand-50 p-5 shadow-[0_16px_40px_-28px_rgba(184,117,20,0.9)] hover:shadow-[0_22px_44px_-24px_rgba(184,117,20,0.85)]"
        }`}
        style={
          wide
            ? { background: "linear-gradient(128deg, #0a1f29 0%, #145064 52%, #1c6d84 100%)" }
            : undefined
        }
      >
        {wide && (
          <>
            <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-accent-400/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "42px 42px",
                maskImage: "radial-gradient(ellipse at 70% 40%, black 10%, transparent 70%)",
              }}
            />
            <span aria-hidden className="pointer-events-none absolute right-6 bottom-2 font-display text-7xl font-semibold tracking-tight text-white/10 sm:text-8xl">
              ÖZEL
            </span>
          </>
        )}
        {!wide && <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-accent-400 to-accent-600" aria-hidden />}
        {c.imagePath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={withBase(`/api/files/${c.imagePath}`)}
            alt=""
            className={`pointer-events-none absolute inset-y-0 right-0 hidden object-cover sm:block ${wide ? "w-2/5 opacity-80" : "w-1/3 opacity-70"}`}
          />
        )}
        <div className={`relative ${wide ? "" : "pl-2"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] uppercase ${wide ? "bg-accent-400 text-brand-950" : "bg-accent-400/20 text-accent-600"}`}>
              {c.featured ? "Öne çıkan" : "Kampanya"}
            </span>
            <span className={`text-xs font-semibold ${wide ? "text-brand-100" : "text-slate-500"}`}>{c.supplier.tradeName}</span>
          </div>
          <h3 className={`mt-3 font-display font-semibold tracking-tight ${wide ? "max-w-xl text-3xl leading-tight sm:text-4xl" : "text-xl text-brand-950"}`}>
            {c.title}
          </h3>
          {c.description && (
            <p className={`mt-2 max-w-xl text-sm leading-relaxed ${wide ? "line-clamp-2 text-brand-100/90" : "line-clamp-2 text-slate-600"}`}>{c.description}</p>
          )}
        </div>
        <div className={`relative mt-6 flex flex-wrap items-end justify-between gap-3 ${wide ? "" : "pl-2"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-2xl px-3 py-2 ${wide ? "bg-white/10" : "bg-white/80"}`}>
              <span className={`block font-display text-2xl font-semibold leading-none tabular-nums ${wide ? "text-accent-300" : "text-brand-800"}`}>{left}</span>
              <span className={`text-[11px] font-medium ${wide ? "text-brand-100" : "text-slate-500"}`}>gün kaldı</span>
            </span>
            <span className={`text-sm ${wide ? "text-brand-100" : "text-slate-600"}`}>
              {c._count.discounts} ürün
              <span className={`block text-xs ${wide ? "text-white/70" : "text-slate-500"}`}>Son gün {fmtDate(c.endsAt)}</span>
            </span>
          </div>
          <span className={`text-sm font-semibold ${wide ? "text-accent-300" : "text-brand-800"}`}>
            Kampanyayı gör <span className="inline-block transition group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </Link>
    </li>
  );
}

export const metadata: Metadata = { title: "Mağaza" };

function ProductShelf({ title, products, href }: { title: string; products: ProductSummary[]; href?: string }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-8" aria-label={title}>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-brand-950">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-semibold text-brand-700 transition hover:text-brand-900 hover:underline">
            Tümünü gör →
          </Link>
        )}
      </div>
      <ProductGrid products={products} />
    </section>
  );
}

export default async function MemberHome({ searchParams }: { searchParams: Promise<{ sifre?: string }> }) {
  const auth = await requirePanel("member");
  const scope = memberScope(auth); // yalnızca kendi işletmesinin verisi
  const chamberId = chamberIdOf(auth);
  const sp = await searchParams;
  const now = new Date();
  const canShop = auth.permissions.has("memberSelf.shop");

  const [openOrders, totalOrders, home, catalogs] = await Promise.all([
    db.supplierOrder.count({ where: { order: scope, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED"] } } }),
    db.order.count({ where: scope }),
    canShop ? shopHome(auth) : null,
    canShop ? listShopCatalogs(auth).then((r) => r.items) : [],
  ]);
  const announcements =
    home?.announcements ??
    (await db.announcement.findMany({
      where: {
        chamberId,
        audience: { in: ["ALL", "MEMBERS"] },
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
    }));
  const dues = auth.member!.dues;

  return (
    <>
      <PageHeader title={`Hoş geldiniz, ${auth.member!.name}`} />
      <div className="mb-6 space-y-3">
        {sp.sifre && <Alert tone="success">Şifreniz değiştirildi.</Alert>}
        {dues.orderingBlocked ? (
          <Alert tone="warning">
            Vadesi geçmiş {dues.overdueCount} aidat kaydınız bulunduğu için sipariş verme geçici olarak kapalıdır. Lütfen Oda ile
            iletişime geçin.
          </Alert>
        ) : (
          dues.overdueCount > 0 && <Alert tone="info">Vadesi geçmiş {dues.overdueCount} aidat kaydınız bulunuyor.</Alert>
        )}
      </div>

      {home && (
        <>
          <form method="get" action={withBase("/magaza/urunler")} role="search" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
            <label className="min-w-[200px] flex-1">
              <span className="label">Ürün ara</span>
              <input type="search" name="q" placeholder="Ürün adı, marka veya barkod" className="input py-2" />
            </label>
            <button type="submit" className="btn-primary py-2">
              Ara
            </button>
          </form>
          <DeliveryNotice ctx={home.ctx} />
          <AdBanner chamberId={chamberId} slotCode="home-top" />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Devam eden siparişlerim" value={openOrders} />
        <StatCard label="Toplam siparişim" value={totalOrders} />
      </div>

      {home && home.ctx.address && (
        <>
          {home.campaigns.length > 0 && (
            <section className="mt-10" aria-label="Odaya özel kampanyalar">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-accent-600 uppercase">Üyelere özel</p>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-brand-950">Odaya özel kampanyalar</h2>
                </div>
                <Link href="/magaza/urunler?kampanya=1" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
                  Tümünü gör →
                </Link>
              </div>
              <ul className="grid gap-4 lg:grid-cols-2">
                {home.campaigns.map((c, i) => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    hero={i === 0}
                    span={i === 0 || (home.campaigns.length % 2 === 0 && i === home.campaigns.length - 1)}
                  />
                ))}
              </ul>
            </section>
          )}

          {catalogs.length > 0 && (
            <section className="mt-8" aria-labelledby="dijital-kataloglar">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="dijital-kataloglar" className="text-lg font-semibold text-slate-900">
                  Dijital kataloglar
                </h2>
                <Link href="/magaza/kataloglar" className="text-sm font-semibold text-brand-600 hover:underline">
                  Tümünü gör →
                </Link>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalogs.slice(0, 3).map((c) => (
                  <li key={c.id} className="flex">
                    <Link
                      href={`/magaza/kataloglar/${c.id}`}
                      className="card flex w-full items-center gap-3 p-3 transition hover:border-brand-200 hover:shadow"
                    >
                      {c.coverPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={withBase(`/api/files/${c.coverPath}`)} alt="" loading="lazy" className="h-16 w-12 shrink-0 rounded border border-slate-100 bg-white object-cover" />
                      ) : (
                        <span aria-hidden="true" className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-brand-50 text-xs font-bold text-brand-700">
                          Katalog
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="line-clamp-2 block text-sm font-semibold text-slate-900">{c.title}</span>
                        <span className="block text-xs text-slate-500">
                          {c.supplier.tradeName} · {c._count.items} ürün
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <SponsoredStrip auth={auth} limit={4} />
          <ProductShelf title="İndirimli ürünler" products={home.discounted} href="/magaza/urunler?kampanya=1" />
          <ProductShelf title="En çok tercih edilenler" products={home.mostOrdered} />
          <ProductShelf title="Yeni ürünler" products={home.newest} href="/magaza/urunler?sirala=yeni" />

          <section className="mt-8" aria-label="Tedarikçiler">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Tedarikçiler</h2>
              <Link href="/magaza/tedarikciler" className="text-sm font-semibold text-brand-600 hover:underline">
                Tümünü gör →
              </Link>
            </div>
            {home.suppliers.length === 0 ? (
              <EmptyState title="Bölgenize hizmet veren tedarikçi bulunmuyor." />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {home.suppliers.map((s) => (
                  <li key={s.id} className="flex">
                    <Link
                      href={`/magaza/tedarikciler/${s.slug}`}
                      className="card flex w-full items-center gap-3 p-3 transition hover:border-brand-200 hover:shadow"
                    >
                      {s.logoPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={withBase(`/api/files/${s.logoPath}`)} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
                      ) : (
                        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-50 font-bold text-brand-700">
                          {s.tradeName.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 text-sm font-semibold text-slate-900">{s.tradeName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold text-slate-900">Duyurular</h2>
      {announcements.length === 0 ? (
        <EmptyState title="Şu an yayında duyuru yok." />
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{a.title}</h3>
                <time className="shrink-0 text-xs text-slate-500">{fmtDate(a.publishedAt)}</time>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
