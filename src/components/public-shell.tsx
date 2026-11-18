import Link from "next/link";
import { Logo } from "./brand";

/** Başvuru ve bilgilendirme gibi herkese açık sayfalar için ortak çerçeve */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5">
          <Link href="/giris" aria-label="ESNAF TEDARİK — giriş sayfası" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Logo />
          </Link>
          <Link href="/giris" className="btn-primary px-3.5 py-2 text-sm">
            Giriş
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 animate-rise">{children}</main>
      <footer className="border-t border-white/60 bg-white/60 backdrop-blur-md">
        <p className="mx-auto max-w-3xl px-4 py-5 text-center text-xs tracking-wide text-slate-500">
          Samsun Bakkallar ve Her Çeşit Bayiler Esnaf Odası
        </p>
      </footer>
    </div>
  );
}
