const TZ = "Europe/Istanbul";

type Dec = { toString(): string } | number | string | null | undefined;

export function fmtDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("tr-TR", { timeZone: TZ }) : "—";
}

export function fmtDateTime(d: Date | null | undefined): string {
  return d ? d.toLocaleString("tr-TR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—";
}

export function fmtMoney(v: Dec): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v.toString());
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 });
}

export function fmtNumber(v: Dec, maxFraction = 3): string {
  if (v === null || v === undefined) return "—";
  return Number(v.toString()).toLocaleString("tr-TR", { maximumFractionDigits: maxFraction });
}

/** <input type="date"> için YYYY-MM-DD (İstanbul saatine göre) */
export function dateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** <input type="datetime-local"> için YYYY-MM-DDTHH:mm */
export function dateTimeInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T");
}

/** Para alanını forma "450,50" biçiminde yazar */
export function moneyInput(v: Dec): string {
  if (v === null || v === undefined) return "";
  return Number(v.toString()).toFixed(2).replace(".", ",");
}

export function currentPeriod(): string {
  return dateInput(new Date()).slice(0, 7);
}

export const MEMBER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Başvuru", tone: "amber" },
  ACTIVE: { label: "Aktif", tone: "green" },
  PASSIVE: { label: "Pasif", tone: "slate" },
  REJECTED: { label: "Reddedildi", tone: "red" },
};
export const SUPPLIER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Başvuru", tone: "amber" },
  APPROVED: { label: "Aktif", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  SUSPENDED: { label: "Askıda", tone: "slate" },
};
export const DUE_STATUS: Record<string, { label: string; tone: Tone }> = {
  UNPAID: { label: "Ödenmedi", tone: "amber" },
  PAID: { label: "Ödendi", tone: "green" },
  WAIVED: { label: "Muaf", tone: "slate" },
};
export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Aktif", tone: "green" },
  PASSIVE: { label: "Pasif", tone: "slate" },
  LOCKED: { label: "Kilitli", tone: "red" },
};
export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  ACTIVE: { label: "Yayında", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  ARCHIVED: { label: "Arşivde", tone: "slate" },
};
export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Bekliyor", tone: "amber" },
  APPROVED: { label: "Onaylandı", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
};
export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Taslak", tone: "slate" },
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  APPROVED: { label: "Onaylandı", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  ENDED: { label: "Sona erdi", tone: "slate" },
};
export const CAMPAIGN_TYPE: Record<string, string> = {
  CHAMBER_SPECIAL: "Odaya özel fiyat",
  VOLUME: "Toplu alım (kademeli)",
  DATE_RANGE: "Tarih aralıklı fırsat",
};
export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  CONFIRMED: { label: "Onaylandı", tone: "blue" },
  PREPARING: { label: "Hazırlanıyor", tone: "blue" },
  SHIPPED: { label: "Dağıtımda", tone: "blue" },
  DELIVERED: { label: "Teslim edildi", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  CANCELLED: { label: "İptal", tone: "slate" },
};
export const AUDIENCE: Record<string, string> = {
  ALL: "Herkes",
  MEMBERS: "Üyeler",
  SUPPLIERS: "Tedarikçiler",
  STAFF: "Oda personeli",
};
export const UNIT_TYPE: Record<string, string> = { ADET: "Adet", KG: "Kg", LITRE: "Litre", PAKET: "Paket" };
export const PACK_TYPE: Record<string, string> = { ADET: "Adet", KOLI: "Koli", KG: "Kg", PAKET: "Paket" };

export type Tone = "green" | "amber" | "red" | "slate" | "blue";
