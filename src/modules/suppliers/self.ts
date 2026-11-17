import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { supplierIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { deleteFile, saveFile } from "@/lib/storage";
import { z, zEmail, zId, zMoney, zOptMoney, zOptPhone, zOptText, zPhone, zText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { createAccount, issueTempPassword } from "@/modules/users/accounts";

/**
 * Tedarikçinin kendi firma bilgileri, hizmet bölgeleri ve kullanıcıları.
 * Tüm sorgular oturumdaki firmayla sınırlıdır (supplierIdOf).
 * Unvan, vergi ve MERSİS bilgileri yalnızca Oda tarafından değiştirilebilir.
 */

export async function supplierChamberIds(supplierId: string): Promise<string[]> {
  const rows = await db.supplierChamber.findMany({ where: { supplierId, active: true }, select: { chamberId: true } });
  return rows.map((r) => r.chamberId);
}

export async function primaryChamberId(supplierId: string): Promise<string> {
  const [id] = await supplierChamberIds(supplierId);
  if (!id) throw new UserError("Firmanız bir Oda'ya bağlı değil.");
  return id;
}

export async function getMySupplier(auth: AuthContext) {
  assertPermission(auth, "panel.supplier");
  const s = await db.supplier.findUnique({
    where: { id: supplierIdOf(auth) },
    include: { _count: { select: { products: true, supplierOrders: true } } },
  });
  if (!s) throw new NotFoundError();
  return s;
}

export const profileSchema = z.object({
  tradeName: zText(100, 2),
  description: zOptText(2000),
  address: zText(400, 5),
  phone: zPhone,
  email: zEmail,
  contactName: zText(100, 2),
  contactPhone: zOptPhone,
  minOrderAmount: zMoney,
});

export async function updateMyProfile(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.profile");
  const id = supplierIdOf(auth);
  const d = profileSchema.parse(input);
  await db.supplier.update({ where: { id }, data: { ...d, description: d.description ?? null, contactPhone: d.contactPhone ?? null } });
  await audit({ userId: auth.userId, action: "supplierSelf.profile", entityType: "Supplier", entityId: id, data: d });
}

export async function updateMyLogo(auth: AuthContext, image: Buffer | null) {
  assertPermission(auth, "supplierSelf.profile");
  const id = supplierIdOf(auth);
  const current = await db.supplier.findUniqueOrThrow({ where: { id }, select: { logoPath: true } });
  const saved = image ? await saveFile("logos", image, ["image"]) : null;
  await db.supplier.update({ where: { id }, data: { logoPath: saved?.key ?? null } });
  if (current.logoPath) await deleteFile(current.logoPath);
  await audit({ userId: auth.userId, action: saved ? "supplierSelf.logo" : "supplierSelf.logo.remove", entityType: "Supplier", entityId: id });
}

// ───────────── Hizmet bölgeleri ─────────────

export const deliveryAreaSchema = z.object({
  districtId: zId,
  days: z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.coerce.number().int().min(1).max(7)).min(1, "En az bir teslimat günü seçin."),
  ),
  minOrderAmount: zOptMoney,
});

export async function listMyDeliveryAreas(auth: AuthContext) {
  assertPermission(auth, "panel.supplier");
  const supplierId = supplierIdOf(auth);
  const [areas, districts] = await Promise.all([
    db.deliveryArea.findMany({ where: { supplierId }, include: { district: true }, orderBy: { district: { name: "asc" } } }),
    db.district.findMany({ where: { chamberId: { in: await supplierChamberIds(supplierId) }, active: true }, orderBy: { name: "asc" } }),
  ]);
  return { areas, districts };
}

/** Bölge ekler; aynı ilçe varsa günlerini/limitini günceller */
export async function saveDeliveryArea(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.profile");
  const supplierId = supplierIdOf(auth);
  const d = deliveryAreaSchema.parse(input);
  const district = await db.district.findFirst({ where: { id: d.districtId, active: true, chamberId: { in: await supplierChamberIds(supplierId) } } });
  if (!district) throw new UserError("Geçerli bir ilçe seçin.", "districtId");
  const days = [...new Set(d.days)].sort();
  await db.deliveryArea.upsert({
    where: { supplierId_districtId: { supplierId, districtId: d.districtId } },
    update: { deliveryDays: days, minOrderAmount: d.minOrderAmount ?? null },
    create: { supplierId, districtId: d.districtId, deliveryDays: days, minOrderAmount: d.minOrderAmount },
  });
  await audit({ userId: auth.userId, action: "supplierSelf.area.save", entityType: "Supplier", entityId: supplierId, data: { district: district.name, days } });
}

