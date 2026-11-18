import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  bestDiscount, discountedPackPrice, normalizeQuantity, priceLine, quantityRuleError, sumLines, tierTable, withVat, type DiscountTier,
} from "@/modules/pricing/engine";
import { formatOrderNumber } from "@/modules/orders/member";

const D = (v: string | number) => new Prisma.Decimal(v);
const tier = (kind: DiscountTier["kind"], value: string, minQty: string, campaignId = "c1"): DiscountTier => ({ kind, value: D(value), minQty: D(minQty), campaignId });

describe("fiyat motoru", () => {
  it("indirim türleri doğru hesaplanır", () => {
    expect(discountedPackPrice(D(480), tier("PERCENT", "10", "1")).toFixed(2)).toBe("432.00");
    expect(discountedPackPrice(D(480), tier("AMOUNT", "30", "1")).toFixed(2)).toBe("450.00");
    expect(discountedPackPrice(D(480), tier("FIXED_PRICE", "455", "1")).toFixed(2)).toBe("455.00");
    // Yuvarlama: kuruşa (yarım yukarı)
    expect(discountedPackPrice(D("99.99"), tier("PERCENT", "33", "1")).toFixed(2)).toBe("66.99");
    // Liste fiyatından yüksek sabit fiyat uygulanmaz, 0'ın altına düşmez
    expect(discountedPackPrice(D(100), tier("FIXED_PRICE", "150", "1")).toFixed(2)).toBe("100.00");
    expect(discountedPackPrice(D(100), tier("AMOUNT", "500", "1")).toFixed(2)).toBe("0.01");
  });

  it("kampanyalar üst üste binmez: miktara göre en avantajlı TEK indirim", () => {
    const input = {
      packPrice: D(480),
      vatRate: 10,
      discounts: [tier("PERCENT", "5", "1", "a"), tier("FIXED_PRICE", "440", "10", "b"), tier("AMOUNT", "20", "5", "c")],
    };
    expect(bestDiscount(input, D(1)).tier?.campaignId).toBe("a"); // 456
    expect(bestDiscount(input, D(5)).tier?.campaignId).toBe("a"); // 456 < 460
    expect(bestDiscount(input, D(10)).price.toFixed(2)).toBe("440.00");
    expect(bestDiscount({ ...input, discounts: [] }, D(3)).tier).toBeNull();
  });

  it("satır ve toplamlar: ara toplam, indirim, KDV, genel toplam", () => {
    const l = priceLine({ packPrice: D(480), vatRate: 10, discounts: [tier("FIXED_PRICE", "450", "3")] }, "4");
    expect(l.lineSubtotal.toFixed(2)).toBe("1920.00");
    expect(l.lineDiscount.toFixed(2)).toBe("120.00");
    expect(l.lineVat.toFixed(2)).toBe("180.00");
    expect(l.lineTotal.toFixed(2)).toBe("1980.00");
    const l2 = priceLine({ packPrice: D("12.35"), vatRate: 20, discounts: [] }, "3");
    const t = sumLines([l, l2]);
    expect(t.subtotal.toFixed(2)).toBe("1957.05");
    expect(t.grandTotal.toFixed(2)).toBe(t.subtotal.minus(t.discountTotal).plus(t.vatTotal).toFixed(2));
    expect(withVat(D(100), 20).toFixed(2)).toBe("120.00");
  });

  it("kademe tablosu miktara göre sıralı", () => {
    const t = tierTable({ packPrice: D(100), vatRate: 10, discounts: [tier("PERCENT", "10", "10"), tier("PERCENT", "5", "5")] });
    expect(t.map((x) => x.minQty.toString())).toEqual(["5", "10"]);
    expect(t[1].packPrice.toFixed(2)).toBe("90.00");
  });

  it("miktar kuralları: asgari, adım, tam sayı", () => {
    const o = { minOrderQty: D(2), orderStep: D(2), packType: "KOLI" };
    expect(quantityRuleError(o, D(1))).toMatch(/Asgari/);
    expect(quantityRuleError(o, D(3))).toMatch(/katları/);
    expect(quantityRuleError(o, D("2.5"))).toMatch(/tam sayı/);
    expect(quantityRuleError(o, D(4))).toBeNull();
    expect(quantityRuleError({ minOrderQty: D("0.5"), orderStep: D("0.5"), packType: "KG" }, D("1.5"))).toBeNull();
    expect(normalizeQuantity(o, D(3)).toString()).toBe("4");
    expect(normalizeQuantity(o, D(1)).toString()).toBe("2");
  });

  it("sipariş numarası biçimi", () => {
    expect(formatOrderNumber(2026, 123)).toBe("ET-2026-000123");
  });
});
