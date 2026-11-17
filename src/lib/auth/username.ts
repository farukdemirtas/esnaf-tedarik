/**
 * Kullanıcı adı normalizasyonu. Türkçe yerel ayarındaki I/ı/İ/i farkı yüzünden
 * "TEST" ile "test" eşleşmeme sorununu önlemek için bu dört harf "i"ye katlanır,
 * ardından yerelden bağımsız küçük harfe çevrilir. Kayıt ve giriş aynı fonksiyonu kullanır.
 */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/[Iıİ]/g, "i").toLowerCase();
}

/** Kullanıcı adı: 3–50 karakter, harf/rakam/nokta/tire/alt çizgi (veya e-posta) */
export function isValidUsername(u: string): boolean {
  return /^[a-z0-9._@-]{3,50}$/.test(u);
}
