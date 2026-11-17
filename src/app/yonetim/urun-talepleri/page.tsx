import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { EmptyState, PageHeader, Pagination, Section, StatusBadge, toOptions } from "@/components/panel/ui";
import { approveProductRequestAction, rejectProductRequestAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { fmtDateTime, fmtNumber, REQUEST_STATUS, UNIT_TYPE } from "@/lib/format";
import { listProductRequests } from "@/modules/catalog/products";
import { listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Ürün Talepleri" };

export default async function ProductRequestsPage({ searchParams }: { searchParams: Promise<{ durum?: string; sayfa?: string }> }) {
  const { auth, base } = await requireOdaPage("productRequest.review");
  const sp = await searchParams;
  const [r, cats] = await Promise.all([listProductRequests(auth, { status: sp.durum, page: sp.sayfa }), listCategoryTree(chamberIdOf(auth))]);
  const catOptions = cats.map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }));

  return (
    <>
      <PageHeader title="Ürün Talepleri" description="Tedarikçilerin katalogda olmayan ürünler için gönderdiği talepler. Onaylanan ürün katalogda yayına girer." />
      <div className="mb-4 flex gap-2">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <Link
            key={s}
            href={`?durum=${s}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${r.status === s ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
          >
            {REQUEST_STATUS[s].label}
          </Link>
        ))}
      </div>
      {r.items.length === 0 ? (
        <EmptyState title="Talep yok." />
      ) : (
        <div className="space-y-4">
          {r.items.map((q) => (
            <Section
              key={q.id}
              title={q.name}
              actions={
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {q.supplier.tradeName} · {fmtDateTime(q.createdAt)} <StatusBadge map={REQUEST_STATUS} value={q.status} />
                </span>
              }
            >
              <div className="flex flex-wrap gap-6">
                {q.imagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${q.imagePath}`} alt="" className="h-28 w-28 rounded-lg border border-slate-200 object-contain" />
                )}
                <div className="text-sm text-slate-700">
                  <div>Marka: {q.brandName}</div>
                  <div>Barkod: {q.barcode ?? "—"}</div>
                  <div>
                    Birim: {q.unitAmount ? `${fmtNumber(q.unitAmount)} ` : ""}
                    {UNIT_TYPE[q.unitType]}
                  </div>
                  {q.description && <p className="mt-1 max-w-xl text-slate-600">{q.description}</p>}
                  {q.reviewNote && <p className="mt-2 text-slate-500">Not: {q.reviewNote}</p>}
                  {q.productId && (
                    <Link href={`${base}/urunler/${q.productId}`} className="mt-2 inline-block text-brand-600 hover:underline">
                      Katalogdaki ürün →
                    </Link>
                  )}
                </div>
              </div>
              {q.status === "PENDING" && (
                <div className="mt-5 grid gap-6 border-t border-slate-200 pt-5 lg:grid-cols-3">
                  <ActionForm action={approveProductRequestAction} className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                    <input type="hidden" name="id" value={q.id} />
                    <Field name="name" label="Ürün adı" required defaultValue={q.name} maxLength={150} wrapClassName="sm:col-span-2" />
                    <Field name="brandName" label="Marka" required defaultValue={q.brandName} hint="Yoksa yeni marka oluşturulur." />
                    <Field name="barcode" label="Barkod" defaultValue={q.barcode ?? ""} hint="Katalogda varsa talep mevcut ürüne bağlanır." />
                    <SelectField name="categoryId" label="Kategori" required placeholder="Seçin" defaultValue={q.categoryId ?? ""} options={catOptions} />
                    <div className="grid grid-cols-2 gap-2">
                      <SelectField name="unitType" label="Birim" defaultValue={q.unitType} options={toOptions(UNIT_TYPE)} />
                      <Field name="unitAmount" label="Miktar" defaultValue={q.unitAmount ? fmtNumber(q.unitAmount) : ""} />
                    </div>
                    <TextareaField name="description" label="Açıklama" defaultValue={q.description ?? ""} rows={2} wrapClassName="sm:col-span-2" />
                    <div>
                      <SubmitButton>Onayla ve kataloğa ekle</SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm action={rejectProductRequestAction} className="space-y-3" confirm="Talep reddedilsin mi?">
                    <input type="hidden" name="id" value={q.id} />
                    <Field name="note" label="Ret gerekçesi" required maxLength={500} />
                    <SubmitButton variant="danger">Reddet</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </Section>
          ))}
        </div>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ durum: r.status }} />
    </>
  );
}
