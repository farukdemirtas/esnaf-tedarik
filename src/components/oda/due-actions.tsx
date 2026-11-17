import { ActionForm, Field, SubmitButton } from "@/components/form";
import { deleteDueAction, markDuePaidAction, reopenDueAction, waiveDueAction } from "@/actions/oda";
import { dateInput } from "@/lib/format";

/** Aidat satırı işlemleri: ödendi, muaf, geri al, sil */
export function DueRowActions({ due }: { due: { id: string; status: string } }) {
  if (due.status !== "UNPAID")
    return (
      <ActionForm action={reopenDueAction} compact confirm="Kayıt 'Ödenmedi' durumuna alınsın mı?">
        <input type="hidden" name="id" value={due.id} />
        <SubmitButton variant="small">Geri al</SubmitButton>
      </ActionForm>
    );
  return (
    <details className="text-sm">
      <summary className="cursor-pointer whitespace-nowrap font-medium text-brand-600">İşlem</summary>
      <div className="mt-2 w-64 space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <ActionForm action={markDuePaidAction} compact className="space-y-2">
          <input type="hidden" name="id" value={due.id} />
          <Field name="paidAt" type="date" label="Ödeme tarihi" required defaultValue={dateInput(new Date())} />
          <SubmitButton variant="small">Ödendi</SubmitButton>
        </ActionForm>
        <ActionForm action={waiveDueAction} compact className="space-y-2">
          <input type="hidden" name="id" value={due.id} />
          <Field name="note" label="Muafiyet gerekçesi" required maxLength={300} />
          <SubmitButton variant="small">Muaf tut</SubmitButton>
        </ActionForm>
        <ActionForm action={deleteDueAction} compact confirm="Hatalı aidat kaydı silinsin mi?">
          <input type="hidden" name="id" value={due.id} />
          <SubmitButton variant="small-danger">Sil</SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
