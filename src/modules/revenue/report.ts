import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import type { AuthContext } from "@/modules/auth/context";
import { parseRange } from "@/modules/reports/supplier";

/** Gelir modeli raporu: paket gelirleri, reklam ve sponsorlu ürün ücretleri, banner performansı (yalnızca kayıt; tahsilat platform dışında). */
export async function revenueReport(auth: AuthContext, f: { from?: string; to?: string }) {
  assertPermission(auth, "ads.manage");
  const chamberId = chamberIdOf(auth);
  const r = parseRange(f.from, f.to);
  const range = { gte: r.from, lte: r.to };
  const [subs, adFees, sponsoredFees, ads, activeSubs] = await Promise.all([
    db.supplierSubscription.aggregate({ where: { package: { chamberId }, status: { in: ["ACTIVE", "EXPIRED"] }, startsAt: range }, _sum: { pricePaid: true }, _count: true }),
    db.advertisement.aggregate({ where: { slot: { chamberId }, status: { in: ["APPROVED", "ENDED"] }, startsAt: range }, _sum: { fee: true }, _count: true }),
    db.sponsoredProduct.aggregate({ where: { supplierProduct: { product: { chamberId } }, startsAt: range }, _sum: { fee: true }, _count: true }),
    db.advertisement.findMany({
      where: { slot: { chamberId }, status: { in: ["APPROVED", "ENDED"] }, startsAt: { lte: r.to }, endsAt: { gte: r.from } },
      orderBy: { impressions: "desc" },
      take: 20,
      select: { id: true, title: true, impressions: true, clicks: true, startsAt: true, endsAt: true, status: true, supplier: { select: { tradeName: true } }, slot: { select: { name: true } } },
    }),
    db.supplierSubscription.count({ where: { package: { chamberId }, status: "ACTIVE", endsAt: { gt: new Date() } } }),
  ]);
  const Z = new Prisma.Decimal(0);
  const packageRevenue = subs._sum.pricePaid ?? Z;
  const adRevenue = adFees._sum.fee ?? Z;
  const sponsoredRevenue = sponsoredFees._sum.fee ?? Z;
  return {
    range: { from: r.fromStr, to: r.toStr },
    packageRevenue, packageCount: subs._count,
    adRevenue, adCount: adFees._count,
    sponsoredRevenue, sponsoredCount: sponsoredFees._count,
    total: packageRevenue.plus(adRevenue).plus(sponsoredRevenue),
    activeSubs,
    ads: ads.map((a) => ({ ...a, ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0 })),
  };
}
