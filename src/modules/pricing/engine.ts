import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Fiyat motoru — sepette, ürün sayfasında ve siparişte AYNI fonksiyon kullanılır.
 *
 * Kurallar:
 * - Liste fiyatı: teklifin KDV hariç paket fiyatı (SupplierProduct.packPrice).
 * - Kampanya: yalnızca Oda onaylı (APPROVED), tarihi geçerli, üyenin Odasına ait kampanyaların
 *   indirim kademeleri; kademe, sipariş miktarı minQty ve üzerindeyse uygulanır.
 * - Kampanyalar üst üste binmez: en düşük paket fiyatını veren TEK indirim uygulanır.
 * - Tüm hesaplar Decimal ile, kuruş (2 hane) yuvarlamasıyla yapılır; kayan nokta yok.
 */

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
type Tx = PrismaClient | Prisma.TransactionClient;

export interface DiscountTier {
  campaignId: string;
  campaignTitle?: string;
  kind: "FIXED_PRICE" | "PERCENT" | "AMOUNT";
  value: Dec;
  minQty: Dec;
}

export interface PriceInput {
  packPrice: Dec;
  vatRate: number;
  discounts: DiscountTier[];
}

export interface LinePrice {
  quantity: Dec;
  listPackPrice: Dec;
  finalPackPrice: Dec;
  campaignId: string | null;
  campaignTitle: string | null;
  vatRate: number;
  lineSubtotal: Dec;
  lineDiscount: Dec;
  lineVat: Dec;
  lineTotal: Dec;
}

const MIN_PRICE = new D("0.01");

export function round2(v: Dec): Dec {
  return v.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Tek kademenin paket fiyatına uygulanmış hali */
export function discountedPackPrice(packPrice: Dec, t: Pick<DiscountTier, "kind" | "value">): Dec {
  let p: Dec;
  if (t.kind === "FIXED_PRICE") p = t.value;
  else if (t.kind === "PERCENT") p = packPrice.mul(new D(100).minus(t.value)).div(100);
  else p = packPrice.minus(t.value);
  p = round2(p);
  if (p.lt(MIN_PRICE)) p = MIN_PRICE;
  return p.gt(packPrice) ? packPrice : p;
}

/** Miktara göre en avantajlı tek indirimi seçer */
export function bestDiscount(input: PriceInput, quantity: Dec): { price: Dec; tier: DiscountTier | null } {
  let best: { price: Dec; tier: DiscountTier | null } = { price: input.packPrice, tier: null };
  for (const t of input.discounts) {
    if (quantity.lt(t.minQty)) continue;
    const p = discountedPackPrice(input.packPrice, t);
    if (p.lt(best.price)) best = { price: p, tier: t };
  }
  return best;
}

export function priceLine(input: PriceInput, quantity: Dec | string | number): LinePrice {
  const q = new D(quantity);
  const { price, tier } = bestDiscount(input, q);
  const lineSubtotal = round2(input.packPrice.mul(q));
  const lineDiscount = round2(input.packPrice.minus(price).mul(q));
  const net = lineSubtotal.minus(lineDiscount);
  const lineVat = round2(net.mul(input.vatRate).div(100));
  return {
    quantity: q,
    listPackPrice: input.packPrice,
    finalPackPrice: price,
    campaignId: tier?.campaignId ?? null,
    campaignTitle: tier?.campaignTitle ?? null,
    vatRate: input.vatRate,
    lineSubtotal,
    lineDiscount,
    lineVat,
    lineTotal: net.plus(lineVat),
  };
}

export interface Totals {
  subtotal: Dec;
  discountTotal: Dec;
  vatTotal: Dec;
  grandTotal: Dec;
}

export function sumLines(lines: Pick<LinePrice, "lineSubtotal" | "lineDiscount" | "lineVat" | "lineTotal">[]): Totals {
  const z = new D(0);
  const t = { subtotal: z, discountTotal: z, vatTotal: z, grandTotal: z };
  for (const l of lines) {
    t.subtotal = t.subtotal.plus(l.lineSubtotal);
    t.discountTotal = t.discountTotal.plus(l.lineDiscount);
    t.vatTotal = t.vatTotal.plus(l.lineVat);
    t.grandTotal = t.grandTotal.plus(l.lineTotal);
  }
  return t;
}

/** KDV dahil gösterim fiyatı */
export function withVat(price: Dec, vatRate: number): Dec {
  return round2(price.mul(100 + vatRate).div(100));
}

/** Kademeleri miktara göre sıralı ve her kademenin fiyatıyla döndürür (ürün sayfası için) */
export function tierTable(input: PriceInput) {
  return [...input.discounts]
    .sort((a, b) => a.minQty.comparedTo(b.minQty))
    .map((t) => ({ minQty: t.minQty, packPrice: discountedPackPrice(input.packPrice, t), campaignId: t.campaignId, campaignTitle: t.campaignTitle ?? null }));
}

/** Prisma where: şu an geçerli, onaylı, belirtilen Odaya ait kampanya */
export function activeCampaignWhere(chamberId: string, now = new Date()): Prisma.CampaignWhereInput {
  return { chamberId, status: "APPROVED", startsAt: { lte: now }, endsAt: { gt: now } };
}

/** Teklifler için geçerli indirim kademelerini toplu yükler: supplierProductId → kademeler */
export async function loadActiveDiscounts(supplierProductIds: string[], chamberId: string, tx: Tx = db, now = new Date()) {
  const map = new Map<string, DiscountTier[]>();
  if (supplierProductIds.length === 0) return map;
  const rows = await tx.discount.findMany({
    where: { supplierProductId: { in: supplierProductIds }, campaign: activeCampaignWhere(chamberId, now) },
    include: { campaign: { select: { id: true, title: true } } },
  });
  for (const r of rows) {
    const list = map.get(r.supplierProductId) ?? [];
    list.push({ campaignId: r.campaignId, campaignTitle: r.campaign.title, kind: r.kind, value: r.value, minQty: r.minQty });
    map.set(r.supplierProductId, list);
  }
  return map;
}

/** Miktar kuralları: asgari miktar ve artış adımı. Hata mesajı döner veya null. */
export function quantityRuleError(o: { minOrderQty: Dec; orderStep: Dec; packType: string }, quantity: Dec): string | null {
  if (quantity.lte(0)) return "Miktar 0'dan büyük olmalıdır.";
  if (o.packType !== "KG" && !quantity.isInteger()) return "Bu ürün için miktar tam sayı olmalıdır.";
  if (quantity.lt(o.minOrderQty)) return `Asgari sipariş miktarı ${o.minOrderQty.toString()}.`;
  if (!quantity.mod(o.orderStep).isZero()) return `Miktar ${o.orderStep.toString()} ve katları olmalıdır.`;
  return null;
}

/** Kurallara uyan, istenen miktara en yakın (yukarı yuvarlanmış) miktar */
export function normalizeQuantity(o: { minOrderQty: Dec; orderStep: Dec }, quantity: Dec): Dec {
  let q = quantity.lt(o.minOrderQty) ? o.minOrderQty : quantity;
  const rem = q.mod(o.orderStep);
  if (!rem.isZero()) q = q.minus(rem).plus(o.orderStep);
  return q;
}
