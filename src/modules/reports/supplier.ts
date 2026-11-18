import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/assert";
import { supplierIdOf } from "@/lib/auth/scope";
import { dateInput } from "@/lib/format";
import { TZ_OFFSET } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";

/**
 * Tedarikçi raporları. Yalnızca firmanın kendi siparişleri.
 * "Satış" = reddedilmemiş ve iptal edilmemiş siparişler (KDV dahil genel toplam).
 */

export type Granularity = "day" | "week" | "month";

export function parseRange(from?: string, to?: string) {
  const today = dateInput(new Date());
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const toStr = valid(to) ?? today;
  const fromStr = valid(from) ?? dateInput(new Date(Date.now() - 29 * 86400_000));
  return {
    fromStr,
    toStr,
    from: new Date(`${fromStr}T00:00:00${TZ_OFFSET}`),
    to: new Date(`${toStr}T23:59:59.999${TZ_OFFSET}`),
  };
}

export async function supplierReport(auth: AuthContext, f: { from?: string; to?: string; group?: string }) {
  assertPermission(auth, "supplierSelf.reports");
  const supplierId = supplierIdOf(auth);
  const r = parseRange(f.from, f.to);
  const unit: Granularity = f.group === "week" || f.group === "month" ? f.group : "day";
  const range = { gte: r.from, lte: r.to };
  const sold = { notIn: ["REJECTED", "CANCELLED"] as ("REJECTED" | "CANCELLED")[] };

  const [byStatus, totals, delivered, topProducts, topMembers, series] = await Promise.all([
    db.supplierOrder.groupBy({ by: ["status"], where: { supplierId, createdAt: range }, _count: true, _sum: { grandTotal: true } }),
    db.supplierOrder.aggregate({ where: { supplierId, createdAt: range, status: sold }, _count: true, _sum: { grandTotal: true, vatTotal: true, discountTotal: true } }),
    db.supplierOrder.aggregate({ where: { supplierId, createdAt: range, status: "DELIVERED" }, _count: true, _sum: { grandTotal: true } }),
    db.orderItem.groupBy({
      by: ["supplierProductId", "productName", "brandName", "packType"],
      where: { supplierOrder: { supplierId, createdAt: range, status: sold } },
      _sum: { quantity: true, lineTotal: true },
      _count: true,
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 10,
    }),
    db.$queryRaw<{ memberId: string; businessName: string; orders: bigint; total: Prisma.Decimal }[]>`
      SELECT o."memberId", m."businessName", COUNT(so.id) AS orders, SUM(so."grandTotal") AS total
      FROM "SupplierOrder" so
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "Member" m ON m.id = o."memberId"
      WHERE so."supplierId" = ${supplierId}
        AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY o."memberId", m."businessName"
      ORDER BY total DESC
      LIMIT 10`,
    db.$queryRaw<{ bucket: Date; orders: bigint; total: Prisma.Decimal | null }[]>`
      SELECT date_trunc(${unit}, so."createdAt" AT TIME ZONE 'Europe/Istanbul') AS bucket,
             COUNT(so.id) AS orders, SUM(so."grandTotal") AS total
      FROM "SupplierOrder" so
      WHERE so."supplierId" = ${supplierId}
        AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY bucket
      ORDER BY bucket`,
  ]);

  return {
    range: { from: r.fromStr, to: r.toStr },
    unit,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count, total: s._sum.grandTotal })),
    salesCount: totals._count,
    salesTotal: totals._sum.grandTotal ?? new Prisma.Decimal(0),
    vatTotal: totals._sum.vatTotal ?? new Prisma.Decimal(0),
    discountTotal: totals._sum.discountTotal ?? new Prisma.Decimal(0),
    deliveredCount: delivered._count,
    deliveredTotal: delivered._sum.grandTotal ?? new Prisma.Decimal(0),
    topProducts: topProducts.map((p) => ({
      supplierProductId: p.supplierProductId,
      productName: p.productName,
      brandName: p.brandName,
      packType: p.packType,
      lines: p._count,
      quantity: p._sum.quantity,
      total: p._sum.lineTotal,
    })),
    topMembers: topMembers.map((m) => ({ memberId: m.memberId, businessName: m.businessName, orders: Number(m.orders), total: m.total })),
    // date_trunc, İstanbul yerel saatini zaman dilimsiz döndürür; tarih etiketi için doğrudan kullanılır
    series: series.map((s) => ({ bucket: s.bucket.toISOString().slice(0, 10), orders: Number(s.orders), total: Number(s.total ?? 0) })),
  };
}
