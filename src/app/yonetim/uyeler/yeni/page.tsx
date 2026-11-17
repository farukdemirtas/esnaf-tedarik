import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { MemberFields } from "@/components/oda/member-fields";
import { PageHeader, Section } from "@/components/panel/ui";
import { createMemberAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";

export const metadata: Metadata = { title: "Yeni Üye" };

export default async function NewMemberPage() {
  const { base } = await requireOdaPage("member.create");
  return (
    <>
      <PageHeader title="Yeni Üye" back={{ href: `${base}/uyeler`, label: "Üyeler" }} description="Üye aktif olarak açılır ve giriş için geçici şifre üretilir." />
      <Section>
        <ActionForm action={createMemberAction} resetOnSuccess className="space-y-5">
          <MemberFields />
          <Field
            name="username"
            label="Kullanıcı adı"
            hint="Boş bırakılırsa oda sicil numarası kullanıcı adı olur."
            maxLength={50}
            wrapClassName="sm:max-w-sm"
            autoComplete="off"
          />
          <SubmitButton>Üyeyi kaydet</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
