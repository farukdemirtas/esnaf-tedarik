import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { SupplierFields } from "@/components/oda/supplier-fields";
import { PageHeader, Section } from "@/components/panel/ui";
import { createSupplierAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";

export const metadata: Metadata = { title: "Yeni Tedarikçi" };

export default async function NewSupplierPage() {
  const { base } = await requireOdaPage("supplier.create");
  return (
    <>
      <PageHeader
        title="Yeni Tedarikçi"
        back={{ href: `${base}/tedarikciler`, label: "Tedarikçiler" }}
        description="Oda tarafından eklenen firma onaylı olarak açılır; yetkili için geçici şifre üretilir."
      />
      <Section>
        <ActionForm action={createSupplierAction} resetOnSuccess className="space-y-5">
          <SupplierFields />
          <div className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
            <Field name="ownerName" label="Panel kullanıcısının adı soyadı" required maxLength={100} />
            <Field name="username" label="Kullanıcı adı" hint="Boş bırakılırsa firma e-postası kullanılır." maxLength={50} autoComplete="off" />
          </div>
          <SubmitButton>Tedarikçiyi kaydet</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
