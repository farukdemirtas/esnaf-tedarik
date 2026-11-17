import type { Prisma, SupplierOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { saveFile } from "@/lib/storage";
import { pageArgs, z, zDate, zOptDate, zOptMoney, zOptText, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { notifyMember } from "@/modules/notifications/service";
import { ORDER_STATUS } from "@/lib/format";

/**
 * Tedarikçinin kendi siparişlerini yönetmesi.
 * Durum makinesi: Beklemede → Onaylandı → Hazırlanıyor → Dağıtımda → Teslim edildi
 * Beklemede → Reddedildi; Onaylandı/Hazırlanıyor → İptal. Red ve iptalde stok iade edilir.
 */

export const TRANSITIONS: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
  PENDING: ["CONFIRMED", "REJECTED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const OPEN_STATUSES: SupplierOrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED"];

const statusChangeSchema = z.object({
  to: z.enum(["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED"]),
  note: zOptText(500),
  plannedDate: zOptDate,
});

export async function listMySupplierOrders(auth: AuthContext, f: { status?: string; q?: string; page?: string }) {
  assertPermission(auth, "supplierSelf.orders.view");
  const supplierId = supplierIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page);
  const all = Object.keys(TRANSITIONS);
  const where: Prisma.SupplierOrderWhereInput = {
    supplierId,
    ...(f.status === "open" ? { status: { in: OPEN_STATUSES } } : all.includes(f.status ?? "") ? { status: f.status as SupplierOrderStatus } : {}),
    ...(f.q?.trim()
      ? { OR: [{ subNumber: { contains: f.q.trim().toUpperCase() } }, { order: { member: { businessName: { contains: f.q.trim(), mode: "insensitive" } } } }] }
      : {}),
  };
  const [items, total, counts] = await Promise.all([
    db.supplierOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { order: { select: { orderNumber: true, addressSnapshot: true, member: { select: { businessName: true, phone: true } } } }, _count: { select: { items: true } } },
    }),
    db.supplierOrder.count({ where }),
    db.supplierOrder.groupBy({ by: ["status"], where: { supplierId }, _count: true }),
  ]);
  return { items, total, page, size, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<SupplierOrderStatus, number>> };
}

export async function getMySupplierOrder(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.orders.view");
  const so = await db.supplierOrder.findFirst({
    where: { id, supplierId: supplierIdOf(auth) },
    include: {
      supplier: { select: { tradeName: true, legalName: true, phone: true, address: true, taxOffice: true, taxNumber: true } },
      order: { include: { member: { select: { id: true, businessName: true, ownerName: true, phone: true, registryNumber: true } } } },
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { username: true, fullName: true } } } },
      invoices: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!so) throw new NotFoundError("Sipariş bulunamadı.");
  return so;
}

