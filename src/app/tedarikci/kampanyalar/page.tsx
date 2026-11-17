import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { EmptyState, PageHeader, Section, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { createMyCampaignAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { CAMPAIGN_STATUS, CAMPAIGN_TYPE, dateTimeInput, fmtDateTime, fmtNumber } from "@/lib/format";
import { listMyCampaigns } from "@/modules/campaigns/supplier";

export const metadata: Metadata = { title: "Kampanyalarım" };

const STEPS = ["Taslak oluşturun", "İndirimli ürünleri ekleyin", "Onaya gönderin", "Oda onaylayınca tarihlerde yayında"];

export default async function MyCampaignsPage() {
  const { auth, can } = await requireSupplierPage("supplierSelf.campaigns");
  const items = await listMyCampaigns(auth);
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return (
    <>
      <PageHeader title="Kampanyalarım" description="Oda üyelerine özel indirimli fiyat ve toplu alım kampanyaları." />

      <ol className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s} className="card flex items-center gap-3 px-4 py-3 text-sm text-slate-700">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {items.length === 0 ? (
            <EmptyState title="Henüz kampanyanız yok.">Yandaki formdan ilk kampanya taslağınızı oluşturabilirsiniz.</EmptyState>
          ) : (
            <Table head={["Kampanya", "Tür", "Tarihler", "Ürün", "Sipariş satırı", "Durum"]}>
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/tedarikci/kampanyalar/${c.id}`} className="break-words font-semibold text-brand-700 hover:underline">
                      {c.title}
                    </Link>
                    {c.status === "REJECTED" && c.reviewNote && (
                      <div className="mt-1 break-words text-xs text-red-700">Oda notu: {c.reviewNote}</div>
                    )}
                  </Td>
                  <Td>{CAMPAIGN_TYPE[c.type] ?? c.type}</Td>
                  <Td className="whitespace-nowrap">
                    <div>{fmtDateTime(c.startsAt)}</div>
                    <div className="text-slate-500">{fmtDateTime(c.endsAt)}</div>
                    {c.status === "APPROVED" && c.endsAt <= now && <div className="text-xs text-amber-700">süresi doldu</div>}
                  </Td>
                  <Td className="whitespace-nowrap">{fmtNumber(c._count.discounts)} ürün</Td>
                  <Td>{fmtNumber(c._count.orderItems)}</Td>
                  <Td>
                    <StatusBadge map={CAMPAIGN_STATUS} value={c.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="text-xs text-slate-500">
            Onay bekleyen kampanyayı geri çekip düzenleyebilirsiniz. Reddedilen kampanyayı düzenlediğinizde taslağa döner.
            {can("supplierSelf.orders.view") && (
              <>
                {" "}
                Kampanyalı siparişleri{" "}
                <Link href="/tedarikci/siparisler" className="text-brand-700 hover:underline">
                  Siparişler
                </Link>{" "}
                sayfasından takip edin.
              </>
            )}
          </p>
        </div>

        <Section title="Yeni kampanya">
          <ActionForm action={createMyCampaignAction} className="space-y-4">
            <Field name="title" label="Kampanya adı" required minLength={3} maxLength={150} placeholder="Örn. Kasım ayı Oda üyelerine özel" />
            <TextareaField name="description" label="Açıklama" maxLength={1000} rows={3} hint="Üyelere gösterilir (isteğe bağlı)." />
            <SelectField name="type" label="Kampanya türü" required options={toOptions(CAMPAIGN_TYPE)} defaultValue="CHAMBER_SPECIAL" />
            <CheckboxField name="membersOnly" label="Yalnızca Oda üyelerine" defaultChecked />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field name="startsAt" label="Başlangıç" type="datetime-local" required defaultValue={dateTimeInput(now)} />
              <Field name="endsAt" label="Bitiş" type="datetime-local" required defaultValue={dateTimeInput(weekLater)} />
            </div>
            <p className="text-xs text-slate-500">Taslak olarak kaydedilir. Ardından indirimli ürünleri ekleyip Oda onayına gönderirsiniz.</p>
            <SubmitButton>Taslak oluştur</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
