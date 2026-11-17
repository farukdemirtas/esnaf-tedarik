import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/brand";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, DL, PageHeader, Section, Table, Td, toOptions } from "@/components/panel/ui";
import { updateOfferDetailsAction, updatePriceStockAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { NotFoundError } from "@/lib/errors";
import { fmtDateTime, fmtMoney, fmtNumber, moneyInput, PACK_TYPE, UNIT_TYPE } from "@/lib/format";
import { getMyOffer, VAT_RATES } from "@/modules/catalog/offers-supplier";

export const metadata: Metadata = { title: "Ürün" };

const STOCK_REASON: Record<string, string> = {
  MANUAL: "Elle güncelleme",
  ORDER: "Sipariş",
  ORDER_CANCEL: "İptal iadesi",
  ORDER_REJECT: "Red iadesi",
};

/** Miktarı forma "12,5" biçiminde yazar (binlik ayırıcı olmadan) */
const qtyInput = (v: { toString(): string }) => v.toString().replace(".", ",");

export default async function MyOfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ yeni?: string }> }) {
  const { auth, can } = await requireSupplierPage();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const o = await getMyOffer(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const p = o.product;
  const stock = o.stock?.quantity ?? 0;
  const packName = PACK_TYPE[o.packType];
  const packLabel = `${packName}${o.unitsPerPack > 1 ? ` × ${o.unitsPerPack}` : ""}`;
  const withVat = o.packPrice.mul(100 + o.vatRate).div(100);

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.brand.name} · ${p.category.name} · ${packLabel}`}
        back={{ href: "/tedarikci/urunler", label: "Ürünlerim" }}
        actions={o.removedByAdmin ? <Badge tone="red">Oda kaldırdı</Badge> : o.active ? <Badge tone="green">Satışta</Badge> : <Badge>Kapalı</Badge>}
      />

      <div className="mb-6 space-y-3 empty:hidden">
        {sp.yeni === "1" && (
          <Alert tone="success">
            {o.active ? "Ürün kaydedildi ve satışa açıldı." : "Ürün kaydedildi. Satışa açmak için aşağıdaki “Satışta” kutusunu işaretleyip kaydedin."}
          </Alert>
        )}
        {o.removedByAdmin && (
          <Alert tone="error">
            <div className="font-semibold">Bu ürün Oda tarafından satıştan kaldırıldı; üyeler göremez.</div>
            {o.removalReason && <div className="mt-1">Gerekçe: {o.removalReason}</div>}
            <div className="mt-1">Tekrar satışa açmak için Oda ile iletişime geçin.</div>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Fiyat ve stok">
            {can("supplierSelf.pricing") ? (
              <ActionForm action={updatePriceStockAction} className="space-y-4">
                <input type="hidden" name="id" value={o.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    name="packPrice"
                    label={`${packName} fiyatı (KDV hariç, ₺)`}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={moneyInput(o.packPrice)}
                    hint="Örn. 450,50"
                  />
                  <Field
                    name="stock"
                    label={`Stok (${packName.toLocaleLowerCase("tr-TR")})`}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={qtyInput(stock)}
                    hint="Elinizdeki güncel miktarı yazın; fark stok hareketlerine işlenir."
                  />
                </div>
                <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Şu anki fiyat KDV dahil: <strong className="tabular-nums">{fmtMoney(withVat)}</strong> (%{o.vatRate} KDV)
                  {o.unitsPerPack > 1 && (
                    <>
                      {" "}
                      · Adet başı (KDV hariç): <span className="tabular-nums">{fmtMoney(o.unitPrice)}</span>
                    </>
                  )}
                </p>
                <SubmitButton>Fiyat ve stoğu kaydet</SubmitButton>
              </ActionForm>
            ) : (
              <DL
                items={[
                  [`${packName} fiyatı (KDV hariç)`, fmtMoney(o.packPrice)],
                  [`KDV dahil (%${o.vatRate})`, fmtMoney(withVat)],
                  ["Stok", `${fmtNumber(stock)} ${packName.toLocaleLowerCase("tr-TR")}`],
                ]}
              />
            )}
          </Section>

          <Section title="Satış bilgileri">
            {can("supplierSelf.offers") ? (
              <ActionForm action={updateOfferDetailsAction} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={o.id} />
                <SelectField name="packType" label="Nasıl satıyorsunuz?" required defaultValue={o.packType} options={toOptions(PACK_TYPE)} />
                <Field
                  name="unitsPerPack"
                  label="Paket içi adet"
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  defaultValue={String(o.unitsPerPack)}
                  hint="Koli içindeki adet. Adet/kg satışta 1"
                />
                <SelectField
                  name="vatRate"
                  label="KDV oranı"
                  required
                  defaultValue={String(o.vatRate)}
                  options={VAT_RATES.map((v) => ({ value: String(v), label: `%${v}` }))}
                  hint="Doğru oranı muhasebecinize danışın"
                />
                <Field name="minOrderQty" label="En az sipariş miktarı" required inputMode="decimal" defaultValue={qtyInput(o.minOrderQty)} />
                <Field
                  name="orderStep"
                  label="Sipariş artış miktarı"
                  required
                  inputMode="decimal"
                  defaultValue={qtyInput(o.orderStep)}
                  hint="Örn. 2 ise üye 2, 4, 6… koli sipariş verebilir"
                />
                <Field name="sku" label="Stok kodunuz" maxLength={50} defaultValue={o.sku ?? ""} hint="İsteğe bağlı." />
                <div className="sm:col-span-2">
                  <CheckboxField
                    name="active"
                    label="Satışta (üyeler bu ürünü görür ve sipariş verebilir)"
                    defaultChecked={o.active}
                    hint={o.removedByAdmin ? "Oda bu ürünü kaldırdığı için işaretli olsa da üyeler göremez." : undefined}
                  />
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton>Satış bilgilerini kaydet</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <DL
                items={[
                  ["Satış birimi", packLabel],
                  ["KDV oranı", `%${o.vatRate}`],
                  ["En az sipariş", fmtNumber(o.minOrderQty)],
                  ["Artış miktarı", fmtNumber(o.orderStep)],
                  ["Stok kodu", o.sku ?? "—"],
                  ["Durum", o.active ? "Satışta" : "Kapalı"],
                ]}
              />
            )}
          </Section>

          <div>
            <h2 className="mb-2 font-semibold text-slate-900">Fiyat geçmişi</h2>
            {o.prices.length === 0 ? (
              <p className="text-sm text-slate-500">Kayıt yok.</p>
            ) : (
              <Table head={["Başlangıç", "Bitiş", "Fiyat (KDV hariç)"]}>
                {o.prices.map((pr) => (
                  <tr key={pr.id}>
                    <Td className="whitespace-nowrap">{fmtDateTime(pr.validFrom)}</Td>
                    <Td className="whitespace-nowrap">{pr.validTo ? fmtDateTime(pr.validTo) : <Badge tone="green">Güncel</Badge>}</Td>
                    <Td className="tabular-nums">
                      {fmtMoney(pr.packPrice)}
                      {pr.type === "CHAMBER" && (
                        <span className="ml-2">
                          <Badge tone="blue">Odaya özel</Badge>
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-slate-900">Stok hareketleri</h2>
            {o.stockMovements.length === 0 ? (
              <p className="text-sm text-slate-500">Kayıt yok.</p>
            ) : (
              <Table head={["Tarih", "Değişim", "Neden", "Açıklama"]}>
                {o.stockMovements.map((m) => {
                  const plus = Number(m.change.toString()) > 0;
                  return (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</Td>
                      <Td className={`font-semibold tabular-nums ${plus ? "text-emerald-700" : "text-red-700"}`}>
                        {plus ? "+" : ""}
                        {fmtNumber(m.change)}
                      </Td>
                      <Td>{STOCK_REASON[m.reason] ?? m.reason}</Td>
                      <Td className="text-slate-600">{m.reference ?? "—"}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </div>
        </div>

        <Section title="Ürün" className="self-start">
          <div className="space-y-4">
            {p.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${p.images[0].path}`} alt={p.name} className="aspect-square w-full max-w-[260px] rounded-lg border border-slate-200 object-contain" />
            ) : (
              <div className="aspect-square w-full max-w-[260px] rounded-lg bg-slate-100" />
            )}
            <DL
              items={[
                ["Ürün adı", p.name],
                ["Marka", p.brand.name],
                ["Kategori", p.category.name],
                ["Barkod", p.barcode ? <span className="font-mono text-sm">{p.barcode}</span> : "—"],
                ["Birim", `${p.unitAmount ? `${fmtNumber(p.unitAmount)} ` : ""}${UNIT_TYPE[p.unitType]}`],
              ]}
            />
            <p className="text-xs text-slate-500">Ürün adı, görseli ve barkodu Oda kataloğundan gelir; değişiklik için Oda ile iletişime geçin.</p>
          </div>
        </Section>
      </div>
    </>
  );
}
