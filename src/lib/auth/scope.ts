import type { AuthContext } from "@/modules/auth/context";

/**
 * Satır düzeyi kapsam yardımcıları.
 * Tedarikçi ve üye sorguları HER ZAMAN bu filtrelerle yapılır; böylece
 * URL'deki kimliği değiştirerek başka firmanın/üyenin kaydına erişilemez (IDOR).
 */

export class ScopeError extends Error {
  constructor(message = "Bu kayda erişim yetkiniz yok.") {
    super(message);
    this.name = "ScopeError";
  }
}

export function supplierIdOf(auth: AuthContext): string {
  if (!auth.supplier) throw new ScopeError("Bu işlem yalnızca tedarikçi hesapları içindir.");
  return auth.supplier.id;
}

export function memberIdOf(auth: AuthContext): string {
  if (!auth.member) throw new ScopeError("Bu işlem yalnızca üye hesapları içindir.");
  return auth.member.id;
}

export function chamberIdOf(auth: AuthContext): string {
  if (!auth.chamberId) throw new ScopeError("Oda bilgisi bulunamadı.");
  return auth.chamberId;
}

/** Prisma where filtresi: { supplierId } */
export function supplierScope(auth: AuthContext) {
  return { supplierId: supplierIdOf(auth) };
}

/** Prisma where filtresi: { memberId } */
export function memberScope(auth: AuthContext) {
  return { memberId: memberIdOf(auth) };
}

export function assertSupplierOwns(auth: AuthContext, record: { supplierId: string } | null | undefined) {
  if (!record || record.supplierId !== supplierIdOf(auth)) throw new ScopeError();
}

export function assertMemberOwns(auth: AuthContext, record: { memberId: string } | null | undefined) {
  if (!record || record.memberId !== memberIdOf(auth)) throw new ScopeError();
}