export async function deleteDeliveryArea(auth: AuthContext, id: string) {
  assertPermission(auth, "supplierSelf.profile");
  const supplierId = supplierIdOf(auth);
  const a = await db.deliveryArea.findFirst({ where: { id, supplierId }, include: { district: true } });
  if (!a) throw new NotFoundError("Bölge bulunamadı.");
  await db.deliveryArea.delete({ where: { id } });
  await audit({ userId: auth.userId, action: "supplierSelf.area.delete", entityType: "Supplier", entityId: supplierId, data: { district: a.district.name } });
}

/** Hepsini birden: tüm ilçeler aynı günlerle eklenir (ilk kurulumu hızlandırır) */
export async function addAllDistricts(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.profile");
  const supplierId = supplierIdOf(auth);
  const { days } = deliveryAreaSchema.pick({ days: true }).parse(input);
  const districts = await db.district.findMany({ where: { chamberId: { in: await supplierChamberIds(supplierId) }, active: true } });
  const res = await db.deliveryArea.createMany({
    data: districts.map((x) => ({ supplierId, districtId: x.id, deliveryDays: [...new Set(days)].sort() })),
    skipDuplicates: true,
  });
  await audit({ userId: auth.userId, action: "supplierSelf.area.addAll", entityType: "Supplier", entityId: supplierId, data: { added: res.count } });
  return res.count;
}

// ───────────── Firma kullanıcıları ─────────────

export const myUserSchema = z.object({
  fullName: zText(100, 2),
  username: zText(50, 3),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zEmail.optional()),
  phone: zOptPhone,
  role: z.enum(["SUPPLIER_STAFF", "SUPPLIER_OWNER"]),
});

export async function listMyUsers(auth: AuthContext) {
  assertPermission(auth, "supplierSelf.users");
  return db.user.findMany({
    where: { supplierUser: { supplierId: supplierIdOf(auth) } },
    include: { roles: { include: { role: true } } },
    orderBy: { fullName: "asc" },
  });
}

export async function addMyUser(auth: AuthContext, input: unknown) {
  assertPermission(auth, "supplierSelf.users");
  const supplierId = supplierIdOf(auth);
  const d = myUserSchema.parse(input);
  const chamberId = await primaryChamberId(supplierId);
  return db.$transaction(async (tx) => {
    const acc = await createAccount(tx, { chamberId, username: d.username, fullName: d.fullName, email: d.email, phone: d.phone, role: d.role, supplierId });
    await audit({ userId: auth.userId, action: "supplierSelf.user.add", entityType: "User", entityId: acc.user.id, data: { role: d.role } }, tx);
    return { username: acc.username, tempPassword: acc.tempPassword };
  });
}

async function findMyUser(auth: AuthContext, userId: string) {
  if (userId === auth.userId) throw new UserError("Kendi hesabınızda bu işlemi yapamazsınız.");
  const u = await db.user.findFirst({ where: { id: userId, supplierUser: { supplierId: supplierIdOf(auth) } } });
  if (!u) throw new NotFoundError("Kullanıcı bulunamadı.");
  return u;
}

export async function setMyUserActive(auth: AuthContext, userId: string, active: boolean) {
  assertPermission(auth, "supplierSelf.users");
  await findMyUser(auth, userId);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: active ? "ACTIVE" : "PASSIVE", ...(active ? { lockedUntil: null, failedLoginCount: 0 } : {}) } });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    await audit({ userId: auth.userId, action: active ? "supplierSelf.user.activate" : "supplierSelf.user.deactivate", entityType: "User", entityId: userId }, tx);
  });
}

export async function resetMyUserPassword(auth: AuthContext, userId: string) {
  assertPermission(auth, "supplierSelf.users");
  const u = await findMyUser(auth, userId);
  return db.$transaction(async (tx) => {
    const tempPassword = await issueTempPassword(tx, userId);
    await audit({ userId: auth.userId, action: "supplierSelf.user.passwordReset", entityType: "User", entityId: userId }, tx);
    return { username: u.username, tempPassword };
  });
}
