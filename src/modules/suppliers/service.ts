import type { Prisma, SupplierStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { uniqueSlug } from "@/lib/slug";
import {
  pageArgs, z, zEmail, zMoney, zOptPhone, zOptText, zPhone, zTaxNumber, zText,
} from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { createAccount, issueTempPassword, suggestUsername } from "@/modules/users/accounts";
import { notifySupplier } from "@/modules/notifications/service";

export const supplierSchema = z.object({
  legalName: zText(200, 2),
  tradeName: zText(100, 2),
  taxOffice: zText(80, 2),
  taxNumber: zTaxNumber,
  mersisNumber: zOptText(20),
  address: zText(400, 5),
  phone: zPhone,
  email: zEmail,
  contactName: zText(100, 2),
  contactPhone: zOptPhone,
  minOrderAmount: zMoney,
  description: zOptText(2000),
});

export const supplierUserSchema = z.object({
  fullName: zText(100, 2),
  username: zText(50, 3),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zEmail.optional()),
  role: z.enum(["SUPPLIER_OWNER", "SUPPLIER_STAFF"]),
});

/** Tedarikçiye Oda kapsamında erişim filtresi */
function inChamber(auth: AuthContext): Prisma.SupplierWhereInput {
  return { chambers: { some: { chamberId: chamberIdOf(auth) } } };
}

async function findSupplier(auth: AuthContext, id: string) {
  const s = await db.supplier.findFirst({ where: { id, ...inChamber(auth) } });
  if (!s) throw new NotFoundError("Tedarikçi bulunamadı.");
  return s;
}

export async function listSuppliers(auth: AuthContext, f: { q?: string; status?: string; page?: string }) {
  assertPermission(auth, "supplier.view");
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(f.status ?? "") ? (f.status as SupplierStatus) : undefined;
  const q = f.q?.trim();
  const where: Prisma.SupplierWhereInput = {
    ...inChamber(auth),
    ...(status ? { status } : {}),
    ...(q
      ? { OR: [{ tradeName: { contains: q, mode: "insensitive" } }, { legalName: { contains: q, mode: "insensitive" } }, { taxNumber: { contains: q } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: [{ status: "asc" }, { tradeName: "asc" }],
      skip,
      take,
      include: { _count: { select: { products: true, supplierOrders: true, users: true } } },
    }),
    db.supplier.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function getSupplier(auth: AuthContext, id: string) {
  assertPermission(auth, "supplier.view");
  const s = await db.supplier.findFirst({
    where: { id, ...inChamber(auth) },
    include: {
      users: { include: { user: { include: { roles: { include: { role: true } } } } } },
      deliveryAreas: { include: { district: true }, orderBy: { district: { name: "asc" } } },
      _count: { select: { products: true, supplierOrders: true, campaigns: true } },
    },
  });
  if (!s) throw new NotFoundError("Tedarikçi bulunamadı.");
  return s;
}

async function assertTaxNumberFree(taxNumber: string, exceptId?: string) {
  const dup = await db.supplier.findFirst({ where: { taxNumber, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dup) throw new UserError("Bu vergi numarasıyla kayıtlı bir firma var.", "taxNumber");
}

/** Oda tarafından doğrudan eklenen tedarikçi: onaylı olarak açılır, yetkili hesabı oluşturulur */
export async function createSupplier(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplier.create");
  const chamberId = chamberIdOf(auth);
  const d = supplierSchema.extend({ ownerName: zText(100, 2), username: zOptText(50) }).parse(input);
  await assertTaxNumberFree(d.taxNumber);
  const slug = await uniqueSlug(d.tradeName, async (s) => !!(await db.supplier.findUnique({ where: { slug: s } })));
  return db.$transaction(async (tx) => {
    const { ownerName, username, ...data } = d;
    const s = await tx.supplier.create({
      data: { ...data, slug, status: "APPROVED", approvedById: auth.userId, approvedAt: new Date(), chambers: { create: { chamberId } } },
    });
    const acc = await createAccount(tx, {
      chamberId,
      username: username ?? suggestUsername(d.email),
      fullName: ownerName,
      email: d.email,
      phone: d.contactPhone ?? d.phone,
      role: "SUPPLIER_OWNER",
      supplierId: s.id,
    });
    await audit({ userId: auth.userId, action: "supplier.create", entityType: "Supplier", entityId: s.id, data: { tradeName: d.tradeName, username: acc.username } }, tx);
    return { supplier: s, username: acc.username, tempPassword: acc.tempPassword };
  });
}

export async function updateSupplier(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplier.update");
  await findSupplier(auth, id);
  const d = supplierSchema.parse(input);
  await assertTaxNumberFree(d.taxNumber, id);
  await db.supplier.update({
    where: { id },
    data: { ...d, mersisNumber: d.mersisNumber ?? null, contactPhone: d.contactPhone ?? null, description: d.description ?? null },
  });
  await audit({ userId: auth.userId, action: "supplier.update", entityType: "Supplier", entityId: id, data: d });
}

/** Başvuruyu onaylar; firmanın kullanıcısı yoksa yetkili hesabı oluşturur */
export async function approveSupplier(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplier.approve");
  const s = await findSupplier(auth, id);
  if (s.status !== "PENDING" && s.status !== "REJECTED") throw new UserError("Yalnızca başvuru durumundaki firmalar onaylanabilir.");
  const { username } = z.object({ username: zOptText(50) }).parse(input);
  return db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: { status: "APPROVED", statusNote: null, approvedById: auth.userId, approvedAt: new Date() } });
    const userCount = await tx.supplierUser.count({ where: { supplierId: id } });
    let creds: { username: string; tempPassword: string } | null = null;
    if (!userCount) {
      const acc = await createAccount(tx, {
        chamberId: chamberIdOf(auth),
        username: username ?? suggestUsername(s.email),
        fullName: s.contactName,
        email: s.email,
        phone: s.contactPhone ?? s.phone,
        role: "SUPPLIER_OWNER",
        supplierId: id,
      });
      creds = { username: acc.username, tempPassword: acc.tempPassword };
    }
    await audit({ userId: auth.userId, action: "supplier.approve", entityType: "Supplier", entityId: id }, tx);
    return creds;
  });
}

export async function rejectSupplier(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "supplier.approve");
  const s = await findSupplier(auth, id);
  if (s.status !== "PENDING") throw new UserError("Yalnızca bekleyen başvurular reddedilebilir.");
  const { note } = z.object({ note: zText(500, 3) }).parse(input);
  await db.supplier.update({ where: { id }, data: { status: "REJECTED", statusNote: note } });
  await audit({ userId: auth.userId, action: "supplier.reject", entityType: "Supplier", entityId: id, data: { note } });
}

/** Askıya alma / yeniden aktifleştirme. Askıya alınan firmanın tüm oturumları kapanır. */
export async function setSupplierSuspended(auth: AuthContext, id: string, suspended: boolean, input: unknown) {
  assertPermission(auth, "supplier.setStatus");
  const s = await findSupplier(auth, id);
  if (suspended && s.status !== "APPROVED") throw new UserError("Yalnızca aktif firmalar askıya alınabilir.");
  if (!suspended && s.status !== "SUSPENDED") throw new UserError("Firma askıda değil.");
  const { note } = z.object({ note: suspended ? zText(500, 3) : zOptText(500) }).parse(input);
  await db.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: { status: suspended ? "SUSPENDED" : "APPROVED", statusNote: note ?? null } });
    if (suspended) await tx.session.deleteMany({ where: { user: { supplierUser: { supplierId: id } } } });
    await audit({ userId: auth.userId, action: suspended ? "supplier.suspend" : "supplier.reactivate", entityType: "Supplier", entityId: id, data: { note } }, tx);
  });
}

