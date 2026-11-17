import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton, TextareaField } from "@/components/form";
import { DL, PageHeader, Section, StatusBadge } from "@/components/panel/ui";
import { updateMyLogoAction, updateMyProfileAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtMoney, moneyInput, SUPPLIER_STATUS } from "@/lib/format";
import { getMySupplier } from "@/modules/suppliers/self";

export const metadata: Metadata = { title: "Firma Profili" };

export default async function SupplierProfilePage() {
  const { auth, can } = await requireSupplierPage();
  const s = await getMySupplier(auth);
  const canEdit = can("supplierSelf.profile");

  return (
    <>
      <PageHeader title="Firma Profili" description="Üyelerin gördüğü firma bilgileriniz ve logonuz." />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Firma bilgileri">
            {canEdit ? (
              <ActionForm action={updateMyProfileAction} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="tradeName" label="Firma adı (üyelerin gördüğü)" required defaultValue={s.tradeName} maxLength={100} />
                  <Field name="phone" label="Firma telefonu" required type="tel" defaultValue={s.phone} placeholder="05321234567" />
                  <Field name="email" label="Firma e-postası" required type="email" defaultValue={s.email} />
                  <Field name="contactName" label="Yetkili kişi" required defaultValue={s.contactName} maxLength={100} />
                  <Field name="contactPhone" label="Yetkili telefonu" type="tel" defaultValue={s.contactPhone ?? ""} />
                  <Field
                    name="minOrderAmount"
                    label="Minimum sipariş tutarı (₺, KDV hariç)"
                    required
                    inputMode="decimal"
                    defaultValue={moneyInput(s.minOrderAmount)}
                    hint="Sipariş bu tutarın altındaysa gönderilemez. Sınır yoksa 0 yazın."
                  />
                  <TextareaField name="address" label="Adres" required defaultValue={s.address} maxLength={400} rows={2} wrapClassName="sm:col-span-2" />
                  <TextareaField
                    name="description"
                    label="Firma tanıtımı"
                    defaultValue={s.description ?? ""}
                    maxLength={2000}
                    rows={4}
                    wrapClassName="sm:col-span-2"
                    hint="Üyeler firma sayfanızda bu yazıyı görür. Ne sattığınızı kısaca anlatın."
                  />
                </div>
                <SubmitButton>Kaydet</SubmitButton>
              </ActionForm>
            ) : (
              <>
                <p className="mb-4 text-sm text-slate-500">Bu bilgileri yalnızca firma yetkiliniz değiştirebilir.</p>
                <DL
                  items={[
                    ["Firma adı", s.tradeName],
                    ["Telefon", s.phone],
                    ["E-posta", s.email],
                    ["Yetkili", `${s.contactName}${s.contactPhone ? ` (${s.contactPhone})` : ""}`],
                    ["Min. sipariş", fmtMoney(s.minOrderAmount)],
                    ["Adres", s.address],
                    ["Tanıtım", s.description],
                  ]}
                />
              </>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Logo">
            <div className="flex flex-wrap items-center gap-4">
              {s.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${s.logoPath}`}
                  alt={`${s.tradeName} logosu`}
                  className="h-32 w-32 rounded-lg border border-slate-200 bg-white object-contain p-2"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-sm text-slate-500">
                  Logo yok
                </div>
              )}
              {canEdit && s.logoPath && (
                <ActionForm action={updateMyLogoAction} compact confirm="Logo kaldırılsın mı?">
                  <input type="hidden" name="remove" value="1" />
                  <SubmitButton variant="small-danger">Logoyu kaldır</SubmitButton>
                </ActionForm>
              )}
            </div>
            {canEdit && (
              <ActionForm action={updateMyLogoAction} resetOnSuccess className="mt-5 space-y-3">
                <Field
                  name="logo"
                  label={s.logoPath ? "Yeni logo seçin" : "Logo dosyası seçin"}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  hint="JPG, PNG veya WEBP; en fazla 5 MB. Kare bir görsel en iyi sonucu verir."
                />
                <SubmitButton>{s.logoPath ? "Logoyu değiştir" : "Logoyu yükle"}</SubmitButton>
              </ActionForm>
            )}
          </Section>

          <Section title="Resmî bilgiler">
            <DL
              items={[
                ["Ticari unvan", s.legalName],
                ["Vergi dairesi / no", `${s.taxOffice} / ${s.taxNumber}`],
                ["MERSİS no", s.mersisNumber],
                ["Durum", <StatusBadge key="status" map={SUPPLIER_STATUS} value={s.status} />],
              ]}
            />
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Unvan ve vergi bilgileri yalnızca Oda tarafından değiştirilebilir. Bir hata varsa Oda ile iletişime geçin.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
