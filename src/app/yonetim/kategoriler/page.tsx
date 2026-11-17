import type { Metadata } from "next";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, PageHeader, Section } from "@/components/panel/ui";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Kategoriler" };

export default async function CategoriesPage() {
  const { auth } = await requireOdaPage("category.manage");
  const tree = await listCategoryTree(chamberIdOf(auth));
  const parentOptions = tree.map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }));

  return (
    <>
      <PageHeader title="Kategoriler" description="Ana kategoriler ve alt kategoriler. Pasif kategoriler üyelere gösterilmez." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="card divide-y divide-slate-100">
            {tree.map((c) => (
              <details key={c.id} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <span style={{ paddingLeft: `${c.depth * 1.25}rem` }} className="flex items-center gap-2">
                    {c.depth > 0 && <span className="text-slate-400">└</span>}
                    <span className={`font-medium ${c.active ? "text-slate-900" : "text-slate-400 line-through"}`}>{c.name}</span>
                    {!c.active && <Badge>Pasif</Badge>}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    {c._count.products} ürün · sıra {c.sortOrder}
                    <span className="text-brand-600 group-open:hidden">Düzenle</span>
                  </span>
                </summary>
                <div className="space-y-3 bg-slate-50 px-4 py-4">
                  <ActionForm action={updateCategoryAction} className="grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="id" value={c.id} />
                    <Field name="name" label="Ad" required defaultValue={c.name} maxLength={80} wrapClassName="sm:col-span-2" />
                    <SelectField
                      name="parentId"
                      label="Üst kategori"
                      placeholder="(Ana kategori)"
                      defaultValue={c.parentId ?? ""}
                      options={parentOptions.filter((o) => o.value !== c.id)}
                    />
                    <Field name="sortOrder" label="Sıra" type="number" min={0} defaultValue={c.sortOrder} />
                    <div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-3">
                      <CheckboxField name="active" label="Aktif" defaultChecked={c.active} />
                      <SubmitButton variant="small">Kaydet</SubmitButton>
                    </div>
                  </ActionForm>
                  <ActionForm action={deleteCategoryAction} compact confirm={`"${c.name}" silinsin mi?`}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton variant="small-danger">Kategoriyi sil</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            ))}
          </div>
        </div>
        <Section title="Yeni kategori">
          <ActionForm action={createCategoryAction} resetOnSuccess className="space-y-4">
            <Field name="name" label="Ad" required maxLength={80} />
            <SelectField name="parentId" label="Üst kategori" placeholder="(Ana kategori)" options={parentOptions} hint="Alt kategori oluşturmak için üst kategori seçin." />
            <Field name="sortOrder" label="Sıra" type="number" min={0} defaultValue={0} />
            <CheckboxField name="active" label="Aktif" defaultChecked />
            <SubmitButton>Ekle</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
