import "server-only";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import type { ActionState } from "./action-types";
import { audit } from "./audit";
import { getAuth, getClientIp } from "./auth/server";
import { ScopeError } from "./auth/scope";
import { ForbiddenError, NotFoundError, UserError } from "./errors";
import type { AuthContext } from "@/modules/auth/context";

export interface ActionResult {
  message?: string;
  data?: Record<string, string>;
  redirectTo?: string;
}

const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
  barcode: "Bu barkod başka bir üründe kayıtlı.",
  taxNumber: "Bu vergi numarasıyla kayıtlı bir firma var.",
  username: "Bu kullanıcı adı zaten kullanılıyor.",
  email: "Bu e-posta adresi başka bir kullanıcıda kayıtlı.",
  name: "Bu isimde bir kayıt zaten var.",
  slug: "Bu isimde bir kayıt zaten var.",
  registryNumber: "Bu oda sicil numarasıyla kayıtlı bir üye var.",
  period: "Bu üye için bu döneme ait aidat kaydı zaten var.",
};

/** Hataları kullanıcıya gösterilebilir ActionState'e çevirir */
export async function toActionState(e: unknown, auth: AuthContext | null): Promise<ActionState> {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = String(issue.path[0] ?? "_");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, message: "Lütfen işaretli alanları kontrol edin.", fieldErrors };
  }
  if (e instanceof UserError)
    return { ok: false, message: e.message, fieldErrors: e.fieldErrors ?? (e.field ? { [e.field]: e.message } : undefined) };
  if (e instanceof ForbiddenError || e instanceof ScopeError) {
    await audit({ userId: auth?.userId, action: "access.denied", data: { reason: e.message }, ip: await getClientIp() });
    return { ok: false, message: e.message };
  }
  if (e instanceof NotFoundError) return { ok: false, message: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = ([] as string[]).concat((e.meta?.target as string[] | string) ?? []);
      const field = target.find((t) => UNIQUE_FIELD_MESSAGES[t]);
      const message = field ? UNIQUE_FIELD_MESSAGES[field] : "Bu kayıt zaten mevcut.";
      return { ok: false, message, fieldErrors: field ? { [field]: message } : undefined };
    }
    if (e.code === "P2003") return { ok: false, message: "Bağlı kayıtlar bulunduğu için bu işlem yapılamaz." };
    if (e.code === "P2025") return { ok: false, message: "Kayıt bulunamadı veya değiştirilmiş." };
  }
  console.error("[action]", e);
  return { ok: false, message: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
}

/**
 * Oturumlu sunucu işlemi çalıştırıcı. Yetki kontrolü servis katmanında yapılır;
 * burada oturum doğrulanır, hatalar Türkçe mesaja çevrilir ve sayfa verisi yenilenir.
 */
export async function runAction(fn: (auth: AuthContext) => Promise<ActionResult | void>): Promise<ActionState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, message: "Oturumunuz sona ermiş. Lütfen yeniden giriş yapın." };
  if (auth.mustChangePassword) return { ok: false, message: "Önce şifrenizi değiştirmelisiniz." };
  let result: ActionResult;
  try {
    result = (await fn(auth)) ?? {};
  } catch (e) {
    return toActionState(e, auth);
  }
  revalidatePath("/", "layout");
  if (result.redirectTo) redirect(result.redirectTo);
  return { ok: true, message: result.message ?? "Kaydedildi.", data: result.data };
}

/** Oturum gerektirmeyen (başvuru formları gibi) işlemler */
export async function runPublicAction(fn: (ip: string | null) => Promise<ActionResult | void>): Promise<ActionState> {
  const ip = await getClientIp();
  let result: ActionResult;
  try {
    result = (await fn(ip)) ?? {};
  } catch (e) {
    return toActionState(e, null);
  }
  if (result.redirectTo) redirect(result.redirectTo);
  return { ok: true, message: result.message ?? "Gönderildi.", data: result.data };
}
