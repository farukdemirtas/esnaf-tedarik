import type { Metadata } from "next";
import Link from "next/link";
import type { SupplierPackage } from "@prisma/client";
import { Alert } from "@/components/brand";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { Badge, EmptyState, FilterBar, FilterSelect, PageHeader, Pagination, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import {
  approveSubscriptionAction,
  assignSubscriptionAction,
  createPackageAction,
  rejectSubscriptionAction,
  setDefaultProductLimitAction,
  updatePackageAction,
} from "@/actions/revenue";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, moneyInput, type Tone } from "@/lib/format";
import { listPackages, listSubscriptions } from "@/modules/revenue/packages";

export const metadata: Metadata = { title: "Tedarikçi Paketleri" };

const PACKAGE_TYPE: Record<string, { label: string; tone: Tone }> = {
  SHOWCASE: { label: "Vitrin", tone: "blue" },
  PROMOTION: { label: "Tanıtım", tone: "amber" },
};

const SUB_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  ACTIVE: { label: "Aktif", tone: "green" },
  EXPIRED: { label: "Süresi doldu", tone: "slate" },
  CANCELLED: { label: "İptal / reddedildi", tone: "red" },
};

const TYPE_OPTIONS = [
  { value: "SHOWCASE", label: "Vitrin" },
  { value: "PROMOTION", label: "Tanıtım" },
];

/** Paket oluşturma ve düzenleme formlarının ortak alanları */
function PackageFields({ p }: { p?: SupplierPackage }) {
  return (
    <>
      <Field name="name" label="Paket adı" required minLength={2} maxLength={100} defaultValue={p?.name} wrapClassName="sm:col-span-2" />
      <SelectField name="type" label="Tür" required options={TYPE_OPTIONS} defaultValue={p?.type ?? "SHOWCASE"} />
      <Field name="price" label="Ücret (₺)" required inputMode="decimal" placeholder="örn. 1500" defaultValue={p ? moneyInput(p.price) : undefined} />
      <TextareaField name="description" label="Açıklama" maxLength={1000} rows={2} defaultValue={p?.description ?? ""} wrapClassName="sm:col-span-4" />
      <Field
        name="productLimit"
        label="Ürün limiti"
        type="number"
        min={1}
        max={100000}
        defaultValue={p?.productLimit ?? ""}
        hint="Boş = sınırsız"
      />
      <Field name="sponsoredSlots" label="Sponsorlu ürün hakkı" type="number" required min={0} max={100} defaultValue={p?.sponsoredSlots ?? 0} />
      <Field name="bannerSlots" label="Banner hakkı" type="number" required min={0} max={100} defaultValue={p?.bannerSlots ?? 0} />
      <Field name="durationDays" label="Süre (gün)" type="number" required min={1} max={3650} defaultValue={p?.durationDays ?? 30} />
      <div className="sm:col-span-4">
        <CheckboxField name="active" label="Aktif (tedarikçiler talep edebilir)" defaultChecked={p ? p.active : true} />
      </div>
    </>
  );
}

type SP = { durum?: string; sayfa?: string };

