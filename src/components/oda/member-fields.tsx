import { Field } from "@/components/form";

type M = {
  businessName?: string;
  ownerName?: string;
  registryNumber?: string;
  businessType?: string | null;
  taxOffice?: string | null;
  phone?: string;
  email?: string | null;
};

/** Üye formu alanları (Oda ekranı ve herkese açık başvuru formu ortak kullanır) */
export function MemberFields({ m = {}, taxIdHint }: { m?: M; taxIdHint?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="businessName" label="İşletme adı" required defaultValue={m.businessName} maxLength={150} />
      <Field name="ownerName" label="İşletme sahibi / yetkili" required defaultValue={m.ownerName} maxLength={100} />
      <Field name="registryNumber" label="Oda sicil numarası" required defaultValue={m.registryNumber} maxLength={30} />
      <Field name="businessType" label="İşletme türü" placeholder="Bakkal, market, büfe…" defaultValue={m.businessType ?? ""} maxLength={60} />
      <Field name="phone" label="Telefon" required type="tel" inputMode="tel" placeholder="05xx xxx xx xx" defaultValue={m.phone} />
      <Field name="email" label="E-posta" type="email" defaultValue={m.email ?? ""} />
      <Field name="taxOffice" label="Vergi dairesi" defaultValue={m.taxOffice ?? ""} maxLength={80} />
      <Field name="taxId" label="Vergi / TC kimlik no" inputMode="numeric" maxLength={11} hint={taxIdHint ?? "Şifreli olarak saklanır."} autoComplete="off" />
    </div>
  );
}
