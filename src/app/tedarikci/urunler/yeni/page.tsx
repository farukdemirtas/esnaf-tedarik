import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/brand";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, EmptyState, PageHeader, Section, toOptions } from "@/components/panel/ui";
import { createOfferAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { NotFoundError } from "@/lib/errors";
import { fmtNumber, PACK_TYPE, UNIT_TYPE } from "@/lib/format";
import { getCatalogProductForSupplier, searchCatalogForSupplier, VAT_RATES } from "@/modules/catalog/offers-supplier";

export const metadata: Metadata = { title: "Yeni Ürün Ekle" };

const REQUEST_LINK = (
  <Link href="/tedarikci/urun-talepleri" className="font-semibold text-brand-600 hover:underline">
    Katalogda bulamadınız mı? Yeni ürün talebi gönderin →
  </Link>
);

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ q?: string; urun?: string }> }) {
  const { auth } = await requireSupplierPage("supplierSelf.offers", "supplierSelf.pricing");
  const sp = await searchParams;

  // ───── 2. adım: seçilen ürün için fiyat ve stok girişi ─────
  if (sp.urun) {
    const p = await getCatalogProductForSupplier(auth, sp.urun).catch((e) => {
      if (e instanceof NotFoundError) notFound();
      throw e;
    });
    // Varsayılan koli; koli zaten satılıyorsa henüz satılmayan ilk paket türü
    const sold = new Set<string>(p.offers.map((o) => o.packType));
    const defaultPack = sold.has("KOLI") ? (Object.keys(PACK_TYPE).find((k) => !sold.has(k)) ?? "KOLI") : "KOLI";

    return (
      <>
        <PageHeader
          title="Fiyat ve stok girin"
          description="Seçtiğiniz ürünü hangi paketle, hangi fiyatla satacağınızı belirtin."
          back={{ href: "/tedarikci/urunler/yeni", label: "Başka ürün ara" }}
        />
        <div className="grid gap-6 xl:grid-cols-3">
          <Section title="Seçilen ürün" className="xl:order-2">
            <ProductSummary p={p} />
            {p.offers.length > 0 && (
              <div className="mt-4">
                <Alert tone="info">
                  Bu ürünü zaten satıyorsunuz:{" "}
                  {p.offers.map((o, i) => (
                    <span key={o.id}>
                      {i > 0 && ", "}
                      <Link href={`/tedarikci/urunler/${o.id}`} className="font-semibold underline">
                        {PACK_TYPE[o.packType]}
                      </Link>
                    </span>
                  ))}
                  . Aynı ürünü farklı bir paket türüyle de satabilirsiniz.
                </Alert>
              </div>
            )}
          </Section>

          <Section title="Satış bilgileri" className="xl:order-1 xl:col-span-2">
            <ActionForm action={createOfferAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="productId" value={p.id} />
              <SelectField name="packType" label="Nasıl satıyorsunuz?" required defaultValue={defaultPack} options={toOptions(PACK_TYPE)} />
              <Field
                name="unitsPerPack"
                label="Paket içi adet"
                required
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                defaultValue="1"
                hint="Koli içindeki adet. Adet/kg satışta 1"
              />
              <Field
                name="packPrice"
                label="Fiyat (KDV hariç, ₺)"
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="Örn. 450,50"
                hint="Seçtiğiniz satış birimi (koli, adet, kg, paket) için fiyat."
              />
              <SelectField
                name="vatRate"
                label="KDV oranı"
                required
                defaultValue="10"
                options={VAT_RATES.map((v) => ({ value: String(v), label: `%${v}` }))}
                hint="Doğru oranı muhasebecinize danışın"
              />
              <Field name="minOrderQty" label="En az sipariş miktarı" required inputMode="decimal" defaultValue="1" hint="Üyenin tek seferde alabileceği en az miktar." />
              <Field name="orderStep" label="Sipariş artış miktarı" required inputMode="decimal" defaultValue="1" hint="Örn. 2 ise üye 2, 4, 6… koli sipariş verebilir" />
              <Field
                name="stock"
                label="Stok"
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="Örn. 100"
                hint="Sipariş birimi cinsinden: koli satıyorsanız koli sayısı"
              />
              <Field name="sku" label="Stok kodunuz" maxLength={50} hint="İsteğe bağlı. Kendi sisteminizdeki ürün kodu." />
              <div className="sm:col-span-2">
                <CheckboxField name="active" label="Hemen satışa aç" defaultChecked hint="İşaretlemezseniz ürün kaydedilir ama üyeler göremez." />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton className="w-full sm:w-auto">Kaydet</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        </div>
      </>
    );
  }

  // ───── 1. adım: katalogda ürün arama ─────
  const q = sp.q?.trim() ?? "";
  const results = q.length >= 2 ? await searchCatalogForSupplier(auth, q) : [];

  return (
    <>
      <PageHeader
        title="Yeni ürün ekle"
        description="Önce satmak istediğiniz ürünü Oda kataloğunda bulun, sonra fiyat ve stoğunuzu girin."
        back={{ href: "/tedarikci/urunler", label: "Ürünlerim" }}
      />
      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[220px] flex-1">
          <span className="label">Ürün ara</span>
          <input name="q" type="search" defaultValue={q} placeholder="Ürün adı, marka veya barkod" className="input" />
        </label>
        <button type="submit" className="btn-primary">
          Ara
        </button>
      </form>

      {!q ? (
        <EmptyState title="Ürün adı, marka veya barkod yazıp “Ara” düğmesine basın.">{REQUEST_LINK}</EmptyState>
      ) : q.length < 2 ? (
        <EmptyState title="Aramak için en az 2 harf yazın." />
      ) : results.length === 0 ? (
        <EmptyState title={`“${q}” katalogda bulunamadı.`}>
          <div className="mt-2">Farklı bir kelime veya barkodla tekrar deneyin.</div>
          <div className="mt-3">{REQUEST_LINK}</div>
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">{results.length} ürün bulundu.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((p) => (
              <div key={p.id} className="card flex flex-col p-4">
                <div className="flex gap-4">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${p.images[0].path}`} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-contain" />
                  ) : (
                    <div className="h-20 w-20 shrink-0 rounded-lg bg-slate-100" />
                  )}
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-slate-600">{p.brand.name}</div>
                    <div className="text-xs text-slate-500">{p.category.name}</div>
                    {p.barcode && <div className="mt-0.5 font-mono text-xs text-slate-500">{p.barcode}</div>}
                  </div>
                </div>
                {p.offers.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    Zaten satıyorsunuz:
                    {p.offers.map((o) => (
                      <Badge key={o.id} tone="green">
                        {PACK_TYPE[o.packType]}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-4">
                  <Link href={`/tedarikci/urunler/yeni?urun=${p.id}`} className="btn-primary w-full">
                    Bu ürünü sat
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm">{REQUEST_LINK}</p>
        </>
      )}
    </>
  );
}

function ProductSummary({ p }: { p: Awaited<ReturnType<typeof getCatalogProductForSupplier>> }) {
  return (
    <div className="space-y-3">
      {p.images[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${p.images[0].path}`} alt={p.name} className="aspect-square w-full max-w-[220px] rounded-lg border border-slate-200 object-contain" />
      ) : (
        <div className="aspect-square w-full max-w-[220px] rounded-lg bg-slate-100" />
      )}
      <div>
        <div className="text-lg font-semibold text-slate-900">{p.name}</div>
        <div className="text-sm text-slate-600">
          {p.brand.name} · {p.category.name}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Birim: {p.unitAmount ? `${fmtNumber(p.unitAmount)} ` : ""}
          {UNIT_TYPE[p.unitType]}
        </div>
        {p.barcode && <div className="mt-0.5 font-mono text-xs text-slate-500">Barkod: {p.barcode}</div>}
      </div>
    </div>
  );
}
