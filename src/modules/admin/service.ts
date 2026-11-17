import type { Prisma, SupplierOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError } from "@/lib/errors";
import { pageArgs, z, zOptEmail, zOptPhone, zOptTaxNumber, zOptText, zText, TZ_OFFSET } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";

// ───────────── Denetim kayıtları ─────────────

export async function listAuditLogs(auth: AuthContext, f: { action?: string; user?: string; entity?: string; from?: string; to?: string; page?: string }) {
  assertPermission(auth, "audit.view");
  const { skip, take, page, size } = pageArgs(f.page, 50);
  const date = (v: string | undefined, end = false) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}${TZ_OFFSET}`) : undefined;
  const from = date(f.from);
  const to = date(f.to, true);
  const where: Prisma.AuditLogWhereInput = {
    // Oda kapsamı: Oda kullanıcılarının işlemleri ve kullanıcısız (başvuru vb.) kayıtlar
    OR: [{ user: { chamberId: chamberIdOf(auth) } }, { userId: null }],
    ...(f.action ? { action: { startsWith: f.action.trim() } } : {}),
    ...(f.entity ? { entityType: f.entity } : {}),
    ...(f.user ? { user: { username: { contains: f.user.trim().toLowerCase() } } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { username: true, fullName: true } } } }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page, size };
}

// ───────────── Oda ayarları ─────────────

export const chamberSchema = z.object({
  name: zText(200, 3),
  shortName: zText(80, 2),
  phone: zOptPhone,
  email: zOptEmail,
  address: zOptText(400),
  taxOffice: zOptText(80),
  taxNumber: zOptTaxNumber,
});

export async function getChamber(auth: AuthContext) {
  assertPermission(auth, "settings.manage");
  const c = await db.chamber.findUnique({ where: { id: chamberIdOf(auth) } });
  if (!c) throw new NotFoundError();
  return c;
}

export async function updateChamber(auth: AuthContext, input: unknown) {
  assertPermission(auth, "settings.manage");
  const d = chamberSchema.parse(input);
  await db.chamber.update({
    where: { id: chamberIdOf(auth) },
    data: { name: d.name, shortName: d.shortName, phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null, taxOffice: d.taxOffice ?? null, taxNumber: d.taxNumber ?? null },
  });
  await audit({ userId: auth.userId, action: "settings.chamber", data: d });
}

// ───────────── Siparişler (salt okunur) ─────────────

export async function listAllSupplierOrders(auth: AuthContext, f: { status?: string; supplierId?: string; q?: string; from?: string; to?: string; page?: string }) {
  assertPermission(auth, "order.viewAll");
  const { skip, take, page, size } = pageArgs(f.page);
  const statuses = ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED"];
  const status = statuses.includes(f.status ?? "") ? (f.status as SupplierOrderStatus) : undefined;
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? new Date(`${f.from}T00:00:00${TZ_OFFSET}`) : undefined;
  const to = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? new Date(`${f.to}T23:59:59${TZ_OFFSET}`) : undefined;
  const q = f.q?.trim();
  const where: Prisma.SupplierOrderWhereInput = {
    order: { chamberId: chamberIdOf(auth), ...(q ? { OR: [{ orderNumber: { contains: q.toUpperCase() } }, { member: { businessName: { contains: q, mode: "insensitive" } } }] } : {}) },
    ...(status ? { status } : {}),
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const [items, total, sum] = await Promise.all([
    db.supplierOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        supplier: { select: { id: true, tradeName: true } },
        order: { select: { orderNumber: true, member: { select: { id: true, businessName: true } } } },
        _count: { select: { items: true } },
      },
    }),
    db.supplierOrder.count({ where }),
    db.supplierOrder.aggregate({ where, _sum: { grandTotal: true } }),
  ]);
  return { items, total, page, size, sum: sum._sum.grandTotal };
}

export async function getSupplierOrderForAdmin(auth: AuthContext, id: string) {
  assertPermission(auth, "order.viewAll");
  const so = await db.supplierOrder.findFirst({
    where: { id, order: { chamberId: chamberIdOf(auth) } },
    include: {
      supplier: { select: { id: true, tradeName: true, phone: true } },
      order: { include: { member: { select: { id: true, businessName: true, phone: true } }, createdBy: { select: { username: true } } } },
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { username: true } } } },
      invoices: true,
    },
  });
  if (!so) throw new NotFoundError("Sipariş bulunamadı.");
  return so;
}

// ───────────── Gösterge paneli ─────────────

export async function dashboardStats(auth: AuthContext) {
  const chamberId = chamberIdOf(auth);
  const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }) + `T00:00:00${TZ_OFFSET}`);
  const monthStart = new Date(`${today.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 7)}-01T00:00:00${TZ_OFFSET}`);
  const can = (p: Parameters<typeof auth.permissions.has>[0]) => auth.permissions.has(p);
  const [members, activeMembers, pendingMembers, suppliers, activeSuppliers, pendingSuppliers, products, ordersToday, ordersMonth, pendingCampaigns, pendingRequests, overdue] =
    await Promise.all([
      can("member.view") ? db.member.count({ where: { chamberId } }) : null,
      can("member.view") ? db.member.count({ where: { chamberId, status: "ACTIVE" } }) : null,
      can("member.view") ? db.member.count({ where: { chamberId, status: "PENDING" } }) : null,
      can("supplier.view") ? db.supplierChamber.count({ where: { chamberId } }) : null,
      can("supplier.view") ? db.supplierChamber.count({ where: { chamberId, active: true, supplier: { status: "APPROVED" } } }) : null,
      can("supplier.view") ? db.supplierChamber.count({ where: { chamberId, supplier: { status: "PENDING" } } }) : null,
      can("product.manage") || can("offer.view") ? db.product.count({ where: { chamberId, status: "ACTIVE" } }) : null,
      can("order.viewAll") ? db.supplierOrder.count({ where: { order: { chamberId }, createdAt: { gte: today } } }) : null,
      can("order.viewAll") ? db.supplierOrder.count({ where: { order: { chamberId }, createdAt: { gte: monthStart } } }) : null,
      can("campaign.review") ? db.campaign.count({ where: { chamberId, status: "PENDING" } }) : null,
      can("productRequest.review") ? db.productRequest.count({ where: { chamberId, status: "PENDING" } }) : null,
      can("dues.view") ? db.member.count({ where: { chamberId, dues: { some: { status: "UNPAID", dueDate: { lt: new Date() } } } } }) : null,
    ]);
  return { members, activeMembers, pendingMembers, suppliers, activeSuppliers, pendingSuppliers, products, ordersToday, ordersMonth, pendingCampaigns, pendingRequests, overdue };
}
