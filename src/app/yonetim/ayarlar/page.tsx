import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { PageHeader, Section } from "@/components/panel/ui";
import { updateChamberAction, updateDuesThresholdAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { getChamber } from "@/modules/admin/service";
import { getDuesBlockThreshold } from "@/modules/members/dues";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const { auth } = await requireOdaPage("settings.manage");
  const [c, threshold] = await Promise.all([getChamber(auth), getDuesBlockThreshold(chamberIdOf(auth))]);

  return (
    <>
      <PageHeader title="Ayarlar" description="Oda bilgileri ve sistem kuralları." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Oda bilgileri" className="xl:col-span-2">
          <ActionForm action={updateChamberAction} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="name" label="Oda adı" required defaultValue={c.name} maxLength={200} wrapClassName="sm:col-span-2" />
              <Field name="shortName" label="Kısa ad" required defaultValue={c.shortName} maxLength={80} />
              <Field name="phone" label="Telefon" type="tel" inputMode="tel" defaultValue={c.phone ?? ""} />
              <Field name="email" label="E-posta" type="email" defaultValue={c.email ?? ""} />
              <Field name="taxOffice" label="Vergi dairesi" defaultValue={c.taxOffice ?? ""} maxLength={80} />
              <Field name="taxNumber" label="Vergi numarası" inputMode="numeric" defaultValue={c.taxNumber ?? ""} maxLength={11} />
              <Field name="address" label="Adres" defaultValue={c.address ?? ""} maxLength={400} wrapClassName="sm:col-span-2" />
            </div>
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Section>
        <Section title="Aidat kuralı">
          <ActionForm action={updateDuesThresholdAction} className="space-y-4">
            <p className="text-sm text-slate-600">
              Vadesi geçmiş ve ödenmemiş aidat sayısı bu değere ulaşan üyeler yeni sipariş veremez. Sisteme girişleri
              açık kalır; aidat ödendiğinde sipariş engeli kendiliğinden kalkar.
            </p>
            <Field
              name="threshold"
              label="Sipariş engeli için gecikmiş aidat sayısı"
              type="number"
              required
              min={1}
              max={24}
              defaultValue={threshold}
              hint="1 ile 24 arasında bir değer girin."
            />
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
