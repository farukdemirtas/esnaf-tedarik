import { DeliveryScene } from "./delivery-scene";
import { Logo } from "./brand";

/** Giriş ve şifre sayfaları için ortak çerçeve */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.35fr)_minmax(0,440px)]">
      <section className="relative hidden overflow-hidden text-white lg:flex lg:items-center lg:p-10 xl:p-14">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, #0a1f29 0%, #145064 42%, #17657a 72%, #1f7f96 100%)",
            backgroundSize: "160% 160%",
            animation: "et-shimmer 14s ease-in-out infinite",
          }}
        />
        <div
          className="pointer-events-none absolute -left-16 top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "rgba(232,176,74,0.22)", animation: "et-soft-pulse 7s ease-in-out infinite" }}
        />
        <div
          className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full blur-3xl"
          style={{ background: "rgba(169,221,230,0.18)", animation: "et-soft-pulse 9s ease-in-out infinite 1s" }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)",
          }}
        />

        <div className="relative z-10 grid w-full items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,42%)] xl:gap-10">
          <div className="animate-rise">
            <Logo size="lg" inverted />
            <p className="mt-8 mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Esnaf odası platformu</p>
            <h2 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight xl:text-[2.65rem]">
              Bakkal ve marketler için
              <span className="block text-accent-300">tek noktadan toptan tedarik</span>
            </h2>
            <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-brand-100/95">
              {[
                "Farklı tedarikçilerin fiyatlarını tek ekranda karşılaştırın",
                "Tek sepetle birden fazla firmaya sipariş verin",
                "Odaya özel kampanyalardan yararlanın",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-brand-100/80">Samsun Bakkallar ve Her Çeşit Bayiler Esnaf Odası</p>
          </div>
          <DeliveryScene className="mx-auto h-auto w-full max-w-[460px] drop-shadow-[0_18px_30px_rgba(0,0,0,0.18)]" />
        </div>
      </section>

      <section className="relative flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 lg:hidden" style={{ background: "linear-gradient(180deg, rgba(20,80,100,0.08), transparent 40%)" }} />
        <div className="relative mx-auto w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="card p-6 sm:p-7">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-brand-950">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
