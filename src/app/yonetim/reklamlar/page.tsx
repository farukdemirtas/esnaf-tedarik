import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, EmptyState, FilterBar, FilterInput, PageHeader, Pagination, Section, StatCard, StatusBadge, Table, Td } from "@/components/panel/ui";
import { approveAdAction, createAdAction, endAdAction, odaAddSponsoredAction, odaSetSponsoredActiveAction, rejectAdAction } from "@/actions/revenue";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { dateTimeInput, fmtDate, fmtDateTime, fmtMoney, fmtNumber, type Tone } from "@/lib/format";
import { listAds } from "@/modules/revenue/ads";
import { revenueReport } from "@/modules/revenue/report";
import { listAllSponsored } from "@/modules/revenue/sponsored";

export const metadata: Metadata = { title: "Reklam ve Sponsorlu" };

const AD_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  APPROVED: { label: "Onaylandı", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  ENDED: { label: "Sona erdi", tone: "slate" },
};

type SP = { durum?: string; sayfa?: string; from?: string; to?: string };

const fmtCtr = (impressions: number, clicks: number) =>
  impressions ? `%${((clicks / impressions) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}` : "—";

/** Yayın aralığına göre kısa durum notu */
function liveNote(status: string, startsAt: Date, endsAt: Date, now: Date) {
  if (status !== "APPROVED") return null;
  if (endsAt <= now) return <div className="text-xs text-amber-700">süresi doldu</div>;
  if (startsAt > now) return <div className="text-xs text-slate-500">başlamadı</div>;
  return <div className="text-xs text-emerald-700">yayında</div>;
}

const TABS = [
  { id: "bannerlar", label: "Banner reklamlar" },
  { id: "yeni-banner", label: "Yeni banner" },
  { id: "sponsorlu", label: "Sponsorlu ürünler" },
  { id: "gelir", label: "Gelir raporu" },
];

