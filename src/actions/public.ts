"use server";

/**
 * Herkese açık (oturumsuz) sunucu işlemleri: üyelik ve tedarikçi başvuruları.
 * Doğrulama, KVKK onayı, bot tuzağı ve IP sınırı servis katmanındadır.
 */
import { runPublicAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-types";
import { formToObject } from "@/lib/validation";
import { submitMemberApplication, submitSupplierApplication } from "@/modules/applications/service";

export async function submitMemberApplicationAction(_: ActionState, fd: FormData) {
  return runPublicAction(async (ip) => {
    await submitMemberApplication(formToObject(fd), ip);
    return { message: "Başvurunuz alındı. Oda incelemesinden sonra size kullanıcı adı ve geçici şifre iletilecektir." };
  });
}

export async function submitSupplierApplicationAction(_: ActionState, fd: FormData) {
  return runPublicAction(async (ip) => {
    await submitSupplierApplication(formToObject(fd), ip);
    return {
      message:
        "Firma başvurunuz alındı. Oda incelemesinden sonra firma paneli için kullanıcı adı ve geçici şifre iletilecektir.",
    };
  });
}
