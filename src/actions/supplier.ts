"use server";

/**
 * Tedarikçi paneli sunucu işlemleri. Yetki ve firma kapsamı servis katmanında kontrol edilir.
 */
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-types";
import { UserError } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import * as self from "@/modules/suppliers/self";
import * as offers from "@/modules/catalog/offers-supplier";
import * as campaigns from "@/modules/campaigns/supplier";
import * as orders from "@/modules/orders/supplier";
import * as inbox from "@/modules/notifications/inbox";

type S = ActionState;
const id = (fd: FormData) => {
  const v = fd.get("id");
  if (typeof v !== "string" || !v) throw new UserError("Kayıt belirtilmedi.");
  return v;
};
async function fileBuffer(fd: FormData, name: string): Promise<Buffer | null> {
  const f = fd.get(name);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return Buffer.from(await f.arrayBuffer());
}

// ───────────── Firma profili, bölgeler, kullanıcılar ─────────────

export async function updateMyProfileAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await self.updateMyProfile(auth, formToObject(fd));
    return { message: "Firma bilgileri kaydedildi." };
  });
}
export async function updateMyLogoAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const remove = fd.get("remove") === "1";
    const buf = remove ? null : await fileBuffer(fd, "logo");
    if (!remove && !buf) throw new UserError("Bir logo dosyası seçin.", "logo");
    await self.updateMyLogo(auth, buf);
    return { message: remove ? "Logo kaldırıldı." : "Logo yüklendi." };
  });
}
export async function saveDeliveryAreaAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await self.saveDeliveryArea(auth, formToObject(fd));
    return { message: "Hizmet bölgesi kaydedildi." };
  });
}
export async function deleteDeliveryAreaAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await self.deleteDeliveryArea(auth, id(fd));
    return { message: "Bölge kaldırıldı." };
  });
}
export async function addAllDistrictsAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const n = await self.addAllDistricts(auth, formToObject(fd));
    return { message: n ? `${n} ilçe eklendi.` : "Tüm ilçeler zaten ekli." };
  });
}
export async function addMyUserAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await self.addMyUser(auth, formToObject(fd));
    return { message: "Kullanıcı eklendi.", data: r };
  });
}
export async function setMyUserActiveAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const active = fd.get("active") === "1";
    await self.setMyUserActive(auth, id(fd), active);
    return { message: active ? "Kullanıcı aktifleştirildi." : "Kullanıcı pasife alındı." };
  });
}
export async function resetMyUserPasswordAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await self.resetMyUserPassword(auth, id(fd));
    return { message: "Yeni geçici şifre oluşturuldu.", data: r };
  });
}

// ───────────── Ürünler (teklifler) ─────────────

export async function createOfferAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const o = await offers.createOffer(auth, formToObject(fd));
    return { message: "Ürün satışa açıldı.", redirectTo: `/tedarikci/urunler/${o.id}?yeni=1` };
  });
}
export async function updateOfferDetailsAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await offers.updateOfferDetails(auth, id(fd), formToObject(fd));
    return { message: "Ürün bilgileri kaydedildi." };
  });
}
export async function updatePriceStockAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const ch = await offers.updatePriceStock(auth, id(fd), formToObject(fd));
    return { message: Object.keys(ch).length ? "Fiyat / stok güncellendi." : "Değişiklik yok." };
  });
}
export async function bulkPriceStockAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const n = await offers.bulkUpdatePriceStock(auth, formToObject(fd));
    return { message: n ? `${n} ürün güncellendi.` : "Değişiklik yok." };
  });
}
export async function setOfferActiveAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const active = fd.get("active") === "1";
    await offers.setOfferActive(auth, id(fd), active);
    return { message: active ? "Ürün satışa açıldı." : "Ürün satıştan kaldırıldı." };
  });
}
export async function createProductRequestAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await offers.createProductRequest(auth, formToObject(fd), await fileBuffer(fd, "image"));
    return { message: "Talebiniz Oda'ya iletildi. Onaylandığında bildirim alacaksınız." };
  });
}
export async function cancelProductRequestAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await offers.cancelProductRequest(auth, id(fd));
    return { message: "Talep geri çekildi." };
  });
}

// ───────────── Kampanyalar ─────────────

export async function createMyCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const c = await campaigns.createMyCampaign(auth, formToObject(fd));
    return { message: "Kampanya taslağı oluşturuldu.", redirectTo: `/tedarikci/kampanyalar/${c.id}` };
  });
}
export async function updateMyCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.updateMyCampaign(auth, id(fd), formToObject(fd));
    return { message: "Kampanya kaydedildi." };
  });
}
export async function addMyDiscountAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.addMyDiscount(auth, id(fd), formToObject(fd));
    return { message: "İndirimli ürün eklendi." };
  });
}
export async function removeMyDiscountAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.removeMyDiscount(auth, id(fd));
    return { message: "İndirim kaldırıldı." };
  });
}
export async function submitMyCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.submitMyCampaign(auth, id(fd));
    return { message: "Kampanya Oda onayına gönderildi." };
  });
}
export async function withdrawMyCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.withdrawMyCampaign(auth, id(fd));
    return { message: "Kampanya onaydan geri çekildi; yeniden düzenleyebilirsiniz." };
  });
}
export async function deleteMyCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.deleteMyCampaign(auth, id(fd));
    return { message: "Kampanya silindi.", redirectTo: "/tedarikci/kampanyalar" };
  });
}
export async function endMyCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.endMyCampaign(auth, id(fd));
    return { message: "Kampanya sonlandırıldı." };
  });
}

// ───────────── Siparişler ─────────────

export async function changeOrderStatusAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await orders.changeSupplierOrderStatus(auth, id(fd), formToObject(fd));
    return { message: "Sipariş durumu güncellendi; üyeye bildirildi." };
  });
}
export async function updateSupplierNoteAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await orders.updateSupplierNote(auth, id(fd), formToObject(fd));
    return { message: "Kaydedildi." };
  });
}
export async function addInvoiceAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await orders.addInvoice(auth, id(fd), formToObject(fd), await fileBuffer(fd, "file"));
    return { message: "Belge kaydedildi." };
  });
}
export async function deleteInvoiceAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await orders.deleteInvoice(auth, id(fd));
    return { message: "Belge kaydı silindi." };
  });
}

// ───────────── Bildirimler (tüm paneller) ─────────────

export async function markNotificationReadAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await inbox.markNotificationRead(auth, id(fd));
    return { message: "Okundu." };
  });
}
export async function markAllNotificationsReadAction() {
  return runAction(async (auth) => {
    const n = await inbox.markAllNotificationsRead(auth);
    return { message: n ? `${n} bildirim okundu olarak işaretlendi.` : "Okunmamış bildirim yok." };
  });
}
