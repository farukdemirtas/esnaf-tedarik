import { Logo } from "@/components/brand";
import type { AuthContext } from "@/modules/auth/context";
import { unreadCount } from "@/modules/notifications/inbox";
import { NavLinks, type NavItem } from "./nav-links";

const PANEL_TITLES = {
  admin: "Oda Yönetim Paneli",
  staff: "Oda Personel Paneli",
  supplier: "Tedarikçi Paneli",
  member: "Mağaza Paneli",
} as const;

/**
 * Tüm paneller için ortak yerleşim. Menü öğeleri izinlere göre süzülür;
 * bu yalnızca görünüm içindir — her sayfa kendi yetki kontrolünü yapar.
 */
export async function PanelShell({
  panel,
  auth,
  nav,
  notificationsHref,
  children,
}: {
  panel: keyof typeof PANEL_TITLES;
  auth: AuthContext;
  nav: NavItem[];
  /** Verilirse üst çubukta okunmamış bildirim sayısıyla zil gösterilir */
  notificationsHref?: string;
  children: React.ReactNode;
}) {
  const items = nav.filter((i) => !i.permission || auth.permissions.has(i.permission));
  const unread = notificationsHref ? await unreadCount(auth.userId) : 0;
  const orgName = auth.supplier?.name ?? auth.member?.name ?? null;

  const sidebar = (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <Logo inverted />
        <div className="mt-3 text-xs font-medium uppercase tracking-wider text-brand-200">{PANEL_TITLES[panel]}</div>
      </div>
      <NavLinks items={items} />
    </>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-brand-800 text-white lg:flex">{sidebar}</aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <details className="lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800">
              <span aria-hidden>☰</span> Menü
            </summary>
            <div className="fixed inset-x-0 top-[61px] bottom-0 z-30 flex flex-col overflow-y-auto bg-brand-800 text-white">{sidebar}</div>
          </details>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{auth.fullName}</div>
            {orgName && <div className="truncate text-xs text-slate-500">{orgName}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {notificationsHref && (
              <a
                href={notificationsHref}
                className="relative rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"
                aria-label={unread ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </a>
            )}
            <a href="/sifre-degistir" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 sm:inline-block">
              Şifre değiştir
            </a>
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Çıkış
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