/** Durum değişikliği. İyimser kilit: yalnızca beklenen durumdaysa güncellenir. */
export async function changeSupplierOrderStatus(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplierSelf.orders.process");
  const supplierId = supplierIdOf(auth);
  const d = statusChangeSchema.parse(input);
  const so = await db.supplierOrder.findFirst({ where: { id, supplierId }, include: { items: true, order: { select: { id: true, memberId: true } } } });
  if (!so) throw new NotFoundError("Sipariş bulunamadı.");
  if (!TRANSITIONS[so.status].includes(d.to))
    throw new UserError(`"${ORDER_STATUS[so.status].label}" durumundaki sipariş "${ORDER_STATUS[d.to].label}" yapılamaz.`);
  const releasesStock = d.to === "REJECTED" || d.to === "CANCELLED";
  if (releasesStock && (!d.note || d.note.length < 3)) throw new UserError("Red/iptal gerekçesi yazın (en az 3 karakter).", "note");

  await db.$transaction(async (tx) => {
    const updated = await tx.supplierOrder.updateMany({
      where: { id, status: so.status },
      data: {
        status: d.to,
        ...(releasesStock ? { rejectReason: d.note } : {}),
        ...(d.to === "CONFIRMED" && d.plannedDate ? { plannedDate: d.plannedDate } : {}),
      },
    });
    if (updated.count === 0) throw new UserError("Sipariş bu arada başka biri tarafından güncellendi. Sayfayı yenileyin.");
    if (releasesStock) {
      for (const item of so.items) {
        await tx.stock.upsert({
          where: { supplierProductId: item.supplierProductId },
          update: { quantity: { increment: item.quantity } },
          create: { supplierProductId: item.supplierProductId, quantity: item.quantity },
        });
        await tx.stockMovement.create({
          data: { supplierProductId: item.supplierProductId, change: item.quantity, reason: d.to === "REJECTED" ? "ORDER_REJECT" : "ORDER_CANCEL", reference: so.subNumber, userId: auth.userId },
        });
      }
    }
    await tx.orderStatusHistory.create({ data: { supplierOrderId: id, fromStatus: so.status, toStatus: d.to, changedById: auth.userId, note: d.note } });
    await notifyMember(
      so.order.memberId,
      {
        type: `order.${d.to.toLowerCase()}`,
        title: `Siparişiniz: ${ORDER_STATUS[d.to].label}`,
        message: `${so.subNumber} numaralı siparişiniz "${ORDER_STATUS[d.to].label}" durumuna geçti.${d.note ? ` Not: ${d.note}` : ""}`,
        link: `/magaza/siparislerim/${so.order.id}`,
      },
      tx,
    );
    await audit({ userId: auth.userId, action: `order.status.${d.to.toLowerCase()}`, entityType: "SupplierOrder", entityId: id, data: { from: so.status, to: d.to, note: d.note } }, tx);
  });
}

export async function updateSupplierNote(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplierSelf.orders.process");
  const so = await db.supplierOrder.findFirst({ where: { id, supplierId: supplierIdOf(auth) } });
  if (!so) throw new NotFoundError("Sipariş bulunamadı.");
  const { supplierNote, plannedDate } = z.object({ supplierNote: zOptText(1000), plannedDate: zOptDate }).parse(input);
  await db.supplierOrder.update({ where: { id }, data: { supplierNote: supplierNote ?? null, plannedDate: plannedDate ?? null } });
  await audit({ userId: auth.userId, action: "order.supplierNote", entityType: "SupplierOrder", entityId: id });
}

// ───────────── Fatura / irsaliye kaydı ─────────────

export const invoiceSchema = z.object({
  type: z.enum(["INVOICE", "WAYBILL"]),
  documentNumber: zText(50, 1),
  documentDate: zDate,
  amount: zOptMoney,
});

/** Tedarikçinin kestiği belgenin kaydı. Platform belge düzenlemez; e-fatura sistemi dışında tutulur. */
export async function addInvoice(auth: AuthContext, supplierOrderId: string, input: unknown, file: Buffer | null) {
  assertPermission(auth, "supplierSelf.orders.process");
  const so = await db.supplierOrder.findFirst({ where: { id: supplierOrderId, supplierId: supplierIdOf(auth) } });
  if (!so) throw new NotFoundError("Sipariş bulunamadı.");
  if (so.status === "REJECTED" || so.status === "CANCELLED" || so.status === "PENDING") throw new UserError("Belge yalnızca onaylanmış siparişlere eklenebilir.");
  const d = invoiceSchema.parse(input);
  if (d.documentDate > new Date()) throw new UserError("Belge tarihi ileri bir tarih olamaz.", "documentDate");
  const saved = file ? await saveFile("invoices", file, ["document", "image"]) : null;
  const inv = await db.invoice.create({ data: { supplierOrderId, ...d, filePath: saved?.key } });
  await audit({ userId: auth.userId, action: "order.invoice.add", entityType: "SupplierOrder", entityId: supplierOrderId, data: { type: d.type, documentNumber: d.documentNumber } });
  return inv;
}

export async function deleteInvoice(auth: AuthContext, invoiceId: string) {
  assertPermission(auth, "supplierSelf.orders.process");
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, supplierOrder: { supplierId: supplierIdOf(auth) } } });
  if (!inv) throw new NotFoundError("Belge bulunamadı.");
  await db.invoice.delete({ where: { id: invoiceId } });
  await audit({ userId: auth.userId, action: "order.invoice.delete", entityType: "SupplierOrder", entityId: inv.supplierOrderId, data: { documentNumber: inv.documentNumber } });
}
