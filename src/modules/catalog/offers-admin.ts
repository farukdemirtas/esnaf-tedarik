import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { pageArgs, z, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifySupplier } from "@/modules/notifications/service";

/** Oda'nın tüm tedarikçi tekliflerini (fiyat/stok ilanları) denetlemesi */

export async function listOffers(auth: AuthContext, f: { q?: string; supplierId?: string; state?: string; page?: string }) {
  assertPermission(auth, "offer.view");
  const chamberId = chamberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page);
  const q = f.q?.trim();
  const where: Prisma.SupplierProductWhereInput = {
    product: { chamberId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] } : {}) },
    supplier: { chambers: { some: { chamberId } } },
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(f.state === "removed" ? { removedByAdmin: true } : {}),
    ...(f.state === "active" ? { removedByAdmin: false, active: true } : {}),
    ...(f.state === "inactive" ? { removedByAdmin: false, active: false } : {}),
  };
  const [items, total] = await Promise.all([
    db.supplierProduct.findMany({
      where,
      orderBy: [{ product: { name: "asc" } }, { packPrice: "asc" }],
      skip,
      take,
      include: { product: { include: { brand: true } }, supplier: { select: { id: true, tradeName: true } }, stock: true },
    }),
    db.supplierProduct.count({ where }),
  ]);
  return { items, total, page, size };
}

async function findOffer(auth: AuthContext, id: string) {
  const o = await db.supplierProduct.findFirst({
    where: { id, product: { chamberId: chamberIdOf(auth) } },
    include: { product: true },
  });
  if (!o) throw new NotFoundError("Teklif bulunamadı.");
  return o;
}

export async function removeOffer(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "offer.moderate");
  const o = await findOffer(auth, id);
  if (o.removedByAdmin) throw new UserError("Bu teklif zaten yayından kaldırılmış.");
  const { reason } = z.object({ reason: zText(500, 3) }).parse(input);
  await db.supplierProduct.update({ where: { id }, data: { removedByAdmin: true, removalReason: reason } });
  await notifySupplier(o.supplierId, {
    type: "offer.removed",
    title: "Ürününüz yayından kaldırıldı",
    message: `"${o.product.name}" Oda tarafından yayından kaldırıldı. Gerekçe: ${reason}`,
    link: "/tedarikci",
  });
  await audit({ userId: auth.userId, action: "offer.remove", entityType: "SupplierProduct", entityId: id, data: { reason } });
}

export async function restoreOffer(auth: AuthContext, id: string) {
  assertPermission(auth, "offer.moderate");
  const o = await findOffer(auth, id);
  if (!o.removedByAdmin) throw new UserError("Bu teklif zaten yayında.");
  await db.supplierProduct.update({ where: { id }, data: { removedByAdmin: false, removalReason: null } });
  await notifySupplier(o.supplierId, { type: "offer.restored", title: "Ürününüz yeniden yayında", message: `"${o.product.name}" yeniden yayına alındı.`, link: "/tedarikci" });
  await audit({ userId: auth.userId, action: "offer.restore", entityType: "SupplierProduct", entityId: id });
}
