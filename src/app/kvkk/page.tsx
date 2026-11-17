import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni" };

const DATA = [
  "İşletme / firma bilgileri (işletme veya firma adı, ticari unvan, oda sicil numarası, adres)",
  "İletişim bilgileri (yetkili kişi adı, telefon, e-posta)",
  "Vergi bilgileri (vergi dairesi, vergi / TC kimlik numarası) — şifreli olarak saklanır",
  "Sipariş kayıtları",
  "Giriş kayıtları (giriş zamanı, IP adresi gibi güvenlik kayıtları)",
];

const PURPOSES = [
  "Üyelik ve tedarikçi başvurularının değerlendirilmesi",
  "Siparişlerin ilgili tedarikçiye iletilmesi",
  "Platformun ve hesapların güvenliğinin sağlanması",
];

export default function KvkkPage() {
  return (
    <PublicShell>
      <h1 className="text-2xl font-bold text-slate-900">KVKK Aydınlatma Metni</h1>

      <div role="note" className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Taslak — Bu metin Oda tarafından hukuki inceleme sonrası yayımlanacaktır.
      </div>

      <div className="card mt-6 space-y-6 p-5 text-sm leading-relaxed text-slate-700 sm:p-6">
        <section>
          <h2 className="text-base font-bold text-slate-900">İşlenen veriler</h2>
          <p className="mt-1.5">Platform kapsamında aşağıdaki veriler işlenir:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {DATA.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900">İşleme amaçları</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {PURPOSES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900">Verilerin paylaşımı</h2>
          <p className="mt-1.5">
            Sipariş verileri yalnızca siparişin iletildiği ilgili tedarikçi ile, siparişin hazırlanması ve teslimi için
            paylaşılır.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
