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
import { Badge, EmptyState, PageHeader, Section, Table, Td } from "@/components/panel/ui";
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

function TotalsList({ totals, className = "" }: { totals: TotalsView; className?: string }) {
  const discount = Number(totals.discountTotal.toString());
  return (
    <dl className={`space-y-1.5 text-sm ${className}`}>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-600">Ara toplam (KDV hariç)</dt>
        <dd className="tabular-nums">{fmtMoney(totals.subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-600">İndirim</dt>
        <dd className="tabular-nums text-emerald-700">{discount > 0 ? `−${fmtMoney(totals.discountTotal)}` : fmtMoney(0)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-600">KDV</dt>
        <dd className="tabular-nums">{fmtMoney(totals.vatTotal)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold">
        <dt>Genel toplam (KDV dahil)</dt>
        <dd className="tabular-nums">{fmtMoney(totals.grandTotal)}</dd>
      </div>
    </dl>
  );
}

function LineRow({ line }: { line: CartLine }) {
  const { offer, price } = line;
  const discounted = !price.finalPackPrice.eq(price.listPackPrice);
  const rules: string[] = [];
  if (!offer.minOrderQty.eq(1)) rules.push(`en az ${fmtNumber(offer.minOrderQty)}`);
  if (!offer.orderStep.eq(1)) rules.push(`artış: ${fmtNumber(offer.orderStep)}`);
  const issues = [!line.available ? "Bölgenizde artık satışta değil." : null, line.quantityError, line.stockError].filter(
    (x): x is string => Boolean(x),
  );

  return (
    <tr className={line.blocking ? "bg-red-50/50" : undefined}>
      <Td>
        <Link href={`/magaza/urun/${offer.productId}`} className="font-medium text-brand-700 hover:underline">
          {offer.product.name}
        </Link>
        <div className="text-xs text-slate-500">{offer.product.brand.name}</div>
        {price.campaignId && (
          <div className="mt-1">
            <Badge tone="green">{price.campaignTitle ?? "Kampanya"}</Badge>
          </div>
        )}
        {issues.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs font-medium text-red-700" role="alert">
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {line.priceChanged && (
          <p className="mt-1 text-xs font-medium text-amber-800">
            Fiyat değişti: eski {fmtMoney(line.seenPackPrice)} → yeni {fmtMoney(price.finalPackPrice)}
          </p>
        )}
      </Td>
      <Td className="whitespace-nowrap">{packLabel(offer.packType, offer.unitsPerPack)}</Td>
      <Td>
        <ActionForm action={setCartQuantityAction} compact className="min-w-[8rem]">
          <input type="hidden" name="id" value={line.itemId} />
          <div className="flex items-center gap-1.5">
            <label htmlFor={`q-${line.itemId}`} className="sr-only">
              {offer.product.name} miktarı
            </label>
            <input
              id={`q-${line.itemId}`}
              name="quantity"
              inputMode="decimal"
              defaultValue={line.quantity.toString()}
              className="input w-20 px-2 py-1.5 text-right tabular-nums"
              required
            />
            <SubmitButton variant="small">Güncelle</SubmitButton>
          </div>
          {rules.length > 0 && <p className="mt-1 text-xs text-slate-500">{rules.join(", ")}</p>}
        </ActionForm>
      </Td>
      <Td className="whitespace-nowrap tabular-nums">
        {discounted ? <span className="text-slate-400 line-through">{fmtMoney(price.listPackPrice)}</span> : fmtMoney(price.listPackPrice)}
      </Td>
      <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(price.finalPackPrice)}</Td>
      <Td className="whitespace-nowrap tabular-nums">
        <div>{fmtMoney(price.lineSubtotal.minus(price.lineDiscount))}</div>
        <div className="text-xs text-slate-500">KDV dahil {fmtMoney(price.lineTotal)}</div>
        <div className="text-xs text-slate-400">%{price.vatRate} KDV</div>
      </Td>
      <Td>
        <ActionForm action={removeCartItemAction} compact>
          <input type="hidden" name="id" value={line.itemId} />
          <SubmitButton variant="small-danger">Çıkar</SubmitButton>
        </ActionForm>
      </Td>
    </tr>
  );
}

function GroupSection({ group }: { group: CartGroup }) {
  const days = deliveryDaysText(group.deliveryDays);
  const missing = group.minAmount.minus(group.netAmount);
  return (
    <section className="space-y-3" aria-labelledby={`g-${group.supplier.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`g-${group.supplier.id}`} className="text-lg font-semibold text-slate-900">
            <Link href={`/magaza/tedarikciler/${group.supplier.slug}`} className="hover:underline">
              {group.supplier.tradeName}
            </Link>
          </h2>
          <p className="text-sm text-slate-600">
            Teslimat günleri: {days ?? "belirtilmemiş"}
            {group.minAmount.gt(0) && <> · Asgari sipariş {fmtMoney(group.minAmount)} (KDV hariç)</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {group.orderable ? <Badge tone="green">Sipariş verilebilir</Badge> : <Badge tone="amber">Sipariş verilemez</Badge>}
          <ActionForm action={clearCartAction} compact confirm={`${group.supplier.tradeName} ürünlerinin tümü sepetten çıkarılsın mı?`}>
            <input type="hidden" name="supplierId" value={group.supplier.id} />
            <SubmitButton variant="small-danger">Bu tedarikçiyi boşalt</SubmitButton>
          </ActionForm>
        </div>
      </div>

      {!group.meetsMin && (
        <Alert tone="warning">
          Asgari sipariş tutarı {fmtMoney(group.minAmount)} (KDV hariç); {fmtMoney(missing)} daha ekleyin. Bu tedarikçinin ürünleri sepette kalır, diğerleri
          sipariş edilir.
        </Alert>
      )}
      {group.hasBlocking && (
        <Alert tone="error">Bu tedarikçideki bazı ürünlerde sorun var (kırmızı ile gösterildi). Miktarı düzeltin veya ürünü çıkarın.</Alert>
      )}

      <Table head={["Ürün", "Paket", "Miktar", "Liste fiyatı", "Uygulanan fiyat", "Tutar", ""]}>
        {group.lines.map((l) => (
          <LineRow key={l.itemId} line={l} />
        ))}
      </Table>

      <div className="card ml-auto max-w-sm p-4">
        <TotalsList totals={group.totals} />
      </div>
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

  if (cart.groups.length === 0) {
    return (
      <>
        <PageHeader title="Sepetim" />
        <EmptyState title="Sepetiniz boş.">
          <Link href="/magaza/urunler" className="font-semibold text-brand-600 hover:underline">
            Ürünlere göz atın
          </Link>{" "}
          ve sipariş vermek istediklerinizi sepete ekleyin.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sepetim"
        description="Ürünler tedarikçiye göre gruplanır; her tedarikçiye ayrı sipariş gider. Fiyatlar KDV hariçtir, toplamlarda KDV dahil tutar da gösterilir."
        actions={
          <ActionForm action={clearCartAction} compact confirm="Sepetteki tüm ürünler çıkarılsın mı?">
            <SubmitButton variant="small-danger">Sepeti boşalt</SubmitButton>
          </ActionForm>
        }
      />

      <div className="mb-6 space-y-3">
        {cart.hasPriceChange && (
          <Alert tone="warning">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Sepetinizdeki bazı ürünlerin fiyatı, sepete eklediğinizden bu yana değişti. Sipariş vermeden önce güncel fiyatları onaylayın.</span>
              <ActionForm action={acceptCartPricesAction} compact>
                <SubmitButton variant="small">Güncel fiyatları onayla</SubmitButton>
              </ActionForm>
            </div>
          </Alert>
        )}
        {dues.orderingBlocked && (
          <Alert tone="warning">
            Vadesi geçmiş {dues.overdueCount} aidat kaydınız bulunduğu için şu an sipariş veremezsiniz. Sepetiniz korunur; aidat durumunuz için Oda ile
            iletişime geçin.
          </Alert>
        )}
      </div>

      <div className="space-y-10">
        {cart.groups.map((g) => (
          <GroupSection key={g.supplier.id} group={g} />
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Section title="Sepet toplamı" className="lg:order-2">
          <TotalsList totals={cart.totals} />
          <p className="mt-3 text-xs text-slate-500">Tüm tedarikçiler dahil. Ödeme platform dışında, tedarikçiyle aranızda yapılır.</p>
        </Section>

        <Section title="Siparişi tamamla" className="lg:order-1 lg:col-span-2">
          {!canOrder ? (
            <p className="text-sm text-slate-600">Sipariş verme yetkiniz yok. İşletme yetkilinizle görüşün.</p>
          ) : dues.orderingBlocked ? (
            <p className="text-sm text-slate-600">Aidat borcu nedeniyle sipariş verme kapalı.</p>
          ) : addresses.length === 0 ? (
            <Alert tone="warning">
              Kayıtlı teslimat adresiniz yok.{" "}
              <Link href="/magaza/hesabim" className="font-semibold underline">
                Hesabım
              </Link>{" "}
              sayfasından adres ekleyin.
            </Alert>
          ) : cart.hasPriceChange ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">Sipariş vermeden önce değişen fiyatları onaylamanız gerekiyor.</p>
              <ActionForm action={acceptCartPricesAction} compact>
                <SubmitButton variant="secondary">Güncel fiyatları onayla</SubmitButton>
              </ActionForm>
            </div>
          ) : orderable.length === 0 ? (
            <p className="text-sm text-slate-700">
              Şu an sipariş verilebilecek tedarikçi grubu yok. Asgari tutarı tamamlayın veya kırmızı ile işaretli sorunları giderin.
            </p>
          ) : (
            <ActionForm
              action={placeOrderAction}
              confirm={`Seçili tedarikçilere sipariş verilsin mi? Toplam (KDV dahil): ${fmtMoney(cart.orderableTotals.grandTotal)}`}
              className="space-y-5"
            >
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <input type="hidden" name="supplierSelection" value="1" />

              <fieldset>
                <legend className="label">Sipariş verilecek tedarikçiler</legend>
                <div className="mt-1 space-y-2">
                  {orderable.map((g) => (
                    <label key={g.supplier.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm text-slate-800">
                      <input type="checkbox" name="supplierIds" value={g.supplier.id} defaultChecked className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-brand-600" />
                      <span className="flex-1">
                        <span className="font-medium">{g.supplier.tradeName}</span>
                        <span className="block text-xs text-slate-500">
                          {g.lines.length} ürün · {fmtMoney(g.netAmount)} KDV hariç · {fmtMoney(g.totals.grandTotal)} KDV dahil
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {cart.groups.length > orderable.length && (
                  <p className="mt-2 text-xs text-slate-500">
                    Asgari tutarı karşılanmayan veya sorunlu ürünü olan {cart.groups.length - orderable.length} tedarikçinin ürünleri sepette kalır.
                  </p>
                )}
              </fieldset>

              <SelectField
                name="addressId"
                label="Teslimat adresi"
                required
                defaultValue={cart.ctx.address?.id ?? addresses[0].id}
                options={addresses.map((a) => ({
                  value: a.id,
                  label: `${a.title} — ${[a.neighborhood, a.line].filter(Boolean).join(", ")}, ${a.district.name}/${a.district.city}${a.isDefault ? " (varsayılan)" : ""}`,
                }))}
                hint="Ürünlerin satış durumu teslimat adresinin ilçesine göre kontrol edilir."
              />

              <TextareaField name="note" label="Sipariş notu" maxLength={500} rows={3} placeholder="Örn. sabah 10'dan önce teslim edilsin" hint="İsteğe bağlı; tedarikçilere iletilir." />

              <div className="rounded-lg bg-slate-50 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Sipariş edilecek tutar (seçili tüm tedarikçiler)</div>
                <TotalsList totals={cart.orderableTotals} />
              </div>

              <SubmitButton className="w-full sm:w-auto">Siparişi ver</SubmitButton>
            </ActionForm>
          )}
        </Section>
      </div>
    </>
  );
}
