import { Prisma, type SupplierOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import type { AuthContext } from "@/modules/auth/context";
import { parseRange, type Granularity } from "./supplier";

/**
 * Oda raporları: tüm tedarikçi ve üyelerin siparişleri (yalnızca bu Odanın).
 * "Satış" = reddedilmemiş ve iptal edilmemiş alt siparişler; tutarlar KDV dahil genel toplam.
 */

const ZERO = new Prisma.Decimal(0);

export async function chamberReport(auth: AuthContext, f: { from?: string; to?: string; group?: string }) {
  assertPermission(auth, "report.view");
  const chamberId = chamberIdOf(auth);
  const r = parseRange(f.from, f.to);
  const unit: Granularity = f.group === "week" || f.group === "month" ? f.group : "day";
  const range = { gte: r.from, lte: r.to };

  const [byStatus, totals, orderCount, orderingMembers, activeMembers, topSuppliers, topMembers, topProducts, topCategories, series, campaignLines] = await Promise.all([
    // Not: Prisma groupBy/aggregate, ilişki filtresinde aynı adlı sütunlar (grandTotal) yüzünden belirsizlik hatası verdiği için SQL
    db.$queryRaw<{ status: SupplierOrderStatus; count: bigint; total: Prisma.Decimal | null }[]>`
      SELECT so.status, COUNT(so.id) AS count, SUM(so."grandTotal") AS total
      FROM "SupplierOrder" so JOIN "Order" o ON o.id = so."orderId"
      WHERE o."chamberId" = ${chamberId} AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY so.status`,
    db.$queryRaw<{ count: bigint; grand: Prisma.Decimal | null; sub: Prisma.Decimal | null; disc: Prisma.Decimal | null; vat: Prisma.Decimal | null }[]>`
      SELECT COUNT(so.id) AS count, SUM(so."grandTotal") AS grand, SUM(so.subtotal) AS sub, SUM(so."discountTotal") AS disc, SUM(so."vatTotal") AS vat
      FROM "SupplierOrder" so JOIN "Order" o ON o.id = so."orderId"
      WHERE o."chamberId" = ${chamberId} AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}`.then((x) => x[0]),
    db.order.count({ where: { chamberId, createdAt: range } }),
    db.order.groupBy({ by: ["memberId"], where: { chamberId, createdAt: range } }).then((g) => g.length),
    db.member.count({ where: { chamberId, status: "ACTIVE" } }),
    db.$queryRaw<{ supplierId: string; tradeName: string; orders: bigint; total: Prisma.Decimal }[]>`
      SELECT s.id AS "supplierId", s."tradeName", COUNT(so.id) AS orders, SUM(so."grandTotal") AS total
      FROM "SupplierOrder" so
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "Supplier" s ON s.id = so."supplierId"
      WHERE o."chamberId" = ${chamberId} AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY s.id, s."tradeName" ORDER BY total DESC LIMIT 10`,
    db.$queryRaw<{ memberId: string; businessName: string; orders: bigint; total: Prisma.Decimal }[]>`
      SELECT m.id AS "memberId", m."businessName", COUNT(DISTINCT o.id) AS orders, SUM(so."grandTotal") AS total
      FROM "SupplierOrder" so
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "Member" m ON m.id = o."memberId"
      WHERE o."chamberId" = ${chamberId} AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY m.id, m."businessName" ORDER BY total DESC LIMIT 10`,
    db.$queryRaw<{ productId: string; name: string; brand: string; lines: bigint; total: Prisma.Decimal }[]>`
      SELECT p.id AS "productId", p.name, b.name AS brand, COUNT(oi.id) AS lines, SUM(oi."lineTotal") AS total
      FROM "OrderItem" oi
      JOIN "SupplierOrder" so ON so.id = oi."supplierOrderId"
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "SupplierProduct" sp ON sp.id = oi."supplierProductId"
      JOIN "Product" p ON p.id = sp."productId"
      JOIN "Brand" b ON b.id = p."brandId"
      WHERE o."chamberId" = ${chamberId} AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY p.id, p.name, b.name ORDER BY total DESC LIMIT 10`,
    db.$queryRaw<{ categoryId: string; name: string; total: Prisma.Decimal }[]>`
      SELECT COALESCE(parent.id, c.id) AS "categoryId", COALESCE(parent.name, c.name) AS name, SUM(oi."lineTotal") AS total
      FROM "OrderItem" oi
      JOIN "SupplierOrder" so ON so.id = oi."supplierOrderId"
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "SupplierProduct" sp ON sp.id = oi."supplierProductId"
      JOIN "Product" p ON p.id = sp."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Category" parent ON parent.id = c."parentId"
      WHERE o."chamberId" = ${chamberId} AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY 1, 2 ORDER BY total DESC LIMIT 10`,
    db.$queryRaw<{ bucket: Date; orders: bigint; total: Prisma.Decimal | null }[]>`
      SELECT date_trunc(${unit}, so."createdAt" AT TIME ZONE 'Europe/Istanbul') AS bucket,
             COUNT(so.id) AS orders, SUM(so."grandTotal") AS total
      FROM "SupplierOrder" so
      JOIN "Order" o ON o.id = so."orderId"
      WHERE o."chamberId" = ${chamberId} AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}
      GROUP BY bucket ORDER BY bucket`,
    db.$queryRaw<{ count: bigint; disc: Prisma.Decimal | null }[]>`
      SELECT COUNT(oi.id) AS count, SUM(oi."lineDiscount") AS disc
      FROM "OrderItem" oi JOIN "SupplierOrder" so ON so.id = oi."supplierOrderId" JOIN "Order" o ON o.id = so."orderId"
      WHERE o."chamberId" = ${chamberId} AND oi."campaignId" IS NOT NULL AND so.status NOT IN ('REJECTED', 'CANCELLED')
        AND so."createdAt" BETWEEN ${r.from} AND ${r.to}`.then((x) => x[0]),
  ]);

  return {
    range: { from: r.fromStr, to: r.toStr },
    unit,
    orderCount,
    orderingMembers,
    activeMembers,
    salesCount: Number(totals.count),
    salesTotal: totals.grand ?? ZERO,
    netTotal: (totals.sub ?? ZERO).minus(totals.disc ?? ZERO),
    discountTotal: totals.disc ?? ZERO,
    vatTotal: totals.vat ?? ZERO,
    campaignLineCount: Number(campaignLines.count),
    campaignDiscount: campaignLines.disc ?? ZERO,
    byStatus: byStatus.map((s) => ({ status: s.status, count: Number(s.count), total: s.total ?? ZERO })),
    topSuppliers: topSuppliers.map((s) => ({ ...s, orders: Number(s.orders) })),
    topMembers: topMembers.map((m) => ({ ...m, orders: Number(m.orders) })),
    topProducts: topProducts.map((p) => ({ ...p, lines: Number(p.lines) })),
    topCategories,
    series: series.map((s) => ({ bucket: s.bucket.toISOString().slice(0, 10), orders: Number(s.orders), total: Number(s.total ?? 0) })),
  };
}
