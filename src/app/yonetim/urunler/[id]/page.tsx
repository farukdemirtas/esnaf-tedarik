import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { ProductFields } from "@/components/oda/product-fields";
import { Badge, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { addProductImageAction, deleteProductImageAction, updateProductAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError } from "@/lib/errors";
import { fmtMoney, fmtNumber, PACK_TYPE, PRODUCT_STATUS } from "@/lib/format";
import { getProduct, MAX_IMAGES_PER_PRODUCT } from "@/modules/catalog/products";
import { listBrands, listCategoryTree } from "@/modules/catalog/taxonomy";

export const metadata: Metadata = { title: "Ürün" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base, can } = await requireOdaPage("product.manage");
  const { id } = await params;
  const [p, brands, cats] = await Promise.all([
    getProduct(auth, id).catch((e) => {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }),
    listBrands(),
    listCategoryTree(chamberIdOf(auth)),
  ]);

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.brand.name} · ${p.category.name}`}
        back={{ href: `${base}/urunler`, label: "Ürün Kataloğu" }}
        actions={<StatusBadge map={PRODUCT_STATUS} value={p.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Ürün bilgileri">
            <ActionForm action={updateProductAction} className="space-y-5">
              <input type="hidden" name="id" value={p.id} />
              <ProductFields p={p} brands={brands} categories={cats} />
              <SubmitButton>Kaydet</SubmitButton>
            </ActionForm>
          </Section>

          <Section title={`Tedarikçi teklifleri (${p.offers.length})`}>
            {p.offers.length === 0 ? (
              <p className="text-sm text-slate-500">Bu ürün için henüz teklif yok.</p>
            ) : (
              <Table head={["Tedarikçi", "Paket", "Paket fiyatı (KDV hariç)", "Stok", "Durum"]}>
                {p.offers.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      {can("supplier.view") ? (
                        <Link href={`${base}/tedarikciler/${o.supplier.id}`} className="text-brand-700 hover:underline">
                          {o.supplier.tradeName}
                        </Link>
                      ) : (
                        o.supplier.tradeName
                      )}
                    </Td>
                    <Td>
                      {PACK_TYPE[o.packType]}
                      {o.packType === "KOLI" || o.packType === "PAKET" ? ` (${o.unitsPerPack} adet)` : ""}
                    </Td>
                    <Td>{fmtMoney(o.packPrice)}</Td>
                    <Td>{fmtNumber(o.stock?.quantity ?? 0)}</Td>
                    <Td>{o.removedByAdmin ? <Badge tone="red">Kaldırıldı</Badge> : o.active ? <Badge tone="green">Yayında</Badge> : <Badge>Pasif</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        </div>

        <Section title="Görseller">
          {p.images.length === 0 && <p className="mb-3 text-sm text-slate-500">Görsel yok.</p>}
          <div className="grid grid-cols-2 gap-3">
            {p.images.map((img) => (
              <div key={img.id} className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${img.path}`} alt={p.name} className="aspect-square w-full rounded-lg border border-slate-200 object-contain" />
                <ActionForm action={deleteProductImageAction} compact confirm="Görsel silinsin mi?">
                  <input type="hidden" name="id" value={img.id} />
                  <SubmitButton variant="small-danger">Sil</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </div>
          {p.images.length < MAX_IMAGES_PER_PRODUCT && (
            <ActionForm action={addProductImageAction} resetOnSuccess className="mt-4 space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <Field name="image" label="Görsel ekle" type="file" required accept="image/jpeg,image/png,image/webp" hint="JPG, PNG veya WEBP; en fazla 5 MB." />
              <SubmitButton variant="small">Yükle</SubmitButton>
            </ActionForm>
          )}
        </Section>
      </div>
    </>
  );
}
