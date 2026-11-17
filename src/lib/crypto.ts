import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Oturum ve sıfırlama token'ları: istemciye ham değer, veritabanına SHA-256 özeti */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY tanımlı değil");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY 32 bayt (base64) olmalı");
  return k;
}

/** Hassas alan şifreleme (AES-256-GCM). Biçim: v1.iv.tag.veri (base64url) */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptField(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Geçersiz şifreli veri");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Ekranda ve loglarda gösterim: 12345678901 → 123******01 */
export function maskId(value: string): string {
  if (value.length <= 5) return "*".repeat(value.length);
  return value.slice(0, 3) + "*".repeat(value.length - 5) + value.slice(-2);
}
