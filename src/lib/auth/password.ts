import { hash, verify } from "@node-rs/argon2";

// OWASP önerisi: Argon2id, 19 MiB bellek, 2 iterasyon, 1 paralellik
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}

/** Kullanıcı bilmediğinde de zamanlama farkı oluşmasın diye sabit sahte özet */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword("zamanlama-dengeleme-icin-sahte");
  await verifyPassword(await dummyHash, plain);
}

export const PASSWORD_MIN_LENGTH = 10;

/** Şifre politikası: en az 10 karakter, harf ve rakam içermeli, kullanıcı adını içermemeli. */
export function checkPasswordPolicy(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır.`;
  if (password.length > 128) return "Şifre en fazla 128 karakter olabilir.";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Şifre en az bir harf ve bir rakam içermelidir.";
  if (username && password.toLocaleLowerCase("tr").includes(username.toLocaleLowerCase("tr")))
    return "Şifre kullanıcı adınızı içeremez.";
  return null;
}

/** Okunması kolay geçici şifre üretir (karışan karakterler çıkarıldı). */
export function generateTempPassword(length = 12): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  const chars = Array.from(bytes, (b) => all[b % all.length]);
  chars[0] = letters[bytes[0] % letters.length];
  chars[length - 1] = digits[bytes[length - 1] % digits.length];
  return chars.join("");
}
