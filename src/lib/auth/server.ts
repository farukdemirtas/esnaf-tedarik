import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import type { PanelKey, PermissionCode } from "@/lib/permissions";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { SESSION_COOKIE } from "@/modules/auth/session";

import { ForbiddenError } from "@/lib/errors";
export { ForbiddenError };

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  // Ters vekil (Nginx) arkasında: yalnızca güvenilen vekilin eklediği ilk değer kullanılır
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** İstek başına bir kez oturum çözülür */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return buildAuthContext(token);
});

export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/giris");
  if (auth.mustChangePassword && !opts.allowPasswordChange) redirect("/sifre-degistir");
  return auth;
}

/** Sayfa koruması: panel izni yoksa yetkisiz sayfasına yönlendirir ve kaydeder */
export async function requirePanel(panel: PanelKey): Promise<AuthContext> {
  const auth = await requireUser();
  if (!auth.permissions.has(`panel.${panel}`)) {
    await audit({
      userId: auth.userId,
      action: "access.denied",
      data: { panel, path: (await headers()).get("x-pathname") },
      ip: await getClientIp(),
    });
    redirect("/yetkisiz");
  }
  return auth;
}

export function hasPermission(auth: AuthContext, code: PermissionCode): boolean {
  return auth.permissions.has(code);
}

/** İşlem (server action / API) koruması: izin yoksa hata fırlatır ve kaydeder */
export async function requirePermission(code: PermissionCode): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ForbiddenError("Oturum bulunamadı.");
  if (auth.mustChangePassword) throw new ForbiddenError("Önce şifrenizi değiştirmelisiniz.");
  if (!auth.permissions.has(code)) {
    await audit({ userId: auth.userId, action: "access.denied", data: { permission: code }, ip: await getClientIp() });
    throw new ForbiddenError();
  }
  return auth;
}
