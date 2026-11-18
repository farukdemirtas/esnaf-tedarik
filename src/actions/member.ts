"use server";

/**
 * Üye (mağaza) paneli sunucu işlemleri. Yetki ve üye kapsamı servis katmanında kontrol edilir.
 */
import { runAction } from "@/lib/action";
import type { ActionState } from "@/lib/action-types";
import { UserError } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import * as cart from "@/modules/shop/cart";
import * as favorites from "@/modules/shop/favorites";
import * as orders from "@/modules/orders/member";
import * as account from "@/modules/members/self";

type S = ActionState;
const id = (fd: FormData, name = "id") => {
  const v = fd.get(name);
  if (typeof v !== "string" || !v) throw new UserError("Kayıt belirtilmedi.");
  return v;
};

// ───────────── Favoriler ─────────────

export async function toggleFavoriteAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const on = await favorites.toggleFavorite(auth, id(fd, "productId"));
    return { message: on ? "Favorilere eklendi." : "Favorilerden çıkarıldı." };
  });
}

// ───────────── Sepet ─────────────

export async function addToCartAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const r = await cart.addToCart(auth, formToObject(fd));
    return { message: `Sepete eklendi (sepetteki miktar: ${r.quantity.toString()}).` };
  });
}
export async function setCartQuantityAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await cart.setCartQuantity(auth, id(fd), formToObject(fd));
    return { message: "Miktar güncellendi." };
  });
}
export async function removeCartItemAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await cart.removeCartItem(auth, id(fd));
    return { message: "Ürün sepetten çıkarıldı." };
  });
}
export async function clearCartAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const supplierId = fd.get("supplierId");
    const n = await cart.clearCart(auth, typeof supplierId === "string" && supplierId ? supplierId : undefined);
    return { message: `${n} ürün sepetten çıkarıldı.` };
  });
}
export async function acceptCartPricesAction() {
  return runAction(async (auth) => {
    const n = await cart.acceptCartPrices(auth);
    return { message: n ? `${n} ürünün güncel fiyatı onaylandı.` : "Fiyatlar zaten güncel." };
  });
}

// ───────────── Sipariş ─────────────

/** Form alanları: idempotencyKey (sayfa yüklenirken üretilir), note, addressId, supplierIds[] */
export async function placeOrderAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    // Tedarikçi seçimi gösterildiyse ve hiçbiri işaretlenmediyse "tümü" sayılmaz
    if (fd.get("supplierSelection") === "1" && fd.getAll("supplierIds").length === 0)
      throw new UserError("Sipariş verilecek en az bir tedarikçi seçin.", "supplierIds");
    const r = await orders.placeOrder(auth, formToObject(fd));
    return { redirectTo: `/magaza/siparislerim/${r.orderId}?yeni=1${r.skipped.length ? `&kalan=${r.skipped.length}` : ""}` };
  });
}
export async function cancelMySupplierOrderAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await orders.cancelMySupplierOrder(auth, id(fd), formToObject(fd));
    return { message: "Sipariş iptal edildi." };
  });
}
export async function reorderAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    const so = fd.get("supplierOrderId");
    const r = await orders.reorder(auth, id(fd), { supplierOrderId: typeof so === "string" && so ? so : undefined });
    if (r.added === 0) throw new UserError(`Ürünlerin hiçbiri şu an sipariş edilemiyor: ${r.skipped.join(", ")}.`);
    return { message: `${r.added} ürün sepete eklendi.${r.skipped.length ? ` Eklenemeyenler: ${r.skipped.join(", ")}.` : ""}` };
  });
}

// ───────────── Hesabım ─────────────

export async function updateMyContactAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await account.updateMyContact(auth, formToObject(fd));
    return { message: "İletişim bilgileri kaydedildi." };
  });
}
export async function addMyAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await account.addMyAddress(auth, formToObject(fd));
    return { message: "Adres eklendi." };
  });
}
export async function updateMyAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await account.updateMyAddress(auth, id(fd), formToObject(fd));
    return { message: "Adres güncellendi." };
  });
}
export async function deleteMyAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await account.deleteMyAddress(auth, id(fd));
    return { message: "Adres silindi." };
  });
}
export async function setMyDefaultAddressAction(_: S, fd: FormData) {
  return runAction(async (auth) => {
    await account.setMyDefaultAddress(auth, id(fd));
    return { message: "Varsayılan teslimat adresi değiştirildi. Ürünler bu adresin ilçesine göre listelenir." };
  });
}
