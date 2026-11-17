import { CheckboxField, Field, SelectField, TextareaField } from "@/components/form";
import { toOptions } from "@/components/panel/ui";
import { AUDIENCE, dateTimeInput } from "@/lib/format";

type A = {
  title?: string;
  body?: string;
  audience?: string;
  pinned?: boolean;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
};

/**
 * Duyuru formu alanları (yeni duyuru ve düzenleme ortak kullanır).
 * `narrow`: geniş ekranda dar yan sütunda gösterildiğinde alanlar alt alta dizilir.
 */
export function AnnouncementFields({ a = {}, narrow }: { a?: A; narrow?: boolean }) {
  const grid = narrow ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-1" : "grid gap-4 sm:grid-cols-2";
  const full = narrow ? "sm:col-span-2 xl:col-span-1" : "sm:col-span-2";
  return (
    <div className={grid}>
      <Field name="title" label="Başlık" required defaultValue={a.title} maxLength={150} wrapClassName={full} />
      <TextareaField name="body" label="Duyuru metni" required defaultValue={a.body} maxLength={5000} rows={6} wrapClassName={full} />
      <SelectField name="audience" label="Hedef kitle" required defaultValue={a.audience ?? "ALL"} options={toOptions(AUDIENCE)} />
      <div className="flex items-end sm:pb-2">
        <CheckboxField name="pinned" label="Üstte sabitle" defaultChecked={a.pinned} />
      </div>
      <Field
        name="publishedAt"
        label="Yayın tarihi"
        type="datetime-local"
        defaultValue={dateTimeInput(a.publishedAt)}
        hint="Boş bırakılırsa hemen yayınlanır."
      />
      <Field name="expiresAt" label="Bitiş tarihi" type="datetime-local" defaultValue={dateTimeInput(a.expiresAt)} hint="Boş bırakılırsa süresiz." />
    </div>
  );
}
