import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { EmptyState, FilterBar, FilterInput, PageHeader, Section } from "@/components/panel/ui";
import { createBrandAction, deleteBrandAction, updateBrandAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { listBrands } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Markalar" };

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOdaPage("brand.manage");
  const sp = await searchParams;
  const brands = await listBrands(sp.q?.trim());

  return (
    <>
      <PageHeader title="Markalar" description="Ürün kataloğunda kullanılan markalar." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar>
            <FilterInput name="q" label="Ara" defaultValue={sp.q} />
          </FilterBar>
          {brands.length === 0 ? (
            <EmptyState title="Marka bulunamadı." />
          ) : (
            <div className="card divide-y divide-slate-100">
              {brands.map((b) => (
                <div key={b.id} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                  <ActionForm action={updateBrandAction} compact className="flex flex-1 items-end gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <Field name="name" defaultValue={b.name} required maxLength={80} wrapClassName="flex-1" aria-label="Marka adı" />
                    <SubmitButton variant="small">Kaydet</SubmitButton>
                  </ActionForm>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{b._count.products} ürün</span>
                    {b._count.products === 0 && (
                      <ActionForm action={deleteBrandAction} compact confirm={`"${b.name}" silinsin mi?`}>
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton variant="small-danger">Sil</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Section title="Yeni marka">
          <ActionForm action={createBrandAction} resetOnSuccess className="space-y-4">
            <Field name="name" label="Marka adı" required maxLength={80} />
            <SubmitButton>Ekle</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
