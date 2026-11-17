import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { ProductFields } from "@/components/oda/product-fields";
import { PageHeader, Section } from "@/components/panel/ui";
import { createProductAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { listBrands, listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Yeni Ürün" };

export default async function NewProductPage() {
  const { auth, base } = await requireOdaPage("product.manage");
  const [brands, cats] = await Promise.all([listBrands(), listCategoryTree(chamberIdOf(auth))]);
  return (
    <>
      <PageHeader title="Yeni Ürün" back={{ href: `${base}/urunler`, label: "Ürün Kataloğu" }} />
      <Section>
        {brands.length === 0 ? (
          <p className="text-sm text-slate-600">Önce en az bir marka ekleyin.</p>
        ) : (
          <ActionForm action={createProductAction} resetOnSuccess className="space-y-5">
            <ProductFields brands={brands} categories={cats} />
            <Field name="image" label="Ürün görseli" type="file" accept="image/jpeg,image/png,image/webp" hint="JPG, PNG veya WEBP; en fazla 5 MB." />
            <SubmitButton>Ürünü kaydet</SubmitButton>
          </ActionForm>
        )}
      </Section>
    </>
  );
}
