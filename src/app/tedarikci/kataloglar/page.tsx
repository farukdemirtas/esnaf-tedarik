import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { EmptyState, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { createMyCatalogAction } from "@/actions/revenue";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { db } from "@/lib/db";
import { dateInput, fmtDate, fmtNumber, type Tone } from "@/lib/format";
import { listMyCatalogs } from "@/modules/revenue/catalogs";
import { primaryChamberId } from "@/modules/suppliers/self";

export const metadata: Metadata = { title: "Dijital Kataloglar" };

const CATALOG_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  APPROVED: { label: "Yayında", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  ENDED: { label: "Sona erdi", tone: "slate" },
};

/** Onaylı kataloğun tarihlere göre ek durumu */
function catalogTimingNote(c: { status: string; startsAt: Date; endsAt: Date | null }, now: Date) {
  if (c.status !== "APPROVED") return null;
  if (c.startsAt > now) return `${fmtDate(c.startsAt)} tarihinde yayına girecek`;
  if (c.endsAt && c.endsAt <= now) return "bitiş tarihi geçti";
  return null;
}

export default async function MyCatalogsPage() {
  const { auth, supplierId } = await requireSupplierPage("supplierSelf.marketing");
  const chamberId = await primaryChamberId(supplierId);
  const [items, categories] = await Promise.all([
    listMyCatalogs(auth),
    db.category.findMany({ where: { active: true, chamberId }, select: { id: true, name: true, parent: { select: { name: true } } } }),
  ]);
  const categoryOptions = categories
    .map((c) => ({ value: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Dijital Kataloglar"
        description="Aylık broşür veya ürün kataloğunuzu yükleyin; Oda onayladığında üyeler mağazada görür."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {items.length === 0 ? (
            <EmptyState title="Henüz kataloğunuz yok.">Yandaki formdan ilk kataloğunuzu oluşturabilirsiniz.</EmptyState>
          ) : (
            <Table head={["Katalog", "Tarihler", "Ürün", "Durum"]}>
              {items.map((c) => {
                const note = catalogTimingNote(c, now);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-start gap-3">
                        {c.coverPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={withBase(`/api/files/${c.coverPath}`)}
                            alt=""
                            className="h-16 w-12 shrink-0 rounded border border-slate-200 bg-slate-50 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-500" aria-hidden="true">
                            PDF
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link href={`/tedarikci/kataloglar/${c.id}`} className="break-words font-semibold text-brand-700 hover:underline">
                            {c.title}
                          </Link>
                          {c.category && <div className="text-xs text-slate-500">{c.category.name}</div>}
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div>{fmtDate(c.startsAt)}</div>
                      <div className="text-slate-500">{c.endsAt ? fmtDate(c.endsAt) : "Süresiz"}</div>
                    </Td>
                    <Td className="whitespace-nowrap">{fmtNumber(c._count.items)} ürün</Td>
                    <Td>
                      <StatusBadge map={CATALOG_STATUS} value={c.status} />
                      {note && <div className="mt-1 text-xs text-amber-700">{note}</div>}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
          <p className="text-xs text-slate-500">
            Kataloğa ürün eklemek için kataloğu açın. Reddedilme nedeni bildirimlerinizde yer alır; reddedilen kataloğu silip yenisini oluşturabilirsiniz.
          </p>
        </div>

        <Section title="Yeni katalog">
          <ActionForm action={createMyCatalogAction} className="space-y-4">
            <Field name="title" label="Katalog adı" required minLength={3} maxLength={150} placeholder="Örn. Aralık 2026 fırsat broşürü" />
            <SelectField name="categoryId" label="Kategori" placeholder="Kategori yok (genel)" options={categoryOptions} />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field name="startsAt" label="Başlangıç tarihi" type="date" required defaultValue={dateInput(now)} />
              <Field name="endsAt" label="Bitiş tarihi" type="date" hint="Boş bırakılırsa siz sonlandırana kadar yayında kalır." />
            </div>
            <Field name="cover" label="Kapak görseli" type="file" accept="image/jpeg,image/png,image/webp" hint="JPG, PNG veya WEBP; en fazla 5 MB." />
            <Field name="pdf" label="PDF katalog" type="file" accept="application/pdf" hint="İsteğe bağlı PDF broşür." />
            <p className="text-xs text-slate-500">
              Kapak görseli veya PDF dosyasından en az biri gereklidir. Kapak en fazla 5 MB, PDF en fazla 10 MB olabilir. Katalog oluşturulunca Oda onayına gönderilir.
            </p>
            <SubmitButton>Oluştur ve onaya gönder</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
