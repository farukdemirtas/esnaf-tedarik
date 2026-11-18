import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { chamberIdOf, memberIdOf } from "@/lib/auth/scope";
import type { AuthContext } from "@/modules/auth/context";

/**
 * Üye görünürlük kuralı (tek yerde):
 * aktif ürün + aktif ve Oda tarafından kaldırılmamış teklif + onaylı tedarikçi (bu Odada aktif)
 * + üyenin varsayılan teslimat adresinin ilçesine hizmet veren tedarikçi.
 */

export interface ShopContext {
  memberId: string;
  chamberId: string;
  districtId: string | null;
  districtName: string | null;
  address: { id: string; title: string; districtId: string; districtName: string; city: string; neighborhood: string | null; line: string } | null;
}

export async function shopContext(auth: AuthContext): Promise<ShopContext> {
  const memberId = memberIdOf(auth);
  const chamberId = chamberIdOf(auth);
  const addr =
    (await db.address.findFirst({ where: { memberId, isDefault: true }, include: { district: true } })) ??
    (await db.address.findFirst({ where: { memberId }, include: { district: true }, orderBy: { id: "asc" } }));
  return {
    memberId,
    chamberId,
    districtId: addr?.districtId ?? null,
    districtName: addr?.district.name ?? null,
    address: addr
      ? { id: addr.id, title: addr.title, districtId: addr.districtId, districtName: addr.district.name, city: addr.district.city, neighborhood: addr.neighborhood, line: addr.line }
      : null,
  };
}

/** Tedarikçinin bu Odada ve ilçede hizmet verir durumda olması */
export function visibleSupplierWhere(chamberId: string, districtId: string | null): Prisma.SupplierWhereInput {
  return {
    status: "APPROVED",
    chambers: { some: { chamberId, active: true } },
    // Adresi olmayan üye hiçbir tedarikçiyi göremez (ilçe bilinmeden teslimat yapılamaz)
    deliveryAreas: { some: { districtId: districtId ?? "__adres-yok__" } },
  };
}

export function visibleOfferWhere(ctx: Pick<ShopContext, "chamberId" | "districtId">): Prisma.SupplierProductWhereInput {
  return {
    active: true,
    removedByAdmin: false,
    product: { status: "ACTIVE", chamberId: ctx.chamberId },
    supplier: visibleSupplierWhere(ctx.chamberId, ctx.districtId),
  };
}
