import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, EmptyState, PageHeader, Section, StatCard, Table, Td } from "@/components/panel/ui";
import { cancelMyPackageRequestAction, requestPackageAction } from "@/actions/revenue";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, type Tone } from "@/lib/format";
import { getMyMarketing } from "@/modules/revenue/packages";

export const metadata: Metadata = { title: "Paketler ve Haklar" };

const PACKAGE_TYPE: Record<string, string> = { SHOWCASE: "Vitrin paketi", PROMOTION: "Tanıtım paketi" };

function subscriptionStatus(status: string, endsAt: Date, now: Date): { label: string; tone: Tone } {
  if (status === "PENDING") return { label: "Onay bekliyor", tone: "amber" };
  if (status === "ACTIVE") return endsAt > now ? { label: "Aktif", tone: "green" } : { label: "Süresi doldu", tone: "slate" };
  if (status === "EXPIRED") return { label: "Süresi doldu", tone: "slate" };
  if (status === "CANCELLED") return { label: "İptal / Reddedildi", tone: "red" };
  return { label: status, tone: "slate" };
}

function usageText(used: number, limit: number) {
  return `${fmtNumber(used)} / ${fmtNumber(limit)}`;
}

export default async function MarketingPage() {
  const { auth } = await requireSupplierPage("supplierSelf.marketing");
  const { packages, subscriptions, entitlements: e, usage } = await getMyMarketing(auth);
  const now = new Date();
  const pendingPackageIds = new Set(subscriptions.filter((s) => s.status === "PENDING").map((s) => s.packageId));

  return (
    <>
      <PageHeader
        title="Paketler ve Haklar"
        description="Vitrin ve tanıtım paketleriyle ürün listeleme limitinizi, sponsorlu ürün ve banner reklam haklarınızı artırın."
      />

      <div className="mb-6">
        <Alert tone="info">Ödeme Oda ile platform dışında yapılır; Oda onayladığında paket aktifleşir.</Alert>
      </div>

      <h2 className="sr-only">Mevcut haklarınız</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ürün listeleme"
          value={e.productLimit === null ? "Sınırsız" : usageText(usage.offerCount, e.productLimit)}
          hint={e.productLimit === null ? `${fmtNumber(usage.offerCount)} ürün listeleniyor` : "Listelenen / limit"}
          href="/tedarikci/urunler"
        />
        <StatCard
          label="Sponsorlu ürün"
          value={usageText(usage.sponsoredActive, e.sponsoredSlots)}
          hint="Kullanılan / hak"
          href="/tedarikci/sponsorlu"
        />
        <StatCard label="Banner reklam" value={usageText(usage.bannersActive, e.bannerSlots)} hint="Kullanılan / hak" href="/tedarikci/reklamlar" />
        <div className="card p-5">
          <div className="text-sm font-medium text-slate-500">Aktif paketler</div>
          {e.activePackages.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Aktif paketiniz yok.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {e.activePackages.map((p) => (
                <li key={p.id}>
                  <div className="break-words font-semibold text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">{fmtDate(p.endsAt)} tarihine kadar</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {e.productLimit !== null && usage.offerCount >= e.productLimit && (
        <div className="mb-6">
          <Alert tone="warning">Ürün listeleme limitinize ulaştınız. Yeni ürün satışa açmak için daha yüksek limitli bir paket talep edin.</Alert>
        </div>
      )}

      <Section title="Paketler" className="mb-6">
        {packages.length === 0 ? (
          <p className="text-sm text-slate-500">Oda henüz paket tanımlamadı.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((p) => {
              const pending = pendingPackageIds.has(p.id);
              return (
                <li key={p.id} className="flex flex-col rounded-xl border border-slate-200 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="break-words text-lg font-semibold text-slate-900">{p.name}</h3>
                    <Badge tone={p.type === "SHOWCASE" ? "blue" : "green"}>{PACKAGE_TYPE[p.type] ?? p.type}</Badge>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-bold tabular-nums text-slate-900">{fmtMoney(p.price)}</span>
                    <span className="text-sm text-slate-500"> / {fmtNumber(p.durationDays)} gün</span>
                  </div>
                  {p.description && <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-600">{p.description}</p>}
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    <li>
                      Ürün listeleme: <strong>{p.productLimit === null ? "Sınırsız" : `${fmtNumber(p.productLimit)} ürün`}</strong>
                    </li>
                    <li>
                      Sponsorlu ürün: <strong>{fmtNumber(p.sponsoredSlots)}</strong>
                    </li>
                    <li>
                      Banner reklam: <strong>{fmtNumber(p.bannerSlots)}</strong>
                    </li>
                  </ul>
                  <div className="mt-auto pt-4">
                    {pending ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Bu paket için talebiniz Oda onayında.</p>
                    ) : (
                      <ActionForm action={requestPackageAction} className="space-y-3">
                        <input type="hidden" name="packageId" value={p.id} />
                        <div>
                          <label htmlFor={`note-${p.id}`} className="label">
                            Not (isteğe bağlı)
                          </label>
                          <textarea
                            id={`note-${p.id}`}
                            name="note"
                            rows={2}
                            maxLength={300}
                            className="input"
                            placeholder="Örn. ödeme dekont bilgisi, başlangıç tercihi"
                          />
                        </div>
                        <SubmitButton className="w-full">Paket talep et</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Paket geçmişim</h2>
      {subscriptions.length === 0 ? (
        <EmptyState title="Henüz paket talebiniz yok.">Yukarıdaki paketlerden birini talep edebilirsiniz.</EmptyState>
      ) : (
        <Table head={["Paket", "Durum", "Dönem", "Ücret", "Not", ""]}>
          {subscriptions.map((s) => {
            const st = subscriptionStatus(s.status, s.endsAt, now);
            return (
              <tr key={s.id}>
                <Td>
                  <div className="break-words font-medium">{s.package.name}</div>
                  <div className="text-xs text-slate-500">{PACKAGE_TYPE[s.package.type] ?? s.package.type}</div>
                </Td>
                <Td>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Td>
                <Td className="whitespace-nowrap">
                  {s.status === "PENDING" ? (
                    <span className="text-slate-500">Talep: {fmtDateTime(s.createdAt)}</span>
                  ) : s.status === "CANCELLED" ? (
                    <span className="text-slate-500">—</span>
                  ) : (
                    <>
                      <div>{fmtDate(s.startsAt)}</div>
                      <div className="text-slate-500">{fmtDate(s.endsAt)}</div>
                    </>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{fmtMoney(s.pricePaid)}</Td>
                <Td className="max-w-xs break-words text-slate-600">{s.note ?? "—"}</Td>
                <Td>
                  {s.status === "PENDING" && (
                    <ActionForm action={cancelMyPackageRequestAction} compact confirm={`"${s.package.name}" talebi geri çekilsin mi?`}>
                      <input type="hidden" name="id" value={s.id} />
                      <SubmitButton variant="small-danger">Geri çek</SubmitButton>
                    </ActionForm>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Haklar, aktif paketlerinizin toplamıdır. Sponsorlu ürünlerinizi{" "}
        <Link href="/tedarikci/sponsorlu" className="text-brand-700 hover:underline">
          Sponsorlu Ürünler
        </Link>
        , bannerlarınızı{" "}
        <Link href="/tedarikci/reklamlar" className="text-brand-700 hover:underline">
          Banner Reklamlar
        </Link>{" "}
        sayfasından yönetin.
      </p>
    </>
  );
}
