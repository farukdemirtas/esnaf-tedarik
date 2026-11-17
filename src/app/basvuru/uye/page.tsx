import type { Metadata } from "next";
import Link from "next/link";
import { submitMemberApplicationAction } from "@/actions/public";
import { ActionForm, CheckboxField, SubmitButton } from "@/components/form";
import { MemberFields } from "@/components/oda/member-fields";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = { title: "Üyelik başvurusu" };

export default function MemberApplicationPage() {
  return (
    <PublicShell>
      <Link href="/basvuru" className="text-sm text-brand-600 hover:underline">
        ← Başvuru türleri
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Üyelik başvurusu</h1>
      <p className="mt-1.5 text-slate-600">
        Bakkal, market ve benzeri Oda üyesi işletmeler içindir. Başvurunuz Oda tarafından incelenir; onaylandığında size
        kullanıcı adı ve geçici şifre iletilir. Üyelerden komisyon alınmaz.
      </p>

      <ActionForm action={submitMemberApplicationAction} resetOnSuccess className="card mt-6 space-y-6 p-5 sm:p-6">
        <MemberFields />

        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

        <div className="space-y-2 border-t border-slate-200 pt-5">
          <CheckboxField
            name="kvkk"
            label="KVKK aydınlatma metnini okudum, kişisel verilerimin başvurumun değerlendirilmesi amacıyla işlenmesini kabul ediyorum."
          />
          <p className="pl-7.5 text-sm">
            <Link href="/kvkk" target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">
              KVKK aydınlatma metnini oku
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            <span className="text-red-600">*</span> işaretli alanlar zorunludur.
          </p>
          <SubmitButton className="w-full sm:w-auto">Başvuruyu gönder</SubmitButton>
        </div>
      </ActionForm>
    </PublicShell>
  );
}
