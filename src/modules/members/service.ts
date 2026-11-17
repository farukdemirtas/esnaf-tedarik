import type { MemberStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf } from "@/lib/auth/scope";
import { createPasswordResetToken } from "@/modules/auth/service";
import { decryptField, encryptField, maskId } from "@/lib/crypto";
import { NotFoundError, UserError } from "@/lib/errors";
import {
  pageArgs, z, zBool, zId, zOptEmail, zOptTaxNumber, zOptText, zPhone, zText,
} from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { createAccount, issueTempPassword, suggestUsername } from "@/modules/users/accounts";

export const memberSchema = z.object({
  businessName: zText(150, 2),
  ownerName: zText(100, 2),
  registryNumber: zText(30),
  businessType: zOptText(60),
  taxOffice: zOptText(80),
  taxId: zOptTaxNumber,
  phone: zPhone,
  email: zOptEmail,
});
export const createMemberSchema = memberSchema.extend({ username: zOptText(50) });

export const addressSchema = z.object({
  title: zText(60),
  districtId: zId,
  neighborhood: zOptText(80),
  line: zText(300, 5),
  isDefault: zBool,
});

async function findMember(auth: AuthContext, id: string) {
  const member = await db.member.findFirst({ where: { id, chamberId: chamberIdOf(auth) } });
  if (!member) throw new NotFoundError("Üye bulunamadı.");
  return member;
}

export async function listMembers(auth: AuthContext, f: { q?: string; status?: string; page?: string }) {
  assertPermission(auth, "member.view");
  const chamberId = chamberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.page);
  const status = ["PENDING", "ACTIVE", "PASSIVE", "REJECTED"].includes(f.status ?? "") ? (f.status as MemberStatus) : undefined;
  const q = f.q?.trim();
  const where: Prisma.MemberWhereInput = {
    chamberId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" } },
            { ownerName: { contains: q, mode: "insensitive" } },
            { registryNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const now = new Date();
  const [items, total] = await Promise.all([
    db.member.findMany({
      where,
      orderBy: [{ status: "asc" }, { businessName: "asc" }],
      skip,
      take,
      include: {
        dues: { where: { status: "UNPAID", dueDate: { lt: now } }, select: { id: true } },
        users: { include: { user: { select: { username: true, status: true } } } },
      },
    }),
    db.member.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function getMember(auth: AuthContext, id: string) {
  assertPermission(auth, "member.view");
  const member = await db.member.findFirst({
    where: { id, chamberId: chamberIdOf(auth) },
    include: {
      users: { include: { user: { select: { id: true, username: true, fullName: true, status: true, lastLoginAt: true, lockedUntil: true, mustChangePassword: true } } } },
      addresses: { include: { district: true }, orderBy: [{ isDefault: "desc" }, { title: "asc" }] },
      _count: { select: { orders: true } },
    },
  });
  if (!member) throw new NotFoundError("Üye bulunamadı.");
  const dues = auth.permissions.has("dues.view")
    ? await db.membershipDue.findMany({ where: { memberId: id }, orderBy: { period: "desc" }, take: 24 })
    : null;
  let taxIdMasked: string | null = null;
  if (member.taxIdEncrypted) {
    try {
      taxIdMasked = maskId(decryptField(member.taxIdEncrypted));
    } catch {
      taxIdMasked = "(okunamadı)";
    }
  }
  return { member, dues, taxIdMasked };
}

export async function createMember(auth: AuthContext, input: unknown) {
  assertPermission(auth, "member.create");
  const chamberId = chamberIdOf(auth);
  const d = createMemberSchema.parse(input);
  return db.$transaction(async (tx) => {
    const dup = await tx.member.findUnique({ where: { chamberId_registryNumber: { chamberId, registryNumber: d.registryNumber } } });
    if (dup) throw new UserError("Bu oda sicil numarasıyla kayıtlı bir üye var.", "registryNumber");
    const member = await tx.member.create({
      data: {
        chamberId,
        businessName: d.businessName,
        ownerName: d.ownerName,
        registryNumber: d.registryNumber,
        businessType: d.businessType,
        taxOffice: d.taxOffice,
        taxIdEncrypted: d.taxId ? encryptField(d.taxId) : null,
        phone: d.phone,
        email: d.email,
        status: "ACTIVE",
      },
    });
    const acc = await createAccount(tx, {
      chamberId,
      username: d.username ?? suggestUsername(d.registryNumber),
      fullName: d.ownerName,
      email: d.email,
      phone: d.phone,
      role: "MEMBER_OWNER",
      memberId: member.id,
    });
    await audit({ userId: auth.userId, action: "member.create", entityType: "Member", entityId: member.id, data: { businessName: d.businessName, username: acc.username } }, tx);
    return { member, username: acc.username, tempPassword: acc.tempPassword };
  });
}

export async function updateMember(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "member.update");
  const member = await findMember(auth, id);
  const d = memberSchema.parse(input);
  if (d.registryNumber !== member.registryNumber) {
    const dup = await db.member.findFirst({ where: { chamberId: member.chamberId, registryNumber: d.registryNumber, id: { not: id } } });
    if (dup) throw new UserError("Bu oda sicil numarasıyla kayıtlı başka bir üye var.", "registryNumber");
  }
  await db.member.update({
    where: { id },
    data: {
      businessName: d.businessName,
      ownerName: d.ownerName,
      registryNumber: d.registryNumber,
      businessType: d.businessType ?? null,
      taxOffice: d.taxOffice ?? null,
      // Boş bırakılırsa mevcut şifreli değer korunur
      ...(d.taxId ? { taxIdEncrypted: encryptField(d.taxId) } : {}),
      phone: d.phone,
      email: d.email ?? null,
    },
  });
  await audit({ userId: auth.userId, action: "member.update", entityType: "Member", entityId: id, data: { ...d, taxId: d.taxId ? "değişti" : undefined } });
}

/** Başvuruyu onaylar; kullanıcı hesabı yoksa oluşturur ve geçici şifre döndürür */
export async function approveMember(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "member.approve");
  const member = await findMember(auth, id);
  if (member.status !== "PENDING" && member.status !== "REJECTED") throw new UserError("Yalnızca başvuru durumundaki üyeler onaylanabilir.");
  const { username } = z.object({ username: zOptText(50) }).parse(input);
  return db.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { status: "ACTIVE", statusNote: null } });
    const hasUser = await tx.memberUser.count({ where: { memberId: id } });
    let creds: { username: string; tempPassword: string } | null = null;
    if (!hasUser) {
      const acc = await createAccount(tx, {
        chamberId: member.chamberId,
        username: username ?? suggestUsername(member.registryNumber),
        fullName: member.ownerName,
        email: member.email,
        phone: member.phone,
        role: "MEMBER_OWNER",
        memberId: id,
      });
      creds = { username: acc.username, tempPassword: acc.tempPassword };
    }
    await audit({ userId: auth.userId, action: "member.approve", entityType: "Member", entityId: id }, tx);
    return creds;
  });
}

