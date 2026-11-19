import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import {
  acceptCartPricesAction,
  clearCartAction,
  placeOrderAction,
  removeCartItemAction,
  setCartQuantityAction,
} from "@/actions/member";
import { Alert } from "@/components/brand";
import { ActionForm, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/panel/ui";
import { ProductImage } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { db } from "@/lib/db";
import { fmtMoney, fmtNumber, PACK_TYPE } from "@/lib/format";
import { getCart, type CartGroup, type CartLine } from "@/modules/shop/cart";

export const metadata: Metadata = { title: "Sepetim" };

const DAY_NAMES = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

type Money = { toString(): string };
type TotalsView = { subtotal: Money; discountTotal: Money; vatTotal: Money; grandTotal: Money };

function deliveryDaysText(days: number[]) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).filter(Boolean);
  return names.length ? names.join(", ") : null;
}

function packLabel(packType: string, unitsPerPack: number) {
  return `${PACK_TYPE[packType] ?? packType}${unitsPerPack > 1 ? ` × ${unitsPerPack}` : ""}`;
}

function SummaryRows({ totals }: { totals: TotalsView }) {
  const discount = Number(totals.discountTotal.toString());
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-4 text-slate-600">
        <dt>Ara toplam</dt>
        <dd className="tabular-nums text-slate-900">{fmtMoney(totals.subtotal)}</dd>
      </div>
      {discount > 0 && (
        <div className="flex justify-between gap-4 text-emerald-700">
          <dt>İndirim</dt>
          <dd className="tabular-nums">−{fmtMoney(totals.discountTotal)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 text-slate-600">
        <dt>KDV</dt>
        <dd className="tabular-nums text-slate-900">{fmtMoney(totals.vatTotal)}</dd>
      </div>
    </dl>
  );
}

function CartLineCard({ line }: { line: CartLine }) {
  const { offer, price } = line;
  const image = offer.product.images[0]?.path ?? null;
  const discounted = !price.finalPackPrice.eq(price.listPackPrice);
  const rules: string[] = [];
  if (!offer.minOrderQty.eq(1)) rules.push(`en az ${fmtNumber(offer.minOrderQty)}`);
  if (!offer.orderStep.eq(1)) rules.push(`${fmtNumber(offer.orderStep)} adet artış`);
  const issues = [!line.available ? "Bölgenizde artık satışta değil." : null, line.quantityError, line.stockError].filter(
    (x): x is string => Boolean(x),
  );

  return (
    <li className={`flex gap-3 px-4 py-4 sm:gap-4 sm:px-5 ${line.blocking ? "bg-red-50/70" : ""}`}>
      <Link href={`/magaza/urun/${offer.productId}`} aria-label={offer.product.name} className="shrink-0 overflow-hidden rounded-xl border border-slate-100">
        <ProductImage path={image} alt="" className="h-20 w-20 sm:h-24 sm:w-24" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/magaza/urun/${offer.productId}`} className="line-clamp-2 text-sm font-semibold text-brand-950 hover:text-brand-700">
              {offer.product.name}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500">
              {offer.product.brand.name} · {packLabel(offer.packType, offer.unitsPerPack)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-brand-950">{fmtMoney(price.lineTotal)}</div>
            <div className="text-[11px] text-slate-500">KDV dahil</div>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
          <span className="font-medium tabular-nums text-slate-700">{fmtMoney(price.finalPackPrice)} / koli</span>
          {discounted && <span className="tabular-nums line-through">{fmtMoney(price.listPackPrice)}</span>}
          {price.campaignTitle && <span className="font-medium text-amber-700">{price.campaignTitle}</span>}
        </div>

        {line.priceChanged && (
          <p className="mt-1 text-xs font-medium text-amber-800">
            Fiyat değişti: {fmtMoney(line.seenPackPrice)} → {fmtMoney(price.finalPackPrice)}
          </p>
        )}
        {issues.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs font-medium text-red-700" role="alert">
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionForm action={setCartQuantityAction} compact className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={line.itemId} />
            <label htmlFor={`q-${line.itemId}`} className="sr-only">
              {offer.product.name} miktarı
            </label>
            <input
              id={`q-${line.itemId}`}
              name="quantity"
              inputMode="decimal"
              defaultValue={line.quantity.toString()}
              className="input w-16 px-2 py-1.5 text-center text-sm tabular-nums"
              required
            />
            <SubmitButton variant="small">Güncelle</SubmitButton>
          </ActionForm>
          {rules.length > 0 && <span className="text-xs text-slate-500">{rules.join(" · ")}</span>}
          <ActionForm action={removeCartItemAction} compact className="ml-auto">
            <input type="hidden" name="id" value={line.itemId} />
            <SubmitButton variant="small">Kaldır</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </li>
  );
}

function SupplierCard({ group }: { group: CartGroup }) {
  const days = deliveryDaysText(group.deliveryDays);
  const missing = group.minAmount.minus(group.netAmount);
  return (
    <section className="card overflow-hidden" aria-labelledby={`g-${group.supplier.id}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id={`g-${group.supplier.id}`} className="truncate text-base font-semibold text-brand-950">
            <Link href={`/magaza/tedarikciler/${group.supplier.slug}`} className="hover:text-brand-700">
              {group.supplier.tradeName}
            </Link>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {group.lines.length} ürün
            {days ? ` · Teslimat: ${days}` : ""}
          </p>
        </div>
        <ActionForm action={clearCartAction} compact confirm={`${group.supplier.tradeName} ürünleri sepetten çıkarılsın mı?`}>
          <input type="hidden" name="supplierId" value={group.supplier.id} />
          <SubmitButton variant="small">Grubu sil</SubmitButton>
        </ActionForm>
      </div>
      {!group.meetsMin && (
        <p className="bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-5">
          Bu tedarikçi için en az {fmtMoney(group.minAmount)} gerekiyor. {fmtMoney(missing)} daha ekleyin.
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {group.lines.map((line) => (
          <CartLineCard key={line.itemId} line={line} />
        ))}
      </ul>
    </section>
  );
}

export default async function CartPage() {
  const { auth, memberId, can } = await requireMemberPage("memberSelf.cart");
  const [cart, addresses] = await Promise.all([
    getCart(auth),
    db.address.findMany({ where: { memberId }, include: { district: true }, orderBy: [{ isDefault: "desc" }, { title: "asc" }] }),
  ]);
  const dues = auth.member!.dues;
  const canOrder = can("memberSelf.order");
  const orderable = cart.groups.filter((g) => g.orderable);
  const idempotencyKey = randomUUID();
  const itemCount = cart.groups.reduce((n, g) => n + g.lines.length, 0);

  if (cart.groups.length === 0) {
    return (
      <>
        <PageHeader title="Sepet" />
        <EmptyState title="Sepetiniz boş.">
          <Link href="/magaza/urunler" className="font-semibold text-brand-700 hover:underline">
            Ürünlere göz atın
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sepet"
        description={`${itemCount} ürün`}
        actions={
          <ActionForm action={clearCartAction} compact confirm="Sepetteki tüm ürünler çıkarılsın mı?">
            <SubmitButton variant="small">Sepeti boşalt</SubmitButton>
          </ActionForm>
        }
      />

      {cart.hasPriceChange && (
        <div className="mb-4">
          <Alert tone="warning">Bazı fiyatlar sepete eklediğinizden beri değişti. Siparişten önce güncel fiyatı onaylayın.</Alert>
        </div>
      )}
      {dues.orderingBlocked && (
        <div className="mb-4">
          <Alert tone="warning">Vadesi geçmiş {dues.overdueCount} aidat kaydınız olduğu için şu an sipariş veremezsiniz. Sepetiniz duruyor.</Alert>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {cart.groups.map((group) => (
            <SupplierCard key={group.supplier.id} group={group} />
          ))}
          <Link href="/magaza/urunler" className="inline-block text-sm font-semibold text-brand-700 hover:underline">
            Alışverişe devam et
          </Link>
        </div>

        <aside className="card sticky top-24 p-5">
          <h2 className="font-display text-lg font-semibold text-brand-950">Sipariş özeti</h2>
          <div className="mt-4">
            <SummaryRows totals={orderable.length > 0 ? cart.orderableTotals : cart.totals} />
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
            <span className="text-sm font-semibold text-slate-700">Toplam</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-brand-800">
              {fmtMoney(orderable.length > 0 ? cart.orderableTotals.grandTotal : cart.totals.grandTotal)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">KDV dahil. Ödeme tedarikçiyle aranızda yapılır.</p>

          <div className="mt-5">
            {!canOrder ? (
              <p className="text-sm text-slate-600">Sipariş verme yetkiniz yok.</p>
            ) : dues.orderingBlocked ? (
              <p className="text-sm text-slate-600">Aidat borcu nedeniyle sipariş kapalı.</p>
            ) : addresses.length === 0 ? (
              <Alert tone="warning">
                Teslimat adresi yok.{" "}
                <Link href="/magaza/hesabim" className="font-semibold underline">
                  Hesabımdan ekleyin
                </Link>
                .
              </Alert>
            ) : cart.hasPriceChange ? (
              <ActionForm action={acceptCartPricesAction}>
                <SubmitButton className="w-full">Güncel fiyatları onayla</SubmitButton>
              </ActionForm>
            ) : orderable.length === 0 ? (
              <p className="text-sm text-slate-600">Asgari tutarı tamamlayın veya işaretli ürün sorunlarını giderin.</p>
            ) : (
              <ActionForm
                action={placeOrderAction}
                confirm={`Sipariş verilsin mi? Toplam: ${fmtMoney(cart.orderableTotals.grandTotal)}`}
                className="space-y-4"
              >
                <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                <input type="hidden" name="supplierSelection" value="1" />
                {orderable.length === 1 ? (
                  <input type="hidden" name="supplierIds" value={orderable[0].supplier.id} />
                ) : (
                  <fieldset>
                    <legend className="label">Tedarikçiler</legend>
                    <div className="mt-1 space-y-2">
                      {orderable.map((g) => (
                        <label key={g.supplier.id} className="flex cursor-pointer items-start gap-2 text-sm">
                          <input type="checkbox" name="supplierIds" value={g.supplier.id} defaultChecked className="mt-0.5 h-4 w-4 rounded accent-brand-700" />
                          <span>
                            <span className="font-medium text-slate-900">{g.supplier.tradeName}</span>
                            <span className="block text-xs text-slate-500">{fmtMoney(g.totals.grandTotal)}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <SelectField
                  name="addressId"
                  label="Teslimat adresi"
                  required
                  defaultValue={cart.ctx.address?.id ?? addresses[0].id}
                  options={addresses.map((a) => ({
                    value: a.id,
                    label: `${a.title} — ${a.district.name}${a.isDefault ? " (varsayılan)" : ""}`,
                  }))}
                />
                <TextareaField name="note" label="Not" maxLength={500} rows={2} placeholder="İsteğe bağlı" />
                {cart.groups.length > orderable.length && (
                  <p className="text-xs text-slate-500">Tutarı yetmeyen tedarikçilerin ürünleri sepette kalır.</p>
                )}
                <SubmitButton className="w-full">Siparişi ver</SubmitButton>
              </ActionForm>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
