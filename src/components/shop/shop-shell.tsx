import { Logo } from "@/components/brand";
import type { NavItem } from "@/components/panel/nav-links";
import { withBase } from "@/lib/base-path";
import type { AuthContext } from "@/modules/auth/context";
import { unreadCount } from "@/modules/notifications/inbox";
import Link from "next/link";
import { AccountMenu } from "./account-menu";

/** Mağaza üst çubuğu: sol menü yok; hesap menüsü ve sepet sağ üstte. */
export async function ShopShell({
  auth,
  nav,
  cartCount,
  children,
}: {
  auth: AuthContext;
  nav: NavItem[];
  cartCount: number;
  children: React.ReactNode;
}) {
  const items = nav.filter((i) => i.href !== "/magaza/sepet" && (!i.permission || auth.permissions.has(i.permission)));
  const unread = await unreadCount(auth.userId);
  const orgName = auth.member?.name ?? null;
  const browse = items.filter((i) => ["/magaza", "/magaza/urunler", "/magaza/tedarikciler", "/magaza/kataloglar"].includes(i.href));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/magaza" aria-label="Mağaza ana sayfa" className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Mağaza">
            {browse.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-800">
                {item.label}
              </Link>
            ))}
          </nav>
          <form method="get" action={withBase("/magaza/urunler")} role="search" className="ml-auto hidden min-w-0 flex-1 md:block lg:max-w-sm">
            <label className="sr-only" htmlFor="shop-search">
              Ürün ara
            </label>
            <input id="shop-search" type="search" name="q" placeholder="Ürün, marka veya barkod" className="input py-2" />
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
            <Link
              href="/magaza/bildirimler"
              className="relative rounded-xl p-2 text-slate-600 transition hover:bg-brand-50 hover:text-brand-800"
              aria-label={unread ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-brand-950">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link
              href="/magaza/sepet"
              className="relative rounded-xl p-2 text-slate-600 transition hover:bg-brand-50 hover:text-brand-800"
              aria-label={cartCount > 0 ? `Sepet, ${cartCount} ürün` : "Sepet"}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6h15l-1.5 9h-12L5 3H2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </Link>
            <AccountMenu name={auth.fullName} org={orgName} links={items.map((i) => ({ href: i.href, label: i.label }))} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Mağaza">
          {browse.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 animate-rise sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