export default async function PackagesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { auth, base, can } = await requireOdaPage("package.manage");
  const sp = await searchParams;
  const chamberId = chamberIdOf(auth);
  const [{ packages, defaultLimit }, subs, suppliers] = await Promise.all([
    listPackages(auth),
    listSubscriptions(auth, { status: sp.durum, page: sp.sayfa }),
    db.supplier.findMany({
      where: { status: "APPROVED", chambers: { some: { chamberId } } },
      select: { id: true, tradeName: true },
      orderBy: { tradeName: "asc" },
    }),
  ]);
  const activePackages = packages.filter((p) => p.active);

  return (
    <>
      <PageHeader
        title="Tedarikçi Paketleri"
        description="Vitrin ve tanıtım paketlerini tanımlayın, tedarikçilerin paket taleplerini onaylayın."
      />

      <div className="mb-6">
        <Alert tone="info">
          Paket ücretleri platform dışında (banka havalesi, Oda veznesi vb.) tahsil edilir. Sistem yalnızca ödemesi alınan paketin kaydını tutar ve
          tedarikçiye hakları tanımlar. Talebi ödemeyi aldıktan sonra onaylayın.
        </Alert>
      </div>

      <div className="space-y-6">
        <Section title={`Paketler (${packages.length})`}>
          {packages.length === 0 ? (
            <p className="text-sm text-slate-600">Henüz paket tanımlanmadı. Aşağıdaki formdan ilk paketi oluşturun.</p>
          ) : (
            <ul className="-mx-5 -my-5 divide-y divide-slate-100">
              {packages.map((p) => (
                <li key={p.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-semibold ${p.active ? "text-slate-900" : "text-slate-400"}`}>{p.name}</span>
                          <StatusBadge map={PACKAGE_TYPE} value={p.type} />
                          {!p.active && <Badge>Pasif</Badge>}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {fmtMoney(p.price)} / {fmtNumber(p.durationDays)} gün · Ürün limiti: {p.productLimit === null ? "sınırsız" : fmtNumber(p.productLimit)} ·
                          Sponsorlu: {p.sponsoredSlots} · Banner: {p.bannerSlots}
                        </div>
                        {p.description && <div className="mt-1 text-xs text-slate-500">{p.description}</div>}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span>{p._count.subscriptions} aktif tedarikçi</span>
                        <span className="font-medium text-brand-600 group-open:hidden">Düzenle</span>
                        <span className="hidden font-medium text-brand-600 group-open:inline">Kapat</span>
                      </div>
                    </summary>
                    <div className="bg-slate-50 px-5 py-4">
                      <ActionForm action={updatePackageAction} className="grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="id" value={p.id} />
                        <PackageFields p={p} />
                        <div className="sm:col-span-4">
                          <SubmitButton variant="small">Değişiklikleri kaydet</SubmitButton>
                        </div>
                      </ActionForm>
                      <p className="mt-3 text-xs text-slate-500">Ücret ve süre değişikliği yalnızca yeni onaylanan paketlere uygulanır; mevcut kayıtlar değişmez.</p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-6 xl:grid-cols-3">
          <Section title="Yeni paket" className="xl:col-span-2">
            <ActionForm action={createPackageAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
              <PackageFields />
              <div className="sm:col-span-4">
                <SubmitButton>Paketi oluştur</SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title="Varsayılan ürün limiti">
            <p className="mb-3 text-sm text-slate-600">
              Paketi olmayan tedarikçinin en fazla açabileceği ürün sayısı; boş = sınırsız. Şu an:{" "}
              <strong>{defaultLimit === null ? "sınırsız" : fmtNumber(defaultLimit)}</strong>.
            </p>
            <ActionForm action={setDefaultProductLimitAction} className="space-y-3">
              <Field name="limit" label="Ürün limiti" type="number" min={1} max={100000} defaultValue={defaultLimit ?? ""} hint="Boş bırakılırsa sınır uygulanmaz." />
              <SubmitButton variant="secondary">Kaydet</SubmitButton>
            </ActionForm>
          </Section>
        </div>

        <Section title="Tedarikçiye paket tanımla">
          {suppliers.length === 0 || activePackages.length === 0 ? (
            <p className="text-sm text-slate-600">
              {activePackages.length === 0 ? "Önce aktif bir paket oluşturun." : "Odaya bağlı onaylı tedarikçi bulunmuyor."}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Ödemesi alınmış paketi doğrudan tanımlar. Paket bugünden başlar ve paket süresi kadar aktif kalır.
              </p>
              <ActionForm action={assignSubscriptionAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  name="supplierId"
                  label="Tedarikçi"
                  required
                  placeholder="Seçin"
                  options={suppliers.map((s) => ({ value: s.id, label: s.tradeName }))}
                />
                <SelectField
                  name="packageId"
                  label="Paket"
                  required
                  placeholder="Seçin"
                  options={activePackages.map((p) => ({ value: p.id, label: `${p.name} — ${fmtMoney(p.price)} / ${p.durationDays} gün` }))}
                />
                <Field name="note" label="Not (ödeme bilgisi vb.)" maxLength={300} placeholder="örn. Dekont no 1234" />
                <div className="sm:col-span-3">
                  <SubmitButton>Paketi tanımla</SubmitButton>
                </div>
              </ActionForm>
            </>
          )}
        </Section>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Paket talepleri ve kayıtları</h2>
          <FilterBar>
            <FilterSelect
              name="durum"
              label="Durum"
              defaultValue={sp.durum}
              options={Object.entries(SUB_STATUS).map(([value, v]) => ({ value, label: v.label }))}
            />
          </FilterBar>
          {subs.items.length === 0 ? (
            <EmptyState title="Kayıt bulunamadı.">
              {sp.durum ? "Filtreyi değiştirmeyi deneyin." : "Tedarikçiler Pazarlama sayfasından paket talep eder; talepler burada listelenir."}
            </EmptyState>
          ) : (
            <Table head={["Tedarikçi", "Paket", "Dönem", "Ücret", "Durum", "Not", "İşlem"]}>
              {subs.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    {can("supplier.view") ? (
                      <Link href={`${base}/tedarikciler/${s.supplier.id}`} className="font-semibold text-brand-700 hover:underline">
                        {s.supplier.tradeName}
                      </Link>
                    ) : (
                      <span className="font-semibold">{s.supplier.tradeName}</span>
                    )}
                    <div className="text-xs text-slate-500">Talep: {fmtDateTime(s.createdAt)}</div>
                  </Td>
                  <Td>
                    <div>{s.package.name}</div>
                    <StatusBadge map={PACKAGE_TYPE} value={s.package.type} />
                  </Td>
                  <Td className="whitespace-nowrap">{s.status === "PENDING" ? "—" : `${fmtDate(s.startsAt)} – ${fmtDate(s.endsAt)}`}</Td>
                  <Td className="whitespace-nowrap">{fmtMoney(s.pricePaid)}</Td>
                  <Td>{s.expired ? <Badge tone="slate">Süresi doldu</Badge> : <StatusBadge map={SUB_STATUS} value={s.status} />}</Td>
                  <Td className="max-w-[220px] text-xs text-slate-600">{s.note ?? "—"}</Td>
                  <Td>
                    {s.status === "PENDING" && (
                      <div className="w-56 space-y-2">
                        <ActionForm action={approveSubscriptionAction} compact className="space-y-2" confirm="Ödeme alındı ve paket aktifleştirilsin mi?">
                          <input type="hidden" name="id" value={s.id} />
                          <Field name="note" label="Not (isteğe bağlı)" maxLength={300} placeholder="örn. Dekont no" />
                          <SubmitButton variant="small">Ödeme alındı, onayla</SubmitButton>
                        </ActionForm>
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-red-700">Reddet</summary>
                          <ActionForm action={rejectSubscriptionAction} compact className="mt-2 space-y-2" confirm="Talep reddedilsin mi?">
                            <input type="hidden" name="id" value={s.id} />
                            <Field name="note" label="Ret gerekçesi" required minLength={3} maxLength={300} />
                            <SubmitButton variant="small-danger">Reddet</SubmitButton>
                          </ActionForm>
                        </details>
                      </div>
                    )}
                    {s.status === "ACTIVE" && !s.expired && (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-red-700">İptal et</summary>
                        <ActionForm action={rejectSubscriptionAction} compact className="mt-2 w-56 space-y-2" confirm="Paket iptal edilsin mi? Tedarikçinin hakları hemen sona erer.">
                          <input type="hidden" name="id" value={s.id} />
                          <Field name="note" label="İptal gerekçesi" required minLength={3} maxLength={300} />
                          <SubmitButton variant="small-danger">Paketi iptal et</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={subs.page} size={subs.size} total={subs.total} params={{ durum: sp.durum }} />
        </div>
      </div>
    </>
  );
}
