"use server";

/**
 * Gelir modeli (Aşama 6) sunucu işlemleri: paketler, reklamlar, sponsorlu ürünler, dijital kataloglar.
 * Yetki ve kapsam kontrolleri servis katmanındadır.
 */
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-types";
import { UserError } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import * as packages from "@/modules/revenue/packages";
import * as ads from "@/modules/revenue/ads";
import * as sponsored from "@/modules/revenue/sponsored";
import * as catalogs from "@/modules/revenue/catalogs";

type S = ActionState;
const id = (fd: FormData, name = "id") => {
  const v = fd.get(name);
  if (typeof v !== "string" || !v) throw new UserError("Kayıt belirtilmedi.");
  return v;
};
async function fileBuffer(fd: FormData, name: string): Promise<Buffer | null> {
  const f = fd.get(name);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return Buffer.from(await f.arrayBuffer());
}

// ───────────── Oda: paketler ─────────────

export async function createPackageAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.createPackage(auth, formToObject(fd));
    return { message: "Paket oluşturuldu." };
  });
}
export async function updatePackageAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.updatePackage(auth, id(fd), formToObject(fd));
    return { message: "Paket güncellendi." };
  });
}
export async function setDefaultProductLimitAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.setDefaultProductLimit(auth, formToObject(fd));
    return { message: "Varsayılan ürün limiti kaydedildi." };
  });
}
export async function approveSubscriptionAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.approveSubscription(auth, id(fd), formToObject(fd));
    return { message: "Paket aktifleştirildi." };
  });
}
export async function rejectSubscriptionAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.rejectSubscription(auth, id(fd), formToObject(fd));
    return { message: "Paket kaydı iptal edildi." };
  });
}
export async function assignSubscriptionAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.assignSubscription(auth, formToObject(fd));
    return { message: "Paket tedarikçiye tanımlandı." };
  });
}

// ───────────── Oda: reklamlar ve sponsorlu ürünler ─────────────

export async function createAdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await ads.createAd(auth, formToObject(fd), await fileBuffer(fd, "image"));
    return { message: "Reklam yayına alındı." };
  });
}
export async function approveAdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await ads.approveAd(auth, id(fd), formToObject(fd));
    return { message: "Reklam onaylandı." };
  });
}
export async function rejectAdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await ads.rejectAd(auth, id(fd), formToObject(fd));
    return { message: "Reklam reddedildi." };
  });
}
export async function endAdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await ads.endAd(auth, id(fd));
    return { message: "Reklam yayından kaldırıldı." };
  });
}
export async function odaAddSponsoredAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await sponsored.odaAddSponsored(auth, formToObject(fd));
    return { message: "Sponsorlu ürün eklendi." };
  });
}
export async function odaSetSponsoredActiveAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const active = fd.get("active") === "1";
    await sponsored.odaSetSponsoredActive(auth, id(fd), active);
    return { message: active ? "Yeniden yayına alındı." : "Yayından kaldırıldı." };
  });
}

// ───────────── Oda: katalog onayı ─────────────

export async function reviewCatalogAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const decision = fd.get("decision");
    if (decision !== "approve" && decision !== "reject" && decision !== "end") throw new UserError("Geçersiz işlem.");
    await catalogs.reviewCatalog(auth, id(fd), decision, formToObject(fd));
    return { message: decision === "approve" ? "Katalog onaylandı." : decision === "reject" ? "Katalog reddedildi." : "Katalog yayından kaldırıldı." };
  });
}

// ───────────── Tedarikçi ─────────────

export async function requestPackageAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.requestPackage(auth, formToObject(fd));
    return { message: "Paket talebiniz Oda'ya iletildi. Ödeme ve onay sonrası aktifleşir." };
  });
}
export async function cancelMyPackageRequestAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await packages.cancelMyPackageRequest(auth, id(fd));
    return { message: "Talep geri çekildi." };
  });
}
export async function requestAdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await ads.requestAd(auth, formToObject(fd), await fileBuffer(fd, "image"));
    return { message: "Reklam talebiniz Oda onayına gönderildi." };
  });
}
export async function withdrawMyAdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await ads.withdrawMyAd(auth, id(fd));
    return { message: "Reklam silindi." };
  });
}
export async function addMySponsoredAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await sponsored.addMySponsored(auth, formToObject(fd));
    return { message: "Ürün sponsorlu olarak öne çıkarıldı." };
  });
}
export async function stopMySponsoredAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await sponsored.stopMySponsored(auth, id(fd));
    return { message: "Sponsorluk durduruldu." };
  });
}
export async function createMyCatalogAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const c = await catalogs.createMyCatalog(auth, formToObject(fd), await fileBuffer(fd, "cover"), await fileBuffer(fd, "pdf"));
    return { redirectTo: `/tedarikci/kataloglar/${c.id}` };
  });
}
export async function addMyCatalogItemAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await catalogs.addMyCatalogItem(auth, id(fd), formToObject(fd));
    return { message: "Ürün kataloğa eklendi." };
  });
}
export async function removeMyCatalogItemAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await catalogs.removeMyCatalogItem(auth, id(fd), id(fd, "supplierProductId"));
    return { message: "Ürün katalogdan çıkarıldı." };
  });
}
export async function deleteMyCatalogAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await catalogs.deleteMyCatalog(auth, id(fd));
    return { redirectTo: "/tedarikci/kataloglar" };
  });
}
export async function endMyCatalogAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await catalogs.endMyCatalog(auth, id(fd));
    return { message: "Katalog yayından kaldırıldı." };
  });
}
