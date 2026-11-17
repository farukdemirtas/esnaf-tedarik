import { Logo } from "./brand";

/** Giriş ve şifre sayfaları için ortak çerçeve */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo size="lg" inverted />
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Bakkal ve marketler için
            <br />
            tek noktadan toptan tedarik
          </h2>
          <ul className="mt-6 space-y-3 text-brand-100">
            <li>• Farklı tedarikçilerin fiyatlarını tek ekranda karşılaştırın</li>
            <li>• Tek sepetle birden fazla firmaya sipariş verin</li>
            <li>• Odaya özel kampanyalardan yararlanın</li>
          </ul>
        </div>
        <p className="text-sm text-brand-200">Samsun Bakkallar ve Her Çeşit Bayiler Esnaf Odası</p>
      </section>
      <section className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
