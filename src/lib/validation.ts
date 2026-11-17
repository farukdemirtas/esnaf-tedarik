import { z } from "zod";

/** Türkçe doğrulama mesajları */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: "Bu alan zorunludur." };
      return { message: "Geçersiz değer." };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string")
        return { message: issue.minimum === 1 ? "Bu alan zorunludur." : `En az ${issue.minimum} karakter olmalıdır.` };
      if (issue.type === "number") return { message: `En az ${issue.minimum} olmalıdır.` };
      if (issue.type === "array") return { message: `En az ${issue.minimum} seçim yapılmalıdır.` };
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `En fazla ${issue.maximum} karakter olabilir.` };
      if (issue.type === "number") return { message: `En fazla ${issue.maximum} olabilir.` };
      break;
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Geçerli bir e-posta adresi girin." };
      break;
    case z.ZodIssueCode.invalid_enum_value:
      return { message: "Geçerli bir seçim yapın." };
  }
  return { message: ctx.defaultError };
});

/** Türkiye saati (UTC+3, yaz saati uygulaması yok) */
export const TZ_OFFSET = "+03:00";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const zText = (max = 200, min = 1) => z.string({ required_error: "Bu alan zorunludur." }).trim().min(min).max(max);
export const zOptText = (max = 500) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
export const zId = z.string().min(1).max(40);
export const zOptId = z.preprocess(emptyToUndef, z.string().min(1).max(40).optional());
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());

const normalizeNumber = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s/g, "").replace(",", ".") : v);

/** Para: "450", "450,50", "450.5" → "450.50" biçiminde string (Decimal için) */
export const zMoney = z.preprocess(
  normalizeNumber,
  z
    .string({ required_error: "Bu alan zorunludur." })
    .min(1, "Bu alan zorunludur.")
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "Geçerli bir tutar girin (örn. 450 veya 450,50)."),
);
export const zOptMoney = z.preprocess(emptyToUndef, zMoney.optional());

/** Miktar: en fazla 3 ondalık (kg için) */
export const zQuantity = z.preprocess(
  normalizeNumber,
  z
    .string({ required_error: "Bu alan zorunludur." })
    .min(1, "Bu alan zorunludur.")
    .regex(/^\d{1,7}(\.\d{1,3})?$/, "Geçerli bir miktar girin."),
);
export const zOptQuantity = z.preprocess(emptyToUndef, zQuantity.optional());

export const zInt = (min: number, max: number) =>
  z.preprocess(emptyToUndef, z.coerce.number({ required_error: "Bu alan zorunludur." }).int("Tam sayı girin.").min(min).max(max));

export const zDate = z.preprocess(
  emptyToUndef,
  z
    .string({ required_error: "Bu alan zorunludur." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçerli bir tarih girin.")
    .transform((v) => new Date(`${v}T00:00:00${TZ_OFFSET}`)),
);
export const zOptDate = z.preprocess(
  emptyToUndef,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçerli bir tarih girin.")
    .transform((v) => new Date(`${v}T00:00:00${TZ_OFFSET}`))
    .optional(),
);
export const zDateTime = z.preprocess(
  emptyToUndef,
  z
    .string({ required_error: "Bu alan zorunludur." })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Geçerli bir tarih ve saat girin.")
    .transform((v) => new Date(`${v}:00${TZ_OFFSET}`)),
);
export const zOptDateTime = z.preprocess(
  emptyToUndef,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Geçerli bir tarih ve saat girin.")
    .transform((v) => new Date(`${v}:00${TZ_OFFSET}`))
    .optional(),
);

export const zPhone = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s()-]/g, "") : v),
  z.string({ required_error: "Bu alan zorunludur." }).regex(/^\+?\d{10,15}$/, "Geçerli bir telefon numarası girin (örn. 05321234567)."),
);
export const zOptPhone = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.replace(/[\s()-]/g, "")) : v),
  z.string().regex(/^\+?\d{10,15}$/, "Geçerli bir telefon numarası girin.").optional(),
);
export const zOptEmail = z.preprocess(emptyToUndef, z.string().trim().toLowerCase().email().max(150).optional());
export const zEmail = z.string({ required_error: "Bu alan zorunludur." }).trim().toLowerCase().email().max(150);
export const zTaxNumber = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\s/g, "") : v),
  z.string({ required_error: "Bu alan zorunludur." }).regex(/^\d{10,11}$/, "Vergi/TC kimlik numarası 10 veya 11 haneli olmalıdır."),
);
export const zOptTaxNumber = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.replace(/\s/g, "")) : v),
  z.string().regex(/^\d{10,11}$/, "Vergi/TC kimlik numarası 10 veya 11 haneli olmalıdır.").optional(),
);
export const zOptBarcode = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.replace(/\s/g, "")) : v),
  z.string().regex(/^\d{8,14}$/, "Barkod 8-14 haneli rakamlardan oluşmalıdır.").optional(),
);
export const zPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Dönem YYYY-AA biçiminde olmalıdır (örn. 2026-11).");

/** FormData → düz nesne. Aynı isimli birden çok alan diziye dönüşür; boş dosya alanları atlanır. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string" && value.size === 0) continue;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else out[key] = value;
  }
  return out;
}

export function pageArgs(page: unknown, size = 25) {
  const p = Math.max(1, Math.min(10_000, Number.parseInt(String(page ?? "1"), 10) || 1));
  return { page: p, skip: (p - 1) * size, take: size, size };
}

export { z };
