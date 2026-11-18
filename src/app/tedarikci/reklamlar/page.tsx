import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, EmptyState, PageHeader, Section, Table, Td } from "@/components/panel/ui";
import { requestAdAction, withdrawMyAdAction } from "@/actions/revenue";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { dateTimeInput, fmtDateTime, fmtNumber, type Tone } from "@/lib/format";
import { listMyAds } from "@/modules/revenue/ads";

export const metadata: Metadata = { title: "Banner Reklamlar" };

function adStatus(status: string, startsAt: Date, endsAt: Date, now: Date): { label: string; tone: Tone } {
  if (status === "PENDING") return { label: "Onay bekliyor", tone: "amber" };
  if (status === "REJECTED") return { label: "Reddedildi", tone: "red" };
  if (status === "ENDED") return { label: "Sona erdi", tone: "slate" };
  if (status === "APPROVED") {
    if (endsAt <= now) return { label: "Süresi doldu", tone: "slate" };
    if (startsAt > now) return { label: "Planlandı", tone: "blue" };
    return { label: "Yayında", tone: "green" };
  }
  return { label: status, tone: "slate" };
}

export default async function MyAdsPage() {
  const { auth } = await requireSupplierPage("supplierSelf.marketing");
  const { items, slots, entitlements, used } = await listMyAds(auth);
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const slotsLeft = Math.max(0, entitlements.bannerSlots - used);

  return (
    <>
      <PageHeader title="Banner Reklamlar" description="Mağaza sayfalarında üyelere gösterilen banner reklam talepleriniz." />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="card px-5 py-4">
          <div className="text-sm font-medium text-slate-500">Banner hakkı</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {fmtNumber(used)} / {fmtNumber(entitlements.bannerSlots)}
          </div>
          <div className="text-xs text-slate-500">Bekleyen ve yayındaki / toplam hak</div>
        </div>
        <p className="max-w-xl text-sm text-slate-600">
          Onay bekleyen ve onaylanmış (bitiş tarihi geçmemiş) reklamlar hakkınızdan düşer. Reddedilen veya süresi dolan reklamlar hak kullanmaz.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {items.length === 0 ? (
            <EmptyState title="Henüz reklam talebiniz yok.">
              {entitlements.bannerSlots > 0 ? "Yandaki formdan ilk banner talebinizi oluşturabilirsiniz." : "Banner hakkı için önce paket talep edin."}
            </EmptyState>
          ) : (
            <Table head={["Banner", "Alan", "Tarihler", "Gösterim / Tıklama", "Durum", ""]}>
              {items.map((a) => {
                const st = adStatus(a.status, a.startsAt, a.endsAt, now);
                return (
                  <tr key={a.id}>
                    <Td>
                      <div className="flex items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={withBase(`/api/files/${a.imagePath}`)}
                          alt={`${a.title} banner görseli`}
                          className="h-12 w-28 shrink-0 rounded border border-slate-200 bg-slate-50 object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <div className="break-words font-medium">{a.title}</div>
                          {a.targetUrl && <div className="break-all text-xs text-slate-500">{a.targetUrl}</div>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div>{a.slot.name}</div>
                      <div className="text-xs text-slate-500">
                        {a.slot.width}×{a.slot.height} px
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div>{fmtDateTime(a.startsAt)}</div>
                      <div className="text-slate-500">{fmtDateTime(a.endsAt)}</div>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">
                      {fmtNumber(a.impressions)} / {fmtNumber(a.clicks)}
                      {a.impressions > 0 && <div className="text-xs text-slate-500">%{fmtNumber((a.clicks / a.impressions) * 100, 2)} tıklama</div>}
                    </Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </Td>
                    <Td>
                      {(a.status === "PENDING" || a.status === "REJECTED") && (
                        <ActionForm action={withdrawMyAdAction} compact confirm={`"${a.title}" reklamı silinsin mi?`}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="small-danger">{a.status === "PENDING" ? "Geri çek" : "Sil"}</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
          <p className="text-xs text-slate-500">
            Reddedilen reklamın nedeni bildirimlerinizde yer alır. Yayındaki reklamı erken sonlandırmak için Oda ile iletişime geçin.
          </p>
        </div>

        <Section title="Yeni banner talebi">
          {entitlements.bannerSlots === 0 ? (
            <Alert tone="info">
              Banner reklam hakkınız yok.{" "}
              <Link href="/tedarikci/pazarlama" className="font-semibold underline">
                Paketler ve Haklar
              </Link>{" "}
              sayfasından banner hakkı içeren bir paket talep edin.
            </Alert>
          ) : slotsLeft === 0 ? (
            <Alert tone="warning">
              Banner hakkınızın tamamını ({fmtNumber(entitlements.bannerSlots)}) kullanıyorsunuz. Ek hak için{" "}
              <Link href="/tedarikci/pazarlama" className="font-semibold underline">
                paket talep edin
              </Link>
              .
            </Alert>
          ) : slots.length === 0 ? (
            <p className="text-sm text-slate-500">Şu anda kullanılabilir reklam alanı yok.</p>
          ) : (
            <ActionForm action={requestAdAction} resetOnSuccess className="space-y-4">
              <SelectField
                name="slotId"
                label="Reklam alanı"
                required
                options={slots.map((s) => ({ value: s.id, label: `${s.name} (${s.width}×${s.height} px)` }))}
                hint="Parantez içindeki boyut önerilen görsel ölçüsüdür."
              />
              <Field name="title" label="Başlık" required minLength={3} maxLength={120} placeholder="Örn. Kasım fırsatları" hint="Görselin alternatif metni olarak da kullanılır." />
              <Field
                name="targetUrl"
                label="Hedef bağlantı"
                maxLength={300}
                placeholder="/magaza/tedarikciler/firmaniz"
                hint="İsteğe bağlı. Yalnızca /magaza ile başlayan platform adresleri kabul edilir."
              />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <Field name="startsAt" label="Başlangıç" type="datetime-local" required defaultValue={dateTimeInput(now)} />
                <Field name="endsAt" label="Bitiş" type="datetime-local" required defaultValue={dateTimeInput(weekLater)} />
              </div>
              <Field name="image" label="Banner görseli" type="file" accept="image/jpeg,image/png,image/webp" required hint="JPG, PNG veya WEBP; en fazla 5 MB." />
              <p className="text-xs text-slate-500">Talep Oda onayına gönderilir; onaylandığında belirtilen tarihler arasında yayınlanır.</p>
              <SubmitButton>Onaya gönder</SubmitButton>
            </ActionForm>
          )}
        </Section>
      </div>
    </>
  );
}
