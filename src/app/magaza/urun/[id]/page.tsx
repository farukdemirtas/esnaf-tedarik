import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toggleFavoriteAction } from "@/actions/member";
import { Alert } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, DL, EmptyState, PageHeader, Section, Table, Td } from "@/components/panel/ui";
import { AddToCart } from "@/components/shop/add-to-cart";
import { DeliveryNotice, fmtDeliveryDays, packLabel, ProductImage, StockBadge, unitLabel } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { NotFoundError } from "@/lib/errors";
import { fmtMoney, fmtNumber, PACK_TYPE, UNIT_TYPE } from "@/lib/format";
import { getShopProduct } from "@/modules/shop/catalog";

export const metadata: Metadata = { title: "Ürün" };

export default async function ShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, can } = await requireMemberPage("memberSelf.shop");
  const { id } = await params;
  const { ctx, product: p, offers, cheapestId, isFavorite } = await getShopProduct(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const canCart = can("memberSelf.cart");
  const unit = unitLabel(p.unitType);
  const [mainImage, ...moreImages] = p.images;
  const dues = auth.member!.dues;

  return (
    <>
      <PageHeader
        title={p.name}
        description={p.brand.name}
        back={{ href: "/magaza/urunler", label: "Ürünler" }}
        actions={
          <ActionForm action={toggleFavoriteAction} compact>
            <input type="hidden" name="productId" value={p.id} />
            <SubmitButton variant="secondary" className="px-3 py-1.5 text-sm">
              {isFavorite ? "★ Favorilerden çıkar" : "☆ Favorilere ekle"}
            </SubmitButton>
          </ActionForm>
        }
      />
      <DeliveryNotice ctx={ctx} />
      {dues.orderingBlocked && (
        <div className="mb-4">
          <Alert tone="warning">Vadesi geçmiş aidat kaydınız bulunduğu için sipariş verme geçici olarak kapalıdır. Ürünleri sepete ekleyebilirsiniz.</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div>
          <ProductImage path={mainImage?.path ?? null} alt={p.name} className="aspect-square w-full rounded-xl border border-slate-200" />
          {moreImages.length > 0 && (
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {moreImages.map((img) => (
                <li key={img.id}>
                  <a href={withBase(`/api/files/${img.path}`)} target="_blank" rel="noopener noreferrer" aria-label="Görseli büyük aç">
                    <ProductImage path={img.path} alt="" className="aspect-square w-full rounded-lg border border-slate-200" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Section title="Ürün bilgileri">
          <DL
            items={[
              ["Marka", p.brand.name],
              [
                "Kategori",
                <nav key="cat" aria-label="Kategori" className="flex flex-wrap items-center gap-1">
                  {p.category.parent && (
                    <>
                      <Link href={`/magaza/urunler?kategori=${p.category.parent.id}`} className="text-brand-600 hover:underline">
                        {p.category.parent.name}
                      </Link>
                      <span className="text-slate-400" aria-hidden="true">
                        ›
                      </span>
                    </>
                  )}
                  <Link href={`/magaza/urunler?kategori=${p.category.id}`} className="text-brand-600 hover:underline">
                    {p.category.name}
                  </Link>
                </nav>,
              ],
              ["Barkod", p.barcode ? <span className="font-mono">{p.barcode}</span> : "—"],
              ["Birim", `${UNIT_TYPE[p.unitType] ?? p.unitType}${p.unitAmount ? ` · ${fmtNumber(p.unitAmount)}` : ""}`],
            ]}
          />
          {p.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{p.description}</p>}
        </Section>
      </div>

      <h2 className="mt-8 mb-1 text-lg font-semibold text-slate-900">Fiyat karşılaştırma</h2>
      <p className="mb-3 text-sm text-slate-600">
        Fiyatlar asgari sipariş miktarı içindir; birim fiyata göre ucuzdan pahalıya sıralıdır. Kampanya fiyatı yalnızca tek (en avantajlı) indirim
        olarak uygulanır.
      </p>
      {offers.length === 0 ? (
        <EmptyState title="Bu ürün bölgenizde şu an satışta değil.">Teslimat ilçenize hizmet veren tedarikçi bu ürünü sunmuyor.</EmptyState>
      ) : (
        <Table head={["Tedarikçi", "Paket", "Fiyat (koli/paket)", "Birim fiyat", "Sipariş kuralı", "Teslimat", "Stok", ""]}>
          {offers.map((o) => {
            const cheapest = o.offerId === cheapestId;
            const discounted = o.finalPackPrice.lt(o.listPackPrice);
            const pack = packLabel(o.packType);
            return (
              <tr key={o.offerId} className={cheapest ? "bg-emerald-50/60" : undefined}>
                <Td>
                  <Link href={`/magaza/tedarikciler/${o.supplier.slug}`} className="font-semibold text-brand-700 hover:underline">
                    {o.supplier.name}
                  </Link>
                  {cheapest && (
                    <div className="mt-1">
                      <Badge tone="green">En uygun</Badge>
                    </div>
                  )}
                  {o.sku && <div className="mt-1 text-xs text-slate-500">Kod: {o.sku}</div>}
                </Td>
                <Td className="whitespace-nowrap">
                  {PACK_TYPE[o.packType] ?? o.packType}
                  {o.unitsPerPack > 1 && (
                    <div className="text-xs text-slate-500">
                      × {o.unitsPerPack} {unit}
                    </div>
                  )}
                </Td>
                <Td className="tabular-nums">
                  {discounted && <div className="text-xs text-slate-400 line-through">{fmtMoney(o.listPackPrice)}</div>}
                  <div className="font-semibold text-slate-900">{fmtMoney(o.finalPackPrice)}</div>
                  <div className="text-xs text-slate-500">KDV hariç · %{o.vatRate} KDV</div>
                  <div className="text-xs text-slate-700">KDV dahil {fmtMoney(o.finalPackPriceVat)}</div>
                  {o.campaignTitle && (
                    <div className="mt-1">
                      <Badge tone="amber">{o.campaignTitle}</Badge>
                    </div>
                  )}
                  {o.tiers.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900" aria-label="Kademeli fiyatlar (KDV hariç)">
                      {o.tiers.map((t, i) => (
                        <li key={i}>
                          {fmtNumber(t.minQty)}+ {pack}: {fmtMoney(t.packPrice)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {fmtMoney(o.unitPrice)} / {unit}
                  <div className="text-xs text-slate-500">KDV dahil {fmtMoney(o.unitPriceVat)}</div>
                </Td>
                <Td className="text-xs text-slate-700">
                  <div>
                    En az {fmtNumber(o.minOrderQty)} {pack}
                  </div>
                  {!o.orderStep.eq(1) && (
                    <div>
                      {fmtNumber(o.orderStep)} {pack} artışla
                    </div>
                  )}
                  {o.supplierMinAmount && <div className="mt-1 text-slate-500">Min. sipariş tutarı: {fmtMoney(o.supplierMinAmount)}</div>}
                </Td>
                <Td className="text-xs text-slate-700">{fmtDeliveryDays(o.deliveryDays)}</Td>
                <Td>
                  <StockBadge state={o.stock} />
                </Td>
                <Td>
                  {canCart && (
                    <AddToCart
                      offerId={o.offerId}
                      minOrderQty={o.minOrderQty.toString()}
                      orderStep={o.orderStep.toString()}
                      packLabel={pack}
                      outOfStock={o.stock === "out"}
                      label={`${p.name} — ${o.supplier.name}`}
                    />
                  )}
                  {o.inCart && (
                    <div className="mt-1 text-xs font-medium text-emerald-700">
                      Sepette: {fmtNumber(o.inCart)} {pack}{" "}
                      <Link href="/magaza/sepet" className="text-brand-600 hover:underline">
                        Sepete git
                      </Link>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