export default async function AdsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth, base, can } = await requireOdaPage("ads.manage");
  const sp = await searchParams;
  const chamberId = chamberIdOf(auth);
  const [ads, sponsored, report, suppliers, offers] = await Promise.all([
    listAds(auth, { status: sp.durum, page: sp.sayfa }),
    listAllSponsored(auth),
    revenueReport(auth, { from: sp.from, to: sp.to }),
    db.supplier.findMany({
      where: { status: "APPROVED", chambers: { some: { chamberId } } },
      select: { id: true, tradeName: true },
      orderBy: { tradeName: "asc" },
    }),
    db.supplierProduct.findMany({
      where: { removedByAdmin: false, active: true, product: { chamberId } },
      include: { product: { select: { name: true } }, supplier: { select: { tradeName: true } } },
      orderBy: [{ product: { name: "asc" } }, { supplier: { tradeName: "asc" } }],
      take: 1000,
    }),
  ]);
  const now = new Date();
  const activeSlots = ads.slots.filter((s) => s.active);
  const totalAds = Object.values(ads.counts).reduce((n, c) => n + (c ?? 0), 0);
  const statusHref = (durum?: string) => {
    const q = new URLSearchParams();
    if (durum) q.set("durum", durum);
    if (sp.from) q.set("from", sp.from);
    if (sp.to) q.set("to", sp.to);
    const s = q.toString();
    return `${base}/reklamlar${s ? `?${s}` : ""}#bannerlar`;
  };
  const invalidRange = report.range.from > report.range.to;
  const sizeHint = activeSlots.map((s) => `${s.name}: ${s.width}×${s.height} px`).join(" · ");

  return (
    <>
      <PageHeader title="Reklam ve Sponsorlu Ürünler" description="Banner reklamları, sponsorlu ürünleri ve gelir modeli raporunu yönetin." />

      <nav aria-label="Bölümler" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {t.label}
          </a>
        ))}
      </nav>

      <div className="mb-6">
        <Alert tone="info">Reklam ve sponsorluk ücretleri platform dışında tahsil edilir; burada girilen ücretler yalnızca kayıt ve rapor içindir.</Alert>
      </div>

      <div className="space-y-8">
        {/* ───────────── Banner reklamlar ───────────── */}
        <section id="bannerlar" aria-labelledby="h-bannerlar" className="scroll-mt-4">
          <h2 id="h-bannerlar" className="mb-3 text-lg font-semibold text-slate-900">
            Banner reklamlar
          </h2>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Duruma göre filtrele">
            {[{ value: undefined, label: "Tümü", count: totalAds }, ...Object.entries(AD_STATUS).map(([value, v]) => ({ value, label: v.label, count: ads.counts[value as keyof typeof ads.counts] ?? 0 }))].map((o) => {
              const current = (sp.durum ?? "") === (o.value ?? "");
              return (
                <Link
                  key={o.label}
                  href={statusHref(o.value)}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    current ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {o.label} <span className="tabular-nums opacity-80">({o.count})</span>
                </Link>
              );
            })}
          </div>

          {ads.items.length === 0 ? (
            <EmptyState title="Banner reklam bulunamadı.">
              {sp.durum ? "Başka bir durum seçin." : "Aşağıdaki formdan Oda adına banner yayınlayabilirsiniz; tedarikçi talepleri de burada listelenir."}
            </EmptyState>
          ) : (
            <Table head={["Görsel", "Reklam", "Alan", "Tarihler", "Gösterim", "Tıklama", "TO", "Ücret", "Durum", "İşlem"]}>
              {ads.items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td className="w-32">
                    <a href={withBase(`/api/files/${a.imagePath}`)} target="_blank" rel="noopener noreferrer" aria-label={`${a.title} görselini aç`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={withBase(`/api/files/${a.imagePath}`)} alt="" className="h-12 w-28 rounded border border-slate-200 object-cover" />
                    </a>
                  </Td>
                  <Td>
                    <div className="font-semibold text-slate-900">{a.title}</div>
                    <div className="text-xs text-slate-500">
                      {a.supplier ? (
                        can("supplier.view") ? (
                          <Link href={`${base}/tedarikciler/${a.supplier.id}`} className="text-brand-700 hover:underline">
                            {a.supplier.tradeName}
                          </Link>
                        ) : (
                          a.supplier.tradeName
                        )
                      ) : (
                        "Oda"
                      )}
                    </div>
                    {a.targetUrl && <div className="break-all text-xs text-slate-500">{a.targetUrl}</div>}
                  </Td>
                  <Td className="text-xs">
                    {a.slot.name}
                    <div className="text-slate-500">
                      {a.slot.width}×{a.slot.height} px
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {fmtDateTime(a.startsAt)}
                    <br />
                    {fmtDateTime(a.endsAt)}
                  </Td>
                  <Td className="tabular-nums">{fmtNumber(a.impressions)}</Td>
                  <Td className="tabular-nums">{fmtNumber(a.clicks)}</Td>
                  <Td className="tabular-nums">{fmtCtr(a.impressions, a.clicks)}</Td>
                  <Td className="whitespace-nowrap">{fmtMoney(a.fee)}</Td>
                  <Td>
                    <StatusBadge map={AD_STATUS} value={a.status} />
                    {liveNote(a.status, a.startsAt, a.endsAt, now)}
                  </Td>
                  <Td>
                    {a.status === "PENDING" && (
                      <div className="w-52 space-y-2">
                        <ActionForm action={approveAdAction} compact className="space-y-2">
                          <input type="hidden" name="id" value={a.id} />
                          <Field name="fee" label="Ücret (₺, isteğe bağlı)" inputMode="decimal" placeholder="örn. 750" />
                          <SubmitButton variant="small">Onayla</SubmitButton>
                        </ActionForm>
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-red-700">Reddet</summary>
                          <ActionForm action={rejectAdAction} compact className="mt-2 space-y-2" confirm="Reklam reddedilsin mi?">
                            <input type="hidden" name="id" value={a.id} />
                            <Field name="note" label="Ret gerekçesi" required minLength={3} maxLength={300} />
                            <SubmitButton variant="small-danger">Reddet</SubmitButton>
                          </ActionForm>
                        </details>
                      </div>
                    )}
                    {a.status === "APPROVED" && (
                      <ActionForm action={endAdAction} compact confirm="Reklam yayından kaldırılsın mı?">
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton variant="small-danger">Yayından kaldır</SubmitButton>
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={ads.page} size={ads.size} total={ads.total} params={{ durum: sp.durum, from: sp.from, to: sp.to }} />
        </section>

        {/* ───────────── Yeni banner ───────────── */}
        <div id="yeni-banner" className="scroll-mt-4">
          <Section title="Yeni banner (Oda adına yayınla)">
            {activeSlots.length === 0 ? (
              <p className="text-sm text-slate-600">Aktif reklam alanı bulunmuyor.</p>
            ) : (
              <ActionForm action={createAdAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  name="slotId"
                  label="Reklam alanı"
                  required
                  options={activeSlots.map((s) => ({ value: s.id, label: `${s.name} (${s.width}×${s.height} px)` }))}
                  hint={`Önerilen görsel boyutu — ${sizeHint}`}
                />
                <Field name="title" label="Başlık" required minLength={3} maxLength={120} hint="Görselin alternatif metni olarak da kullanılır." />
                <Field
                  name="targetUrl"
                  label="Hedef bağlantı (isteğe bağlı)"
                  maxLength={300}
                  placeholder="/magaza/tedarikciler/firma"
                  hint="Yalnızca /magaza ile başlayan platform içi adresler."
                />
                <SelectField
                  name="supplierId"
                  label="Reklam veren"
                  placeholder="Oda"
                  options={suppliers.map((s) => ({ value: s.id, label: s.tradeName }))}
                  hint="Tedarikçi adına yayınlanıyorsa seçin."
                />
                <Field name="startsAt" label="Başlangıç" type="datetime-local" required defaultValue={dateTimeInput(now)} />
                <Field name="endsAt" label="Bitiş" type="datetime-local" required defaultValue={dateTimeInput(new Date(now.getTime() + 30 * 86400_000))} />
                <Field name="fee" label="Ücret (₺, isteğe bağlı)" inputMode="decimal" placeholder="örn. 1000" />
                <Field
                  name="image"
                  label="Banner görseli"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  hint="JPG, PNG veya WEBP; en fazla 5 MB. Alanın önerilen boyutunda yükleyin."
                />
                <div className="sm:col-span-2">
                  <SubmitButton>Yayına al</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Section>
        </div>

        {/* ───────────── Sponsorlu ürünler ───────────── */}
        <section id="sponsorlu" aria-labelledby="h-sponsorlu" className="scroll-mt-4 space-y-4">
          <h2 id="h-sponsorlu" className="text-lg font-semibold text-slate-900">
            Sponsorlu ürünler
          </h2>
          <p className="text-sm text-slate-600">
            Sponsorlu ürünler üyelere &quot;Sponsorlu&quot; etiketiyle, yalnızca ürünü görebilecekleri durumda öne çıkarılarak gösterilir. Tedarikçiler paket hakları kadar
            ürünü kendileri ekleyebilir; Oda tüm kayıtları yönetir.
          </p>
          {sponsored.length === 0 ? (
            <EmptyState title="Sponsorlu ürün yok." />
          ) : (
            <Table head={["Ürün", "Tedarikçi", "Tarihler", "Sıra", "Ücret", "Durum", "İşlem"]}>
              {sponsored.map((s) => {
                const state = !s.active
                  ? { label: "Durduruldu", tone: "slate" as Tone }
                  : s.endsAt <= now
                    ? { label: "Süresi doldu", tone: "slate" as Tone }
                    : s.startsAt > now
                      ? { label: "Planlandı", tone: "blue" as Tone }
                      : { label: "Yayında", tone: "green" as Tone };
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="font-medium">{s.supplierProduct.product.name}</Td>
                    <Td>{s.supplierProduct.supplier.tradeName}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {fmtDateTime(s.startsAt)}
                      <br />
                      {fmtDateTime(s.endsAt)}
                    </Td>
                    <Td className="tabular-nums">{s.sortOrder}</Td>
                    <Td className="whitespace-nowrap">{fmtMoney(s.fee)}</Td>
                    <Td>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </Td>
                    <Td>
                      {s.active || s.endsAt > now ? (
                        <ActionForm action={odaSetSponsoredActiveAction} compact confirm={s.active ? "Sponsorluk durdurulsun mu?" : undefined}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                          {s.active ? <SubmitButton variant="small-danger">Durdur</SubmitButton> : <SubmitButton variant="small">Yeniden yayınla</SubmitButton>}
                        </ActionForm>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}

          <Section title="Sponsorlu ürün ekle">
            {offers.length === 0 ? (
              <p className="text-sm text-slate-600">Satışta olan tedarikçi teklifi bulunmuyor.</p>
            ) : (
              <ActionForm action={odaAddSponsoredAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  name="supplierProductId"
                  label="Ürün teklifi"
                  required
                  placeholder="Seçin"
                  options={offers.map((o) => ({ value: o.id, label: `${o.product.name} — ${o.supplier.tradeName}` }))}
                  wrapClassName="sm:col-span-2 lg:col-span-3"
                />
                <Field name="startsAt" label="Başlangıç" type="datetime-local" required defaultValue={dateTimeInput(now)} />
                <Field name="endsAt" label="Bitiş" type="datetime-local" required defaultValue={dateTimeInput(new Date(now.getTime() + 30 * 86400_000))} />
                <Field name="sortOrder" label="Sıra" type="number" required min={0} max={1000} defaultValue={0} hint="Küçük sayı önce gösterilir." />
                <Field name="fee" label="Ücret (₺, isteğe bağlı)" inputMode="decimal" placeholder="örn. 500" />
                <div className="sm:col-span-2 lg:col-span-3">
                  <SubmitButton>Sponsorlu olarak ekle</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Section>
        </section>

        {/* ───────────── Gelir raporu ───────────── */}
        <section id="gelir" aria-labelledby="h-gelir" className="scroll-mt-4 space-y-4">
          <h2 id="h-gelir" className="text-lg font-semibold text-slate-900">
            Gelir raporu
          </h2>
          <FilterBar>
            {sp.durum && <input type="hidden" name="durum" value={sp.durum} />}
            <FilterInput name="from" label="Başlangıç" type="date" defaultValue={report.range.from} />
            <FilterInput name="to" label="Bitiş" type="date" defaultValue={report.range.to} />
          </FilterBar>
          {invalidRange ? (
            <Alert tone="warning">Başlangıç tarihi bitiş tarihinden sonra olamaz.</Alert>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                {fmtDate(new Date(`${report.range.from}T12:00:00`))} – {fmtDate(new Date(`${report.range.to}T12:00:00`))} arasında başlayan kayıtlar. Tutarlar kayıt
                amaçlıdır; tahsilat platform dışında yapılır.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard label="Paket geliri" value={fmtMoney(report.packageRevenue)} hint={`${report.packageCount} paket kaydı`} />
                <StatCard label="Reklam geliri" value={fmtMoney(report.adRevenue)} hint={`${report.adCount} banner`} />
                <StatCard label="Sponsorlu ürün geliri" value={fmtMoney(report.sponsoredRevenue)} hint={`${report.sponsoredCount} kayıt`} />
                <StatCard label="Toplam" value={fmtMoney(report.total)} />
                <StatCard label="Aktif paket" value={fmtNumber(report.activeSubs)} hint="Şu an geçerli abonelik" />
              </div>
              <h3 className="font-semibold text-slate-900">Banner performansı</h3>
              {report.ads.length === 0 ? (
                <EmptyState title="Bu dönemde yayında olan banner yok." />
              ) : (
                <Table head={["Reklam", "Alan", "Reklam veren", "Tarihler", "Gösterim", "Tıklama", "TO"]}>
                  {report.ads.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <div className="font-medium">{a.title}</div>
                        <StatusBadge map={AD_STATUS} value={a.status} />
                      </Td>
                      <Td className="text-xs">{a.slot.name}</Td>
                      <Td>{a.supplier?.tradeName ?? "Oda"}</Td>
                      <Td className="whitespace-nowrap text-xs">
                        {fmtDate(a.startsAt)} – {fmtDate(a.endsAt)}
                      </Td>
                      <Td className="tabular-nums">{fmtNumber(a.impressions)}</Td>
                      <Td className="tabular-nums">{fmtNumber(a.clicks)}</Td>
                      <Td className="tabular-nums">{a.impressions ? `%${a.ctr.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}` : "—"}</Td>
                    </tr>
                  ))}
                </Table>
              )}
              <p className="text-xs text-slate-500">TO: tıklanma oranı (tıklama / gösterim). Gösterim ve tıklamalar reklamın tüm yayın süresi içindir.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
