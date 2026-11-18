import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, EmptyState, PageHeader, Section, Table, Td } from "@/components/panel/ui";
import { addMySponsoredAction, stopMySponsoredAction } from "@/actions/revenue";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { dateTimeInput, fmtDateTime, fmtMoney, fmtNumber, PACK_TYPE, type Tone } from "@/lib/format";
import { listMySponsored } from "@/modules/revenue/sponsored";

export const metadata: Metadata = { title: "Sponsorlu Ürünler" };

function sponsoredStatus(active: boolean, startsAt: Date, endsAt: Date, now: Date): { label: string; tone: Tone } {
  if (endsAt <= now) return { label: "Bitti", tone: "slate" };
  if (!active) return { label: "Durduruldu", tone: "red" };
  if (startsAt > now) return { label: "Planlandı", tone: "blue" };
  return { label: "Yayında", tone: "green" };
}

function packLabel(packType: string, unitsPerPack: number) {
  return `${PACK_TYPE[packType] ?? packType}${unitsPerPack > 1 ? ` × ${unitsPerPack}` : ""}`;
}

export default async function MySponsoredPage() {
  const { auth, can } = await requireSupplierPage("supplierSelf.marketing");
  const { items, offers, entitlements, used } = await listMySponsored(auth);
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const slotsLeft = Math.max(0, entitlements.sponsoredSlots - used);

  return (
    <>
      <PageHeader
        title="Sponsorlu Ürünler"
        description="Seçtiğiniz ürünler mağazada üst sıralarda, “Sponsorlu” etiketiyle gösterilir."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="card px-5 py-4">
          <div className="text-sm font-medium text-slate-500">Sponsorlu ürün hakkı</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {fmtNumber(used)} / {fmtNumber(entitlements.sponsoredSlots)}
          </div>
          <div className="text-xs text-slate-500">Kullanılan / toplam hak</div>
        </div>
        <p className="max-w-xl text-sm text-slate-600">
          Durdurulmamış ve bitiş tarihi geçmemiş (planlanmış olanlar dahil) kayıtlar hakkınızdan düşer. Durdurduğunuz kayıt hakkınızı hemen boşaltır.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {items.length === 0 ? (
            <EmptyState title="Henüz sponsorlu ürününüz yok.">
              {entitlements.sponsoredSlots > 0 ? "Yandaki formdan ürününüzü öne çıkarabilirsiniz." : "Sponsorlu ürün hakkı için önce paket talep edin."}
            </EmptyState>
          ) : (
            <Table head={["Ürün", "Tarihler", "Durum", ""]}>
              {items.map((s) => {
                const st = sponsoredStatus(s.active, s.startsAt, s.endsAt, now);
                const stoppable = s.active && s.endsAt > now;
                return (
                  <tr key={s.id}>
                    <Td>
                      {can("supplierSelf.offers") ? (
                        <Link href={`/tedarikci/urunler/${s.supplierProductId}`} className="break-words font-medium text-brand-700 hover:underline">
                          {s.supplierProduct.product.name}
                        </Link>
                      ) : (
                        <span className="break-words font-medium">{s.supplierProduct.product.name}</span>
                      )}
                      <div className="text-xs text-slate-500">
                        {packLabel(s.supplierProduct.packType, s.supplierProduct.unitsPerPack)} — {fmtMoney(s.supplierProduct.packPrice)}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div>{fmtDateTime(s.startsAt)}</div>
                      <div className="text-slate-500">{fmtDateTime(s.endsAt)}</div>
                    </Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </Td>
                    <Td>
                      {stoppable && (
                        <ActionForm action={stopMySponsoredAction} compact confirm={`"${s.supplierProduct.product.name}" sponsorluğu durdurulsun mu? Bu işlem geri alınamaz.`}>
                          <input type="hidden" name="id" value={s.id} />
                          <SubmitButton variant="small-danger">Durdur</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </div>

        <Section title="Ürün öne çıkar">
          {entitlements.sponsoredSlots === 0 ? (
            <Alert tone="info">
              Sponsorlu ürün hakkınız yok.{" "}
              <Link href="/tedarikci/pazarlama" className="font-semibold underline">
                Paketler ve Haklar
              </Link>{" "}
              sayfasından vitrin veya tanıtım paketi talep edin.
            </Alert>
          ) : slotsLeft === 0 ? (
            <Alert tone="warning">
              Sponsorlu ürün hakkınızın tamamını ({fmtNumber(entitlements.sponsoredSlots)}) kullanıyorsunuz. Yeni ürün eklemek için birini durdurun veya{" "}
              <Link href="/tedarikci/pazarlama" className="font-semibold underline">
                paket talep edin
              </Link>
              .
            </Alert>
          ) : offers.length === 0 ? (
            <p className="text-sm text-slate-500">
              Satışta ürününüz yok. Önce ürünlerinizi satışa açın.{" "}
              {can("supplierSelf.offers") && (
                <Link href="/tedarikci/urunler" className="font-medium text-brand-700 hover:underline">
                  Ürünlerim
                </Link>
              )}
            </p>
          ) : (
            <ActionForm action={addMySponsoredAction} resetOnSuccess className="space-y-4">
              <SelectField
                name="supplierProductId"
                label="Ürün"
                required
                placeholder="Ürün seçin"
                options={offers.map((o) => ({ value: o.id, label: `${o.product.name} — ${packLabel(o.packType, o.unitsPerPack)} — ${fmtMoney(o.packPrice)}` }))}
              />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <Field name="startsAt" label="Başlangıç" type="datetime-local" required defaultValue={dateTimeInput(now)} />
                <Field name="endsAt" label="Bitiş" type="datetime-local" required defaultValue={dateTimeInput(weekLater)} />
              </div>
              <p className="text-xs text-slate-500">Oda onayı gerekmez; ürün, belirtilen tarihler arasında üyelere sponsorlu olarak gösterilir.</p>
              <SubmitButton>Öne çıkar</SubmitButton>
            </ActionForm>
          )}
        </Section>
      </div>
    </>
  );
}
