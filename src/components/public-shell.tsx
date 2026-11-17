import Link from "next/link";
import { Logo } from "./brand";

/** Başvuru ve bilgilendirme gibi herkese açık sayfalar için ortak çerçeve */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/giris" aria-label="ESNAF TEDARİK — giriş sayfası" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Logo />
          </Link>
          <Link
            href="/giris"
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Giriş
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-3xl px-4 py-4 text-center text-xs text-slate-500">
          Samsun Bakkallar ve Her Çeşit Bayiler Esnaf Odası
        </p>
      </footer>
    </div>
  );
}