export async function addSupplierUser(auth: AuthContext, supplierId: string, input: unknown) {
  assertPermission(auth, "supplier.update");
  const s = await findSupplier(auth, supplierId);
  const d = supplierUserSchema.parse(input);
  return db.$transaction(async (tx) => {
    const acc = await createAccount(tx, { chamberId: chamberIdOf(auth), username: d.username, fullName: d.fullName, email: d.email, role: d.role, supplierId: s.id });
    await audit({ userId: auth.userId, action: "supplier.user.add", entityType: "User", entityId: acc.user.id, data: { supplierId, role: d.role } }, tx);
    return { username: acc.username, tempPassword: acc.tempPassword };
  });
}

export async function resetSupplierUserPassword(auth: AuthContext, userId: string) {
  assertPermission(auth, "supplier.update");
  const su = await db.supplierUser.findFirst({
    where: { userId, supplier: inChamber(auth) },
    include: { user: true },
  });
  if (!su) throw new NotFoundError("Kullanıcı bulunamadı.");
  return db.$transaction(async (tx) => {
    const tempPassword = await issueTempPassword(tx, userId);
    await audit({ userId: auth.userId, action: "supplier.user.passwordReset", entityType: "User", entityId: userId }, tx);
    return { username: su.user.username, tempPassword };
  });
}

export async function setSupplierUserActive(auth: AuthContext, userId: string, active: boolean) {
  assertPermission(auth, "supplier.update");
  const su = await db.supplierUser.findFirst({ where: { userId, supplier: inChamber(auth) } });
  if (!su) throw new NotFoundError("Kullanıcı bulunamadı.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: active ? "ACTIVE" : "PASSIVE" } });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    await audit({ userId: auth.userId, action: active ? "supplier.user.activate" : "supplier.user.deactivate", entityType: "User", entityId: userId }, tx);
  });
}

export { notifySupplier };
