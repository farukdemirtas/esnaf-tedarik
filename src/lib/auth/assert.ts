import { ForbiddenError } from "@/lib/errors";
import type { PermissionCode } from "@/lib/permissions";
import type { AuthContext } from "@/modules/auth/context";

/**
 * Servis katmanı yetki kontrolü. Her servis fonksiyonu ilk iş olarak bunu çağırır;
 * böylece kontrol arayüzden bağımsızdır ve testlerle doğrulanabilir.
 */
export function assertPermission(auth: AuthContext, code: PermissionCode): void {
  if (!auth.permissions.has(code)) throw new ForbiddenError();
}

export function hasRole(auth: AuthContext, ...codes: string[]): boolean {
  return auth.roles.some((r) => codes.includes(r));
}
