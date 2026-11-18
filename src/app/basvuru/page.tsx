import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Başvuru" };

const OPTIONS = [
  {
    href: "/basvuru/uye",
    title: "Üyelik başvurusu (bakkal / market)",
    text: "Oda üyesi işletmeler içindir. Onaydan sonra farklı tedarikçilerin fiyatlarını karşılaştırıp tek sepetle sipariş verebilirsiniz. Üyelerden komisyon alınmaz.",
    cta: "Üyelik başvurusu yap",
  },
  {
    href: "/basvuru/tedarikci",
    title: "Tedarikçi firma başvurusu",
    text: "Distribütör, üretici ve toptancı firmalar içindir. Onaydan sonra ürün ve fiyatlarınızı yayınlayıp Oda üyelerinden sipariş alabilirsiniz.",
    cta: "Firma başvurusu yap",
  },
];

export default function ApplicationChoicePage() {
  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-950">Başvuru</h1>
      <p className="mt-2 text-slate-600">
        Başvurunuz Oda tarafından incelenir. Onaylandığında giriş bilgileriniz size iletilir.
      </p>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="card group flex flex-col p-6 hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-[0_18px_40px_-24px_rgba(20,80,100,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <h2 className="font-display text-lg font-semibold tracking-tight text-brand-900">{o.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{o.text}</p>
            <span className="mt-5 text-sm font-semibold text-brand-700 transition group-hover:text-brand-900 group-hover:underline">{o.cta} →</span>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-600">
        Zaten hesabınız var mı?{" "}
        <Link href="/giris" className="font-medium text-brand-600 hover:underline">
          Giriş yapın
        </Link>
      </p>
    </PublicShell>
  );
}
