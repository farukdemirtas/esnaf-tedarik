"use server";

/**
 * Oda arka ofis sunucu işlemleri. Her işlem yalnızca servis fonksiyonunu çağırır;
 * yetki ve kapsam kontrolü servis katmanındadır.
 */
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-types";
import { UserError } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import * as members from "@/modules/members/service";
import * as dues from "@/modules/members/dues-admin";
import * as suppliers from "@/modules/suppliers/service";
import * as taxonomy from "@/modules/catalog/taxonomy";
import * as products from "@/modules/catalog/products";
import * as offers from "@/modules/catalog/offers-admin";
import * as campaigns from "@/modules/campaigns/review";
import * as announcements from "@/modules/announcements/service";
import * as users from "@/modules/users/service";
import * as admin from "@/modules/admin/service";

type S = ActionState;
const id = (fd: FormData) => {
  const v = fd.get("id");
  if (typeof v !== "string" || !v) throw new UserError("Kayıt belirtilmedi.");
  return v;
};
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

async function fileBuffer(fd: FormData, name: string): Promise<Buffer | null> {
  const f = fd.get(name);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return Buffer.from(await f.arrayBuffer());
}

// ───────────── Üyeler ─────────────

export async function createMemberAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await members.createMember(auth, formToObject(fd));
    return { message: `${r.member.businessName} eklendi.`, data: { username: r.username, tempPassword: r.tempPassword, href: `uyeler/${r.member.id}` } };
  });
}
export async function updateMemberAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await members.updateMember(auth, id(fd), formToObject(fd));
    return { message: "Üye bilgileri güncellendi." };
  });
}
export async function approveMemberAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const creds = await members.approveMember(auth, id(fd), formToObject(fd));
    return { message: "Üyelik onaylandı.", data: creds ?? undefined };
  });
}
export async function rejectMemberAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await members.rejectMember(auth, id(fd), formToObject(fd));
    return { message: "Başvuru reddedildi." };
  });
}
export async function setMemberActiveAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const active = fd.get("active") === "1";
    await members.setMemberActive(auth, id(fd), active, formToObject(fd));
    return { message: active ? "Üye aktifleştirildi." : "Üye pasife alındı; açık oturumları kapatıldı." };
  });
}
export async function resetMemberPasswordAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await members.resetMemberUserPassword(auth, id(fd));
    return { message: "Yeni geçici şifre oluşturuldu.", data: r };
  });
}
export async function memberResetLinkAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const link = await members.createMemberResetLink(auth, id(fd), appUrl());
    return { message: "Şifre yenileme bağlantısı oluşturuldu.", data: { resetLink: link } };
  });
}
export async function addAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await members.addAddress(auth, id(fd), formToObject(fd));
    return { message: "Adres eklendi." };
  });
}
export async function deleteAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await members.deleteAddress(auth, id(fd));
    return { message: "Adres silindi." };
  });
}
export async function setDefaultAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await members.setDefaultAddress(auth, id(fd));
    return { message: "Varsayılan adres değiştirildi." };
  });
}

// ───────────── Aidatlar ─────────────

export async function createDuesPeriodAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await dues.createDuesForPeriod(auth, formToObject(fd));
    return { message: `${r.created} üye için aidat kaydı oluşturuldu${r.skipped ? `; ${r.skipped} üyede bu dönem zaten kayıtlıydı` : ""}.` };
  });
}
export async function addDueAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await dues.addDue(auth, id(fd), formToObject(fd));
    return { message: "Aidat kaydı eklendi." };
  });
}
export async function markDuePaidAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await dues.markDuePaid(auth, id(fd), formToObject(fd));
    return { message: "Ödendi olarak işaretlendi." };
  });
}
export async function waiveDueAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await dues.waiveDue(auth, id(fd), formToObject(fd));
    return { message: "Muaf tutuldu." };
  });
}
export async function reopenDueAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await dues.reopenDue(auth, id(fd));
    return { message: "Ödenmedi durumuna alındı." };
  });
}
export async function deleteDueAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await dues.deleteDue(auth, id(fd));
    return { message: "Kayıt silindi." };
  });
}

// ───────────── Tedarikçiler ─────────────

export async function createSupplierAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await suppliers.createSupplier(auth, formToObject(fd));
    return { message: `${r.supplier.tradeName} eklendi.`, data: { username: r.username, tempPassword: r.tempPassword, href: `tedarikciler/${r.supplier.id}` } };
  });
}
export async function updateSupplierAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await suppliers.updateSupplier(auth, id(fd), formToObject(fd));
    return { message: "Firma bilgileri güncellendi." };
  });
}
export async function approveSupplierAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const creds = await suppliers.approveSupplier(auth, id(fd), formToObject(fd));
    return { message: "Tedarikçi onaylandı.", data: creds ?? undefined };
  });
}
export async function rejectSupplierAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await suppliers.rejectSupplier(auth, id(fd), formToObject(fd));
    return { message: "Başvuru reddedildi." };
  });
}
export async function setSupplierSuspendedAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const suspended = fd.get("suspended") === "1";
    await suppliers.setSupplierSuspended(auth, id(fd), suspended, formToObject(fd));
    return { message: suspended ? "Firma askıya alındı; kullanıcılarının oturumları kapatıldı." : "Firma yeniden aktif." };
  });
}
export async function addSupplierUserAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await suppliers.addSupplierUser(auth, id(fd), formToObject(fd));
    return { message: "Kullanıcı eklendi.", data: r };
  });
}
export async function resetSupplierUserPasswordAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await suppliers.resetSupplierUserPassword(auth, id(fd));
    return { message: "Yeni geçici şifre oluşturuldu.", data: r };
  });
}
export async function setSupplierUserActiveAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const active = fd.get("active") === "1";
    await suppliers.setSupplierUserActive(auth, id(fd), active);
    return { message: active ? "Kullanıcı aktifleştirildi." : "Kullanıcı pasife alındı." };
  });
}

