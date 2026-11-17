import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { Alert } from "@/components/brand";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { DL, PageHeader, Section, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import {
  addMyDiscountAction,
  deleteMyCampaignAction,
  endMyCampaignAction,
  removeMyDiscountAction,
  submitMyCampaignAction,
  updateMyCampaignAction,
  withdrawMyCampaignAction,
} from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { NotFoundError } from "@/lib/errors";
import { CAMPAIGN_STATUS, CAMPAIGN_TYPE, dateTimeInput, fmtDateTime, fmtMoney, fmtNumber, PACK_TYPE } from "@/lib/format";
import { getMyCampaign } from "@/modules/campaigns/supplier";
import { listMyOffers } from "@/modules/catalog/offers-supplier";

export const metadata: Metadata = { title: "Kampanya" };

const DISCOUNT_KINDS = [
  { value: "FIXED_PRICE", label: "Kampanya fiyatı (paket başına)" },
  { value: "PERCENT", label: "Yüzde indirim (%)" },
  { value: "AMOUNT", label: "Tutar indirimi (paket başına ₺)" },
];

function discountText(kind: string, value: Prisma.Decimal) {
  if (kind === "FIXED_PRICE") return `Sabit fiyat: ${fmtMoney(value)}`;
  if (kind === "PERCENT") return `%${fmtNumber(value, 2)} indirim`;
  if (kind === "AMOUNT") return `${fmtMoney(value)} indirim`;
  return value.toString();
}

/** İndirim uygulanmış kampanya paket fiyatı (KDV hariç, 2 basamak) */
function campaignPackPrice(kind: string, value: Prisma.Decimal, packPrice: Prisma.Decimal) {
  const v = new Prisma.Decimal(value);
  const p = new Prisma.Decimal(packPrice);
  if (kind === "FIXED_PRICE") return v.toDecimalPlaces(2);
  if (kind === "PERCENT") return p.mul(new Prisma.Decimal(1).minus(v.div(100))).toDecimalPlaces(2);
  if (kind === "AMOUNT") return p.minus(v).toDecimalPlaces(2);
  return p;
}

function packLabel(packType: string, unitsPerPack: number) {
  return `${PACK_TYPE[packType] ?? packType}${unitsPerPack > 1 ? ` × ${unitsPerPack}` : ""}`;
}

export default async function MyCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, can } = await requireSupplierPage("supplierSelf.campaigns");
  const { id } = await params;
  const c = await getMyCampaign(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const editable = c.status === "DRAFT" || c.status === "REJECTED";
  const offers = editable ? await listMyOffers(auth, { state: "active", page: "1" }) : null;
  const now = new Date();
  const expired = c.endsAt <= now;

  return (
    <>
      <PageHeader
        title={c.title}
        description={CAMPAIGN_TYPE[c.type] ?? c.type}
        back={{ href: "/tedarikci/kampanyalar", label: "Kampanyalarım" }}
        actions={<StatusBadge map={CAMPAIGN_STATUS} value={c.status} />}
      />

      {(c.status === "REJECTED" || c.status === "PENDING" || (c.status === "APPROVED" && expired) || (editable && expired)) && (
        <div className="mb-6 space-y-3">
          {c.status === "REJECTED" && (
            <Alert tone="error">
              <div className="font-semibold">Oda kampanyayı reddetti.</div>
              {c.reviewNote && <div className="mt-1 whitespace-pre-line break-words">Oda notu: {c.reviewNote}</div>}
              <div className="mt-1">Gerekli düzeltmeleri yapıp yeniden onaya gönderebilirsiniz. Düzenlediğinizde kampanya taslağa döner.</div>
            </Alert>
          )}
          {c.status === "PENDING" && (
            <Alert tone="warning">
              Oda onayı bekleniyor. Onay bekleyen kampanya düzenlenemez; değişiklik için önce onaydan geri çekin.
            </Alert>
          )}
          {c.status === "APPROVED" && expired && <Alert tone="warning">Kampanyanın bitiş tarihi geçti; üyelere artık gösterilmiyor.</Alert>}
          {editable && expired && <Alert tone="warning">Bitiş tarihi geçmiş. Onaya göndermeden önce tarihleri güncelleyin.</Alert>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Kampanya bilgileri">
            {editable ? (
              <ActionForm action={updateMyCampaignAction} className="space-y-4">
                <input type="hidden" name="id" value={c.id} />
                <Field name="title" label="Kampanya adı" required minLength={3} maxLength={150} defaultValue={c.title} />
                <TextareaField name="description" label="Açıklama" maxLength={1000} rows={3} defaultValue={c.description ?? ""} hint="Üyelere gösterilir (isteğe bağlı)." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField name="type" label="Kampanya türü" required options={toOptions(CAMPAIGN_TYPE)} defaultValue={c.type} />
                  <div className="sm:pt-7">
                    <CheckboxField name="membersOnly" label="Yalnızca Oda üyelerine" defaultChecked={c.membersOnly} />
                  </div>
                  <Field name="startsAt" label="Başlangıç" type="datetime-local" required defaultValue={dateTimeInput(c.startsAt)} />
                  <Field name="endsAt" label="Bitiş" type="datetime-local" required defaultValue={dateTimeInput(c.endsAt)} />
                </div>
                <SubmitButton>Kaydet</SubmitButton>
              </ActionForm>
            ) : (
              <DL
                items={[
                  ["Tür", CAMPAIGN_TYPE[c.type] ?? c.type],
                  ["Kimlere", c.membersOnly ? "Yalnızca Oda üyeleri" : "Tüm müşteriler"],
                  ["Başlangıç", fmtDateTime(c.startsAt)],
                  ["Bitiş", fmtDateTime(c.endsAt)],
                  ["Açıklama", c.description ? <span className="whitespace-pre-line">{c.description}</span> : null],
                  ["Oda notu", c.reviewNote],
                ]}
              />
            )}
          </Section>

          <Section title={`İndirimli ürünler (${c.discounts.length})`}>
            {c.discounts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Henüz indirimli ürün eklenmedi.{editable ? " Aşağıdaki formdan ürün ekleyin; onaya göndermek için en az bir ürün gerekir." : ""}
              </p>
            ) : (
              <Table head={["Ürün", "Paket", "Normal fiyat", "İndirim", "Kampanya fiyatı", "Asgari adet", ...(editable ? [""] : [])]}>
                {c.discounts.map((d) => {
                  const sp = d.supplierProduct;
                  const price = campaignPackPrice(d.kind, d.value, sp.packPrice);
                  return (
                    <tr key={d.id}>
                      <Td>
                        <div className="font-medium">{sp.product.name}</div>
                        <div className="text-xs text-slate-500">{sp.product.brand.name}</div>
                      </Td>
                      <Td className="whitespace-nowrap">{packLabel(sp.packType, sp.unitsPerPack)}</Td>
                      <Td className="whitespace-nowrap">{fmtMoney(sp.packPrice)}</Td>
                      <Td className="font-medium text-emerald-700">{discountText(d.kind, d.value)}</Td>
                      <Td className="whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{fmtMoney(price)}</div>
                        {sp.unitsPerPack > 1 && <div className="text-xs text-slate-500">Birim: {fmtMoney(price.div(sp.unitsPerPack).toDecimalPlaces(2))}</div>}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {fmtNumber(d.minQty)} {(PACK_TYPE[sp.packType] ?? sp.packType).toLocaleLowerCase("tr-TR")} ve üzeri
                      </Td>
                      {editable && (
                        <Td>
                          <ActionForm action={removeMyDiscountAction} compact confirm={`"${sp.product.name}" indirimi kaldırılsın mı?`}>
                            <input type="hidden" name="id" value={d.id} />
                            <SubmitButton variant="small-danger">Kaldır</SubmitButton>
                          </ActionForm>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </Table>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Fiyatlar KDV hariç paket fiyatıdır. İndirim, belirtilen asgari paket adedi ve üzerindeki siparişlerde uygulanır.
            </p>
          </Section>

          {editable && offers && (
            <Section title="İndirimli ürün ekle">
              {offers.items.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Satışta ürününüz yok. Kampanyaya eklemek için önce ürünlerinizi satışa açın.{" "}
                  {can("supplierSelf.offers") && (
                    <Link href="/tedarikci/urunler" className="font-medium text-brand-700 hover:underline">
                      Ürünlerim
                    </Link>
                  )}
                </p>
              ) : (
                <ActionForm action={addMyDiscountAction} resetOnSuccess className="space-y-4">
                  <input type="hidden" name="id" value={c.id} />
                  <SelectField
                    name="supplierProductId"
                    label="Ürün"
                    required
                    placeholder="Ürün seçin"
                    options={offers.items.map((o) => ({
                      value: o.id,
                      label: `${o.product.name} — ${packLabel(o.packType, o.unitsPerPack)} — ${fmtMoney(o.packPrice)}`,
                    }))}
                    hint={offers.total > offers.items.length ? `Satıştaki ilk ${offers.items.length} ürün listelenir.` : undefined}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField name="kind" label="İndirim şekli" required options={DISCOUNT_KINDS} defaultValue="FIXED_PRICE" />
                    <Field
                      name="value"
                      label="Değer"
                      required
                      inputMode="decimal"
                      placeholder="Örn. 450 veya 12,5"
                      hint="Seçilen şekle göre ₺ tutar veya yüzde. Fiyatlar KDV hariçtir."
                    />
                  </div>
                  <Field
                    name="minQty"
                    label="Asgari paket adedi"
                    required
                    inputMode="decimal"
                    defaultValue="1"
                    hint="Toplu alım kademesi: örn. 10 yazarsanız 10 koli ve üzeri siparişte uygulanır. Aynı ürüne farklı kademeler ekleyebilirsiniz."
                  />
                  <SubmitButton>Ekle</SubmitButton>
                </ActionForm>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="İşlemler">
            {editable && (
              <div className="space-y-5">
                <ActionForm action={submitMyCampaignAction} className="space-y-3">
                  <input type="hidden" name="id" value={c.id} />
                  <p className="text-sm text-slate-600">
                    Oda onayladığında kampanya belirtilen tarihler arasında üyelere gösterilir.
                    {c.discounts.length === 0 && <span className="text-amber-700"> Önce en az bir indirimli ürün ekleyin.</span>}
                  </p>
                  <SubmitButton>Onaya gönder</SubmitButton>
                </ActionForm>
                <div className="border-t border-slate-200 pt-5">
                  <ActionForm action={deleteMyCampaignAction} className="space-y-3" confirm="Kampanya silinsin mi? Bu işlem geri alınamaz.">
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton variant="danger">Sil</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            )}
            {c.status === "PENDING" && (
              <ActionForm action={withdrawMyCampaignAction} className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <p className="text-sm text-slate-600">Geri çekilen kampanya taslağa döner; düzenleyip yeniden onaya gönderebilirsiniz.</p>
                <SubmitButton variant="secondary">Onaydan geri çek</SubmitButton>
              </ActionForm>
            )}
            {c.status === "APPROVED" && (
              <ActionForm action={endMyCampaignAction} className="space-y-3" confirm="Kampanya şimdi bitirilsin mi? Üyelere artık gösterilmez.">
                <input type="hidden" name="id" value={c.id} />
                <p className="text-sm text-slate-600">Stok tükendiğinde veya kampanyayı erken durdurmak istediğinizde bitirebilirsiniz.</p>
                <SubmitButton variant="danger">Kampanyayı bitir</SubmitButton>
              </ActionForm>
            )}
            {c.status === "ENDED" && <p className="text-sm text-slate-600">Kampanya sona erdi; üzerinde işlem yapılamaz.</p>}
          </Section>

          <Section title="Özet">
            <DL
              items={[
                ["İndirimli ürün", c.discounts.length],
                [
                  "Siparişlerde kullanım",
                  can("supplierSelf.orders.view") && c._count.orderItems > 0 ? (
                    <Link href="/tedarikci/siparisler" className="text-brand-700 hover:underline">
                      {fmtNumber(c._count.orderItems)} sipariş satırı
                    </Link>
                  ) : (
                    `${fmtNumber(c._count.orderItems)} sipariş satırı`
                  ),
                ],
                ["Değerlendirme", c.reviewedAt ? fmtDateTime(c.reviewedAt) : null],
                ["Oluşturulma", fmtDateTime(c.createdAt)],
                ["Son güncelleme", fmtDateTime(c.updatedAt)],
              ]}
            />
          </Section>
        </div>
      </div>
    </>
  );
}
