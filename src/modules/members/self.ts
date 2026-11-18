import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf, memberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { z, zOptEmail, zPhone } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { getMemberDuesState } from "./dues";
import { addressSchema } from "./service";

/** Üyenin kendi hesabı: işletme bilgileri, teslimat adresleri, aidat durumu. Yalnızca kendi kaydı. */

export const contactSchema = z.object({ phone: zPhone, email: zOptEmail });

export async function getMyAccount(auth: AuthContext) {
  assertPermission(auth, "memberSelf.account");
  const memberId = memberIdOf(auth);
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      id: true, businessName: true, ownerName: true, registryNumber: true, businessType: true, taxOffice: true, phone: true, email: true, status: true, chamberId: true,
      addresses: { include: { district: true }, orderBy: [{ isDefault: "desc" }, { title: "asc" }] },
      dues: { orderBy: { period: "desc" }, take: 24, select: { id: true, period: true, amount: true, dueDate: true, paidAt: true, status: true } },
      users: { select: { user: { select: { id: true, username: true, fullName: true, lastLoginAt: true } } } },
    },
  });
  const [dues, districts] = await Promise.all([
    getMemberDuesState(memberId, member.chamberId),
    db.district.findMany({ where: { chamberId: member.chamberId, active: true }, orderBy: { name: "asc" } }),
  ]);
  return { member, dues, districts };
}

export async function updateMyContact(auth: AuthContext, input: unknown) {
  assertPermission(auth, "memberSelf.account");
  const memberId = memberIdOf(auth);
  const d = contactSchema.parse(input);
  await db.member.update({ where: { id: memberId }, data: { phone: d.phone, email: d.email ?? null } });
  await audit({ userId: auth.userId, action: "memberSelf.contact.update", entityType: "Member", entityId: memberId });
}

export async function addMyAddress(auth: AuthContext, input: unknown) {
  assertPermission(auth, "memberSelf.account");
  const memberId = memberIdOf(auth);
  const d = addressSchema.parse(input);
  const district = await db.district.findFirst({ where: { id: d.districtId, chamberId: chamberIdOf(auth), active: true } });
  if (!district) throw new UserError("Geçerli bir ilçe seçin.", "districtId");
  const count = await db.address.count({ where: { memberId } });
  if (count >= 10) throw new UserError("En fazla 10 adres kaydedebilirsiniz.");
  await db.$transaction(async (tx) => {
    const isDefault = d.isDefault || count === 0;
    if (isDefault) await tx.address.updateMany({ where: { memberId }, data: { isDefault: false } });
    const a = await tx.address.create({ data: { memberId, title: d.title, districtId: d.districtId, neighborhood: d.neighborhood, line: d.line, isDefault } });
    await audit({ userId: auth.userId, action: "memberSelf.address.add", entityType: "Address", entityId: a.id }, tx);
  });
}

async function findMyAddress(auth: AuthContext, id: string) {
  const a = await db.address.findFirst({ where: { id, memberId: memberIdOf(auth) } });
  if (!a) throw new NotFoundError("Adres bulunamadı.");
  return a;
}

export async function updateMyAddress(auth: AuthContext, id: string, input: unknown) {
  assertPermission(auth, "memberSelf.account");
  const a = await findMyAddress(auth, id);
  const d = addressSchema.parse(input);
  const district = await db.district.findFirst({ where: { id: d.districtId, chamberId: chamberIdOf(auth), active: true } });
  if (!district) throw new UserError("Geçerli bir ilçe seçin.", "districtId");
  await db.$transaction(async (tx) => {
    if (d.isDefault) await tx.address.updateMany({ where: { memberId: a.memberId }, data: { isDefault: false } });
    await tx.address.update({
      where: { id },
      data: { title: d.title, districtId: d.districtId, neighborhood: d.neighborhood ?? null, line: d.line, isDefault: d.isDefault || a.isDefault },
    });
    await audit({ userId: auth.userId, action: "memberSelf.address.update", entityType: "Address", entityId: id }, tx);
  });
}

export async function deleteMyAddress(auth: AuthContext, id: string) {
  assertPermission(auth, "memberSelf.account");
  const a = await findMyAddress(auth, id);
  const count = await db.address.count({ where: { memberId: a.memberId } });
  if (count <= 1) throw new UserError("Son teslimat adresiniz silinemez; önce yeni bir adres ekleyin.");
  await db.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    if (a.isDefault) {
      const next = await tx.address.findFirst({ where: { memberId: a.memberId }, orderBy: { id: "asc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await audit({ userId: auth.userId, action: "memberSelf.address.delete", entityType: "Address", entityId: id }, tx);
  });
}

export async function setMyDefaultAddress(auth: AuthContext, id: string) {
  assertPermission(auth, "memberSelf.account");
  const a = await findMyAddress(auth, id);
  await db.$transaction([
    db.address.updateMany({ where: { memberId: a.memberId }, data: { isDefault: false } }),
    db.address.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await audit({ userId: auth.userId, action: "memberSelf.address.default", entityType: "Address", entityId: id });
}