// ───────────── Kategoriler ve markalar ─────────────

export async function createCategoryAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await taxonomy.createCategory(auth, formToObject(fd));
    return { message: "Kategori eklendi." };
  });
}
export async function updateCategoryAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await taxonomy.updateCategory(auth, id(fd), formToObject(fd));
    return { message: "Kategori güncellendi." };
  });
}
export async function deleteCategoryAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await taxonomy.deleteCategory(auth, id(fd));
    return { message: "Kategori silindi." };
  });
}
export async function createBrandAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await taxonomy.createBrand(auth, formToObject(fd));
    return { message: "Marka eklendi." };
  });
}
export async function updateBrandAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await taxonomy.updateBrand(auth, id(fd), formToObject(fd));
    return { message: "Marka güncellendi." };
  });
}
export async function deleteBrandAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await taxonomy.deleteBrand(auth, id(fd));
    return { message: "Marka silindi." };
  });
}

// ───────────── Ürün kataloğu ─────────────

export async function createProductAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const p = await products.createProduct(auth, formToObject(fd), await fileBuffer(fd, "image"));
    return { message: `"${p.name}" kataloğa eklendi.`, data: { href: `urunler/${p.id}` } };
  });
}
export async function updateProductAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await products.updateProduct(auth, id(fd), formToObject(fd));
    return { message: "Ürün güncellendi." };
  });
}
export async function addProductImageAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const buf = await fileBuffer(fd, "image");
    if (!buf) throw new UserError("Bir görsel seçin.", "image");
    await products.addProductImage(auth, id(fd), buf);
    return { message: "Görsel eklendi." };
  });
}
export async function deleteProductImageAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await products.deleteProductImage(auth, id(fd));
    return { message: "Görsel silindi." };
  });
}
export async function approveProductRequestAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await products.approveProductRequest(auth, id(fd), formToObject(fd));
    return { message: r.linked ? "Talep, katalogdaki aynı barkodlu ürüne bağlandı." : "Ürün kataloğa eklendi ve talep onaylandı." };
  });
}
export async function rejectProductRequestAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await products.rejectProductRequest(auth, id(fd), formToObject(fd));
    return { message: "Talep reddedildi." };
  });
}
export async function removeOfferAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await offers.removeOffer(auth, id(fd), formToObject(fd));
    return { message: "Teklif yayından kaldırıldı." };
  });
}
export async function restoreOfferAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await offers.restoreOffer(auth, id(fd));
    return { message: "Teklif yeniden yayında." };
  });
}

// ───────────── Kampanyalar ─────────────

export async function approveCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.approveCampaign(auth, id(fd), formToObject(fd));
    return { message: "Kampanya onaylandı." };
  });
}
export async function rejectCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.rejectCampaign(auth, id(fd), formToObject(fd));
    return { message: "Kampanya reddedildi." };
  });
}
export async function setCampaignFeaturedAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const featured = fd.get("featured") === "1";
    await campaigns.setCampaignFeatured(auth, id(fd), featured);
    return { message: featured ? "Ana sayfada öne çıkarıldı." : "Öne çıkarma kaldırıldı." };
  });
}
export async function endCampaignAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await campaigns.endCampaign(auth, id(fd), formToObject(fd));
    return { message: "Kampanya sonlandırıldı." };
  });
}

// ───────────── Duyurular ─────────────

export async function createAnnouncementAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await announcements.createAnnouncement(auth, formToObject(fd));
    return { message: "Duyuru yayınlandı." };
  });
}
export async function updateAnnouncementAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await announcements.updateAnnouncement(auth, id(fd), formToObject(fd));
    return { message: "Duyuru güncellendi." };
  });
}
export async function deleteAnnouncementAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await announcements.deleteAnnouncement(auth, id(fd));
    return { message: "Duyuru silindi." };
  });
}

// ───────────── Kullanıcılar ve yetkiler ─────────────

export async function createChamberUserAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await users.createChamberUser(auth, formToObject(fd));
    return { message: "Kullanıcı oluşturuldu.", data: { username: r.username, tempPassword: r.tempPassword, href: `kullanicilar/${r.userId}` } };
  });
}
export async function updateUserProfileAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await users.updateUserProfile(auth, id(fd), formToObject(fd));
    return { message: "Bilgiler güncellendi." };
  });
}
export async function setUserActiveAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const active = fd.get("active") === "1";
    await users.setUserActive(auth, id(fd), active);
    return { message: active ? "Hesap aktifleştirildi." : "Hesap pasife alındı; oturumları kapatıldı." };
  });
}
export async function unlockUserAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await users.unlockUser(auth, id(fd));
    return { message: "Hesap kilidi açıldı." };
  });
}
export async function resetUserPasswordAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await users.resetUserPassword(auth, id(fd));
    return { message: "Yeni geçici şifre oluşturuldu.", data: r };
  });
}
export async function setUserPermissionsAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await users.setUserPermissions(auth, id(fd), formToObject(fd));
    return { message: "İzinler kaydedildi. Kullanıcının açık oturumları kapatıldı." };
  });
}

// ───────────── Ayarlar ─────────────

export async function updateChamberAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await admin.updateChamber(auth, formToObject(fd));
    return { message: "Oda bilgileri kaydedildi." };
  });
}
export async function updateDuesThresholdAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await dues.updateDuesThreshold(auth, formToObject(fd));
    return { message: "Aidat kuralı kaydedildi." };
  });
}
