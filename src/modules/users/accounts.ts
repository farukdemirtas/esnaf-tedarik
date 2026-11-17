import type { Prisma } from "@prisma/client";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { isValidUsername, normalizeUsername } from "@/lib/auth/username";
import { UserError } from "@/lib/errors";
import type { RoleCode } from "@/lib/permissions";

type Tx = Prisma.TransactionClient;

/** Kayıt numarası, e-posta vb. bir değerden geçerli kullanıcı adı önerir */
export function suggestUsername(source: string): string {
  return normalizeUsername(source)
    .replace(/[^a-z0-9._@-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Yeni kullanıcı hesabı oluşturur. Geçici şifre üretilir, yalnızca bir kez döndürülür
 * ve ilk girişte değiştirilmesi zorunludur.
 */
export async function createAccount(
  tx: Tx,
  a: {
    chamberId: string;
    username: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    role: RoleCode;
    supplierId?: string;
    memberId?: string;
  },
) {
  const username = normalizeUsername(a.username);
  if (!isValidUsername(username))
    throw new UserError("Kullanıcı adı 3-50 karakter olmalı; yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.", "username");
  const email = a.email?.trim().toLowerCase() || null;
  const clash = await tx.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true },
  });
  if (clash) {
    if (clash.username === username) throw new UserError("Bu kullanıcı adı zaten kullanılıyor.", "username");
    throw new UserError("Bu e-posta adresi başka bir kullanıcıda kayıtlı.", "email");
  }
  const role = await tx.role.findUniqueOrThrow({ where: { code: a.role } });
  const tempPassword = generateTempPassword(12);
  const user = await tx.user.create({
    data: {
      username,
      fullName: a.fullName,
      email,
      phone: a.phone ?? null,
      chamberId: a.chamberId,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      roles: { create: { roleId: role.id } },
      ...(a.supplierId ? { supplierUser: { create: { supplierId: a.supplierId } } } : {}),
      ...(a.memberId ? { memberUser: { create: { memberId: a.memberId } } } : {}),
    },
  });
  return { user, username, tempPassword };
}

/** Kullanıcıya yeni geçici şifre verir, kilidi açar ve tüm oturumlarını kapatır */
export async function issueTempPassword(tx: Tx, userId: string) {
  const tempPassword = generateTempPassword(12);
  await tx.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await tx.session.deleteMany({ where: { userId } });
  return tempPassword;
}

export function credentialsData(username: string, tempPassword: string) {
  return { username, tempPassword };
}