export async function rejectMember(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "member.approve");
  const member = await findMember(auth, id);
  if (member.status !== "PENDING") throw new UserError("Yalnızca bekleyen başvurular reddedilebilir.");
  const { note } = z.object({ note: zText(500, 3) }).parse(input);
  await db.member.update({ where: { id }, data: { status: "REJECTED", statusNote: note } });
  await audit({ userId: auth.userId, action: "member.reject", entityType: "Member", entityId: id, data: { note } });
}

/** Aktif ↔ pasif. Pasife alınan üyenin tüm oturumları anında kapanır. */
export async function setMemberActive(auth: AuthContext, id: string, active: boolean, input: unknown) {
  assertPermission(auth, "member.setStatus");
  const member = await findMember(auth, id);
  if (member.status !== "ACTIVE" && member.status !== "PASSIVE") throw new UserError("Bu üye önce başvuru sürecinden geçmelidir.");
  const { note } = z.object({ note: zOptText(500) }).parse(input);
  await db.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { status: active ? "ACTIVE" : "PASSIVE", statusNote: note ?? null } });
    if (!active) await tx.session.deleteMany({ where: { user: { memberUser: { memberId: id } } } });
    await audit({ userId: auth.userId, action: active ? "member.activate" : "member.deactivate", entityType: "Member", entityId: id, data: { note } }, tx);
  });
}

async function findMemberUser(auth: AuthContext, userId: string) {
  const mu = await db.memberUser.findFirst({
    where: { userId, member: { chamberId: chamberIdOf(auth) } },
    include: { user: true },
  });
  if (!mu) throw new NotFoundError("Kullanıcı bulunamadı.");
  return mu;
}

export async function resetMemberUserPassword(auth: AuthContext, userId: string) {
  assertPermission(auth, "member.resetPassword");
  const mu = await findMemberUser(auth, userId);
  return db.$transaction(async (tx) => {
    const tempPassword = await issueTempPassword(tx, userId);
    await audit({ userId: auth.userId, action: "member.user.passwordReset", entityType: "User", entityId: userId }, tx);
    return { username: mu.user.username, tempPassword };
  });
}

export async function createMemberResetLink(auth: AuthContext, userId: string, appUrl: string) {
  assertPermission(auth, "member.resetPassword");
  await findMemberUser(auth, userId);
  const token = await createPasswordResetToken(userId, auth.userId, null);
  return `${appUrl.replace(/\/$/, "")}/sifre-sifirla?token=${token}`;
}

export async function addAddress(auth: AuthContext, memberId: string, input: unknown) {
  assertPermission(auth, "member.update");
  const member = await findMember(auth, memberId);
  const d = addressSchema.parse(input);
  const district = await db.district.findFirst({ where: { id: d.districtId, chamberId: member.chamberId, active: true } });
  if (!district) throw new UserError("Geçerli bir ilçe seçin.", "districtId");
  await db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { memberId } });
    const isDefault = d.isDefault || count === 0;
    if (isDefault) await tx.address.updateMany({ where: { memberId }, data: { isDefault: false } });
    const a = await tx.address.create({ data: { memberId, title: d.title, districtId: d.districtId, neighborhood: d.neighborhood, line: d.line, isDefault } });
    await audit({ userId: auth.userId, action: "member.address.add", entityType: "Address", entityId: a.id, data: { memberId } }, tx);
  });
}

export async function deleteAddress(auth: AuthContext, addressId: string) {
  assertPermission(auth, "member.update");
  const a = await db.address.findFirst({ where: { id: addressId, member: { chamberId: chamberIdOf(auth) } } });
  if (!a) throw new NotFoundError("Adres bulunamadı.");
  await db.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });
    if (a.isDefault) {
      const next = await tx.address.findFirst({ where: { memberId: a.memberId } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await audit({ userId: auth.userId, action: "member.address.delete", entityType: "Address", entityId: addressId }, tx);
  });
}

export async function setDefaultAddress(auth: AuthContext, addressId: string) {
  assertPermission(auth, "member.update");
  const a = await db.address.findFirst({ where: { id: addressId, member: { chamberId: chamberIdOf(auth) } } });
  if (!a) throw new NotFoundError("Adres bulunamadı.");
  await db.$transaction([
    db.address.updateMany({ where: { memberId: a.memberId }, data: { isDefault: false } }),
    db.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
}

export async function listDistricts(chamberId: string) {
  return db.district.findMany({ where: { chamberId, active: true }, orderBy: { name: "asc" } });
}
