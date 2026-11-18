import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { PageHeader, Section, StatusBadge, toOptions } from "@/components/panel/ui";
import { cancelProductRequestAction, createProductRequestAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtDateTime, fmtNumber, REQUEST_STATUS, UNIT_TYPE } from "@/lib/format";
import { listMyProductRequests } from "@/modules/catalog/offers-supplier";
import { listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Yeni Ürün Talepleri" };

export default async function MyProductRequestsPage() {
  const { auth, can } = await requireSupplierPage("supplierSelf.offers");
  const canPrice = can("supplierSelf.pricing");
  const [requests, cats] = await Promise.all([listMyProductRequests(auth), listCategoryTree(auth.chamberId!, true)]);
  const catOptions = cats.map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }));

  return (
    <>
      <PageHeader
        title="Yeni Ürün Talepleri"
        description="Satmak istediğiniz ürün Oda kataloğunda yoksa bilgilerini gönderin. Oda onaylayınca ürün kataloğa eklenir ve fiyatınızı girebilirsiniz."
      />
      {canPrice && (
        <p className="-mt-3 mb-6 text-sm">
          <Link href="/tedarikci/urunler/yeni" className="font-semibold text-brand-600 hover:underline">
            Göndermeden önce katalogda arayın →
          </Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Section title="Yeni ürün talebi" className="self-start lg:col-span-2">
          <ActionForm action={createProductRequestAction} resetOnSuccess className="space-y-4">
            <Field name="name" label="Ürün adı" required minLength={2} maxLength={150} placeholder="Örn. Çikolatalı Gofret 36 g" />
            <Field name="brandName" label="Marka" required maxLength={80} />
            <Field name="barcode" label="Barkod" inputMode="numeric" autoComplete="off" maxLength={14} hint="Ürünün üzerindeki 8-14 haneli barkod numarası (varsa)." />
            <SelectField name="categoryId" label="Kategori" placeholder="Bilmiyorum, Oda seçsin" options={catOptions} />
            <div className="grid grid-cols-2 gap-3">
              <SelectField name="unitType" label="Birim" required defaultValue="ADET" options={toOptions(UNIT_TYPE)} />
              <Field name="unitAmount" label="Miktar" inputMode="decimal" autoComplete="off" placeholder="Örn. 0,5" />
            </div>
            <p className="-mt-2 text-xs text-slate-500">Örn. 1 litrelik ürün için “Litre” ve 1; 500 gramlık ürün için “Kg” ve 0,5 yazın.</p>
            <TextareaField name="description" label="Açıklama" rows={3} maxLength={2000} hint="İsteğe bağlı. Oda'nın bilmesi gereken ek bilgiler." />
            <Field name="image" label="Ürün fotoğrafı" type="file" accept="image/jpeg,image/png,image/webp" hint="İsteğe bağlı. JPG, PNG veya WEBP; en fazla 5 MB." />
            <SubmitButton className="w-full sm:w-auto">Talebi gönder</SubmitButton>
          </ActionForm>
        </Section>

        <Section title={`Taleplerim (${requests.length})`} className="self-start lg:col-span-3">
          {requests.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz talep göndermediniz.</p>
          ) : (
            <ul className="-my-3 divide-y divide-slate-100">
              {requests.map((q) => (
                <li key={q.id} className="flex flex-wrap gap-4 py-4">
                  {q.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={withBase(`/api/files/${q.imagePath}`)} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-contain" />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{q.name}</span>
                      <StatusBadge map={REQUEST_STATUS} value={q.status} />
                    </div>
                    <div className="mt-0.5 text-slate-600">
                      {q.brandName}
                      {q.unitAmount ? ` · ${fmtNumber(q.unitAmount)} ${UNIT_TYPE[q.unitType]}` : ` · ${UNIT_TYPE[q.unitType]}`}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Barkod: <span className="font-mono">{q.barcode ?? "—"}</span> · Gönderim: {fmtDateTime(q.createdAt)}
                    </div>
                    {q.reviewNote && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-slate-700">Oda notu: {q.reviewNote}</p>}
                    {q.status === "APPROVED" && q.productId && canPrice && (
                      <Link href={`/tedarikci/urunler/yeni?urun=${q.productId}`} className="btn-primary mt-3 px-3 py-1.5 text-sm">
                        Fiyat girin →
                      </Link>
                    )}
                  </div>
                  {q.status === "PENDING" && (
                    <ActionForm action={cancelProductRequestAction} compact confirm="Talep geri çekilsin mi?">
                      <input type="hidden" name="id" value={q.id} />
                      <SubmitButton variant="small-danger">Geri çek</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
