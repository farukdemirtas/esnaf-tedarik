import type { Metadata } from "next";
import { Alert } from "@/components/brand";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, EmptyState, PageHeader, Section, Table, Td } from "@/components/panel/ui";
import { addAllDistrictsAction, deleteDeliveryAreaAction, saveDeliveryAreaAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtMoney } from "@/lib/format";
import { listMyDeliveryAreas } from "@/modules/suppliers/self";

export const metadata: Metadata = { title: "Hizmet Bölgeleri" };

/** 1 = Pazartesi … 7 = Pazar */
const DAYS = [
  { value: 1, short: "Pzt", long: "Pazartesi" },
  { value: 2, short: "Sal", long: "Salı" },
  { value: 3, short: "Çar", long: "Çarşamba" },
  { value: 4, short: "Per", long: "Perşembe" },
  { value: 5, short: "Cum", long: "Cuma" },
  { value: 6, short: "Cmt", long: "Cumartesi" },
  { value: 7, short: "Paz", long: "Pazar" },
];
const DAY_SHORT: Record<number, string> = Object.fromEntries(DAYS.map((d) => [d.value, d.short]));

/**
 * Aynı isimli ("days") birden çok onay kutusu. Üstteki devre dışı gizli alan yalnızca
 * etiket ve "days" alan hatasını göstermek içindir; devre dışı alanlar forma eklenmez.
 */
function DayCheckboxes() {
  return (
    <div>
      <Field name="days" type="hidden" disabled label="Teslimat günleri" required hint="Siparişleri teslim ettiğiniz günleri işaretleyin." />
      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {DAYS.map((d) => (
          <label
            key={d.value}
            title={d.long}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
          >
            <input type="checkbox" name="days" value={String(d.value)} className="h-5 w-5 rounded border-slate-300 accent-brand-600" />
            <span>{d.short}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default async function DeliveryAreasPage() {
  const { auth, can } = await requireSupplierPage();
  const { areas, districts } = await listMyDeliveryAreas(auth);
  const canEdit = can("supplierSelf.profile");
  const added = new Set(areas.map((a) => a.districtId));
  const missing = districts.filter((d) => !added.has(d.id)).length;

  return (
    <>
      <PageHeader title="Hizmet Bölgeleri" description="Hangi ilçelere, haftanın hangi günleri teslimat yaptığınızı belirtin." />

      <div className="mb-6">
        <Alert tone="info">
          <strong>Önemli:</strong> Üyeler ürünlerinizi yalnızca burada listelenen ilçelerde görür ve sipariş verebilir. Hiç bölge eklemezseniz
          hiçbir üye ürünlerinizi göremez.
        </Alert>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        Hizmet verdiğiniz ilçeler {areas.length > 0 && <span className="text-slate-500">({areas.length})</span>}
      </h2>
      {areas.length === 0 ? (
        <EmptyState title="Henüz hizmet bölgesi eklenmedi.">
          {canEdit ? "Aşağıdaki formdan ilçe ekleyin." : "Bölgeleri firma yetkiliniz ekleyebilir."}
        </EmptyState>
      ) : (
        <Table head={["İlçe", "Teslimat günleri", "Bu ilçe için min. sipariş", ""]}>
          {areas.map((a) => (
            <tr key={a.id}>
              <Td className="font-medium">{a.district.name}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {a.deliveryDays.length === 0 ? (
                    <span className="text-slate-500">Gün belirtilmemiş</span>
                  ) : (
                    a.deliveryDays.map((d) => (
                      <Badge key={d} tone="blue">
                        {DAY_SHORT[d] ?? d}
                      </Badge>
                    ))
                  )}
                </div>
              </Td>
              <Td className="whitespace-nowrap tabular-nums">{a.minOrderAmount ? fmtMoney(a.minOrderAmount) : "—"}</Td>
              <Td className="text-right">
                {canEdit && (
                  <ActionForm
                    action={deleteDeliveryAreaAction}
                    compact
                    confirm={`${a.district.name} hizmet bölgelerinizden kaldırılsın mı? Bu ilçedeki üyeler ürünlerinizi göremez.`}
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton variant="small-danger">Kaldır</SubmitButton>
                  </ActionForm>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {canEdit ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Section title="İlçe ekle veya güncelle">
            {districts.length === 0 ? (
              <p className="text-sm text-slate-500">Odanızda tanımlı ilçe yok. Lütfen Oda ile iletişime geçin.</p>
            ) : (
              <ActionForm action={saveDeliveryAreaAction} resetOnSuccess className="space-y-4">
                <SelectField
                  name="districtId"
                  label="İlçe"
                  required
                  placeholder="İlçe seçin"
                  options={districts.map((d) => ({ value: d.id, label: added.has(d.id) ? `${d.name} (ekli)` : d.name }))}
                  hint="Ekli bir ilçeyi seçip kaydederseniz günleri ve tutarı güncellenir."
                />
                <DayCheckboxes />
                <Field
                  name="minOrderAmount"
                  label="Bu ilçe için minimum sipariş tutarı (₺, isteğe bağlı)"
                  inputMode="decimal"
                  placeholder="Örn. 1500"
                  hint="Boş bırakırsanız firma profilinizdeki genel tutar geçerli olur."
                />
                <SubmitButton>Kaydet</SubmitButton>
              </ActionForm>
            )}
          </Section>

          {missing > 0 && (
            <Section title="Hızlı kurulum: tüm ilçeler">
              <p className="mb-4 text-sm text-slate-600">
                Odanızın tüm ilçelerine aynı günlerde teslimat yapıyorsanız hepsini tek seferde ekleyebilirsiniz. Daha önce eklediğiniz ilçeler
                değişmez. Eklenecek ilçe sayısı: <strong>{missing}</strong>.
              </p>
              <ActionForm action={addAllDistrictsAction} resetOnSuccess className="space-y-4" confirm={`${missing} ilçe hizmet bölgelerinize eklensin mi?`}>
                <DayCheckboxes />
                <SubmitButton>Tüm ilçelere aynı günlerle hizmet veriyorum</SubmitButton>
              </ActionForm>
            </Section>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Hizmet bölgelerini yalnızca firma yetkiliniz değiştirebilir.</p>
      )}
    </>
  );
}
