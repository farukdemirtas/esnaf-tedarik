import { Field, TextareaField } from "@/components/form";
import { moneyInput } from "@/lib/format";

type S = {
  legalName?: string;
  tradeName?: string;
  taxOffice?: string;
  taxNumber?: string;
  mersisNumber?: string | null;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  contactPhone?: string | null;
  minOrderAmount?: { toString(): string } | null;
  description?: string | null;
};

/** Tedarikçi firma alanları (Oda ekranı ve başvuru formu ortak kullanır) */
export function SupplierFields({ s = {} }: { s?: S }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="tradeName" label="Firma adı (görünen)" required defaultValue={s.tradeName} maxLength={100} />
      <Field name="legalName" label="Ticari unvan" required defaultValue={s.legalName} maxLength={200} />
      <Field name="taxOffice" label="Vergi dairesi" required defaultValue={s.taxOffice} maxLength={80} />
      <Field name="taxNumber" label="Vergi numarası" required inputMode="numeric" maxLength={11} defaultValue={s.taxNumber} />
      <Field name="mersisNumber" label="MERSİS no" defaultValue={s.mersisNumber ?? ""} maxLength={20} />
      <Field name="phone" label="Firma telefonu" required type="tel" defaultValue={s.phone} />
      <Field name="email" label="Firma e-postası" required type="email" defaultValue={s.email} />
      <Field name="contactName" label="Yetkili kişi" required defaultValue={s.contactName} maxLength={100} />
      <Field name="contactPhone" label="Yetkili telefonu" type="tel" defaultValue={s.contactPhone ?? ""} />
      <Field
        name="minOrderAmount"
        label="Minimum sipariş tutarı (₺, KDV hariç)"
        required
        inputMode="decimal"
        defaultValue={s.minOrderAmount !== undefined && s.minOrderAmount !== null ? moneyInput(s.minOrderAmount) : "0"}
        hint="Sipariş bu tutarın altındaysa gönderilemez. Sınır yoksa 0."
      />
      <TextareaField name="address" label="Adres" required defaultValue={s.address} maxLength={400} rows={2} wrapClassName="sm:col-span-2" />
      <TextareaField name="description" label="Firma tanıtımı" defaultValue={s.description ?? ""} maxLength={2000} rows={3} wrapClassName="sm:col-span-2" />
    </div>
  );
}
