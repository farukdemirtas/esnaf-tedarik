import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, CheckboxField, Field, SubmitButton } from "@/components/form";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { approveCampaignAction, endCampaignAction, rejectCampaignAction, setCampaignFeaturedAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { NotFoundError } from "@/lib/errors";
import { CAMPAIGN_STATUS, CAMPAIGN_TYPE, fmtDateTime, fmtMoney, fmtNumber, PACK_TYPE } from "@/lib/format";
import { getCampaign } from "@/modules/campaigns/review";

export const metadata: Metadata = { title: "Kampanya" };

function discountText(kind: string, value: { toString(): string }) {
  if (kind === "FIXED_PRICE") return `Sabit fiyat: ${fmtMoney(value)}`;
  if (kind === "PERCENT") return `%${fmtNumber(value, 2)} indirim`;
  if (kind === "AMOUNT") return `${fmtMoney(value)} indirim`;
  return String(value);
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base, can } = await requireOdaPage("campaign.review");
  const { id } = await params;
  const c = await getCampaign(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const now = new Date();
  const expired = c.endsAt <= now;

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.supplier.tradeName}
        back={{ href: `${base}/kampanyalar`, label: "Kampanyalar" }}
        actions={
          <>
            {c.featured && <Badge tone="blue">Öne çıkan</Badge>}
            <StatusBadge map={CAMPAIGN_STATUS} value={c.status} />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Kampanya bilgileri">
            <DL
              items={[
                ["Tür", CAMPAIGN_TYPE[c.type] ?? c.type],
                ["Kimlere", c.membersOnly ? "Yalnızca Oda üyeleri" : "Tüm müşteriler"],
                ["Başlangıç", fmtDateTime(c.startsAt)],
                [
                  "Bitiş",
                  <>
                    {fmtDateTime(c.endsAt)}
                    {expired && c.status !== "ENDED" && <span className="ml-2 text-xs text-amber-700">süresi doldu</span>}
                  </>,
                ],
                ["Siparişlerde kullanım", `${c._count.orderItems} sipariş satırı`],
                ["Değerlendirme", c.reviewedAt ? fmtDateTime(c.reviewedAt) : null],
                ["Açıklama", c.description ? <span className="whitespace-pre-line">{c.description}</span> : null],
                ["Değerlendirme notu", c.reviewNote],
              ]}
            />
          </Section>

          <Section title={`İndirimli ürünler (${c.discounts.length})`}>
            {c.discounts.length === 0 ? (
              <p className="text-sm text-slate-500">Kampanyada indirimli ürün tanımlı değil.</p>
            ) : (
              <Table head={["Ürün", "Paket", "Normal fiyat", "İndirim", "Min. adet"]}>
                {c.discounts.map((d) => {
                  const sp = d.supplierProduct;
                  return (
                    <tr key={d.id}>
                      <Td>
                        <div className="font-medium">{sp.product.name}</div>
                        <div className="text-xs text-slate-500">{sp.product.brand.name}</div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {PACK_TYPE[sp.packType] ?? sp.packType}
                        {sp.unitsPerPack > 1 ? ` × ${sp.unitsPerPack}` : ""}
                      </Td>
                      <Td className="whitespace-nowrap">{fmtMoney(sp.packPrice)}</Td>
                      <Td className="font-medium text-emerald-700">{discountText(d.kind, d.value)}</Td>
                      <Td>{fmtNumber(d.minQty)}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <p className="mt-3 text-xs text-slate-500">Fiyatlar KDV hariç paket fiyatıdır. İndirim, belirtilen minimum paket adedi ve üzerinde uygulanır.</p>
          </Section>
        </div>

        <div className="space-y-6">
          {c.status === "PENDING" && (
            <Section title="Onay kararı">
              {expired && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Kampanyanın bitiş tarihi geçmiş; onaylanamaz. Reddedebilirsiniz.
                </p>
              )}
              <div className="space-y-6">
                <ActionForm action={approveCampaignAction} className="space-y-3">
                  <input type="hidden" name="id" value={c.id} />
                  <Field name="note" label="Not (isteğe bağlı)" maxLength={500} />
                  <CheckboxField name="featured" label="Ana sayfada öne çıkar" />
                  <SubmitButton>Onayla</SubmitButton>
                </ActionForm>
                <div className="border-t border-slate-200 pt-5">
                  <ActionForm action={rejectCampaignAction} className="space-y-3" confirm="Kampanya reddedilsin mi?">
                    <input type="hidden" name="id" value={c.id} />
                    <Field name="note" label="Ret gerekçesi" required minLength={3} maxLength={500} />
                    <SubmitButton variant="danger">Reddet</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            </Section>
          )}

          {c.status === "APPROVED" && (
            <>
              <Section title="Ana sayfa">
                <p className="mb-3 text-sm text-slate-600">
                  {c.featured ? "Kampanya ana sayfada öne çıkarılıyor." : "Kampanya ana sayfada öne çıkarılmıyor."}
                </p>
                <ActionForm action={setCampaignFeaturedAction} className="space-y-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="featured" value={c.featured ? "0" : "1"} />
                  <SubmitButton variant="secondary">{c.featured ? "Öne çıkarmayı kaldır" : "Ana sayfada öne çıkar"}</SubmitButton>
                </ActionForm>
              </Section>

              <Section title="Kampanyayı sonlandır">
                <ActionForm action={endCampaignAction} className="space-y-3" confirm="Kampanya sonlandırılsın mı? Üyelere artık gösterilmez.">
                  <input type="hidden" name="id" value={c.id} />
                  <Field name="note" label="Sonlandırma gerekçesi" required minLength={3} maxLength={500} />
                  <SubmitButton variant="danger">Sonlandır</SubmitButton>
                </ActionForm>
              </Section>
            </>
          )}

          <Section title="Özet">
            <DL
              items={[
                [
                  "Tedarikçi",
                  can("supplier.view") ? (
                    <Link href={`${base}/tedarikciler/${c.supplier.id}`} className="text-brand-700 hover:underline">
                      {c.supplier.tradeName}
                    </Link>
                  ) : (
                    c.supplier.tradeName
                  ),
                ],
                ["İndirimli ürün", c.discounts.length],
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
