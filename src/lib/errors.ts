/** Kullanıcıya olduğu gibi gösterilebilecek iş kuralı hatası */
export class UserError extends Error {
  constructor(
    message: string,
    public field?: string,
    /** Birden çok alanda hata (örn. toplu fiyat güncelleme) */
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Bu işlem için yetkiniz yok.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Kayıt bulunamadı.") {
    super(message);
    this.name = "NotFoundError";
  }
}
