import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, UserError } from "@/lib/errors";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { login } from "@/modules/auth/service";
import * as offers from "@/modules/catalog/offers-supplier";
import * as products from "@/modules/catalog/products";
import * as taxonomy from "@/modules/catalog/taxonomy";
import * as campaigns from "@/modules/campaigns/supplier";
import * as review from "@/modules/campaigns/review";
import * as orders from "@/modules/orders/supplier";
import * as self from "@/modules/suppliers/self";
import * as inbox from "@/modules/notifications/inbox";
import { supplierReport } from "@/modules/reports/supplier";

/**
 * Aşama 4: tedarikçi paneli servis testleri.
 * Özellikle firma izolasyonu (A, B'nin verisine erişemez), stok ve sipariş durum makinesi.
 */
const P = `it4${randomBytes(3).toString("hex")}`;
const ip = () => `192.168.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
let admin: AuthContext, supA: AuthContext, supAStaff: AuthContext, supB: AuthContext;
let productId = "";
let product2Id = "";
let memberId = "";
let memberUserId = "";
let seq = 0;

async function ctxFor(username: string) {
  const r = await login({ username, password: "TestSifre2026" }, ip(), null);
  if (!r.ok) throw new Error(`${username}: ${r.error}`);
  return (await buildAuthContext(r.token))!;
}

const offerInput = (o: Record<string, string> = {}) => ({
  productId,
  packType: "KOLI",
  unitsPerPack: "12",
  packPrice: "480",
  vatRate: "10",
  minOrderQty: "1",
  orderStep: "1",
  stock: "100",
  active: "on",
  ...o,
});

/** Aşama 5 yazılana kadar siparişi doğrudan veritabanına oluşturur (stok düşerek) */
async function createTestOrder(offerId: string, qty: number, status: "PENDING" | "DELIVERED" = "PENDING") {
  const offer = await db.supplierProduct.findUniqueOrThrow({ where: { id: offerId }, include: { product: { include: { brand: true } } } });
  const n = `${P}-${++seq}`;
  const line = offer.packPrice.mul(qty);
  const vat = line.mul(offer.vatRate).div(100);
  const order = await db.order.create({
    data: {
      orderNumber: `ET-${n}`,
      chamberId: admin.chamberId!,
      memberId,
      createdById: memberUserId,
      idempotencyKey: n,
      addressSnapshot: { title: "Dükkan", district: "Atakum", city: "Samsun", line: "Test sokak 1", contactName: "Test", phone: "05320000000" },
      subtotal: line,
      discountTotal: 0,
      vatTotal: vat,
      grandTotal: line.add(vat),
      supplierOrders: {
        create: {
          supplierId: offer.supplierId,
          subNumber: `ET-${n}-01`,
          status,
          subtotal: line,
          discountTotal: 0,
          vatTotal: vat,
          grandTotal: line.add(vat),
          items: {
            create: {
              supplierProductId: offer.id,
              productName: offer.product.name,
              brandName: offer.product.brand.name,
              packType: offer.packType,
              unitsPerPack: offer.unitsPerPack,
              quantity: qty,
              listPackPrice: offer.packPrice,
              finalPackPrice: offer.packPrice,
              vatRate: offer.vatRate,
              lineSubtotal: line,
              lineDiscount: 0,
              lineVat: vat,
              lineTotal: line.add(vat),
            },
          },
          statusHistory: { create: { toStatus: status } },
        },
      },
    },
    include: { supplierOrders: true },
  });
  await db.stock.update({ where: { supplierProductId: offerId }, data: { quantity: { decrement: qty } } });
  return order.supplierOrders[0];
}

beforeAll(async () => {
  [admin, supA, supAStaff, supB] = await Promise.all([
    ctxFor("test.yonetici"),
    ctxFor("test.tedarikci-a"),
    ctxFor("test.tedarikci-a-calisan"),
    ctxFor("test.tedarikci-b"),
  ]);
  await taxonomy.createBrand(admin, { name: `${P} Marka` });
  const brand = await db.brand.findFirstOrThrow({ where: { name: `${P} Marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId: admin.chamberId!, parentId: null } });
  productId = (await products.createProduct(admin, { name: `${P} Kola 1L`, brandId: brand.id, categoryId: cat.id, unitType: "LITRE", unitAmount: "1", status: "ACTIVE" })).id;
  product2Id = (await products.createProduct(admin, { name: `${P} Ayran`, brandId: brand.id, categoryId: cat.id, unitType: "ADET", status: "ACTIVE" })).id;
  const m = await db.member.findFirstOrThrow({ where: { registryNumber: "TEST-1" }, include: { users: true } });
  memberId = m.id;
  memberUserId = m.users[0].userId;
});

afterAll(async () => {
  const like = { startsWith: P };
  await db.order.deleteMany({ where: { orderNumber: { startsWith: `ET-${P}` } } });
  await db.campaign.deleteMany({ where: { title: like } });
  await db.productRequest.deleteMany({ where: { name: like } });
  await db.supplierProduct.deleteMany({ where: { product: { name: like } } });
  await db.product.deleteMany({ where: { name: like } });
  await db.brand.deleteMany({ where: { name: like } });
  await db.deliveryArea.deleteMany({ where: { supplierId: { in: [supA.supplier!.id, supB.supplier!.id] } } });
  const us = await db.user.findMany({ where: { username: like }, select: { id: true } });
  await db.user.deleteMany({ where: { id: { in: us.map((u) => u.id) } } });
  await db.$disconnect();
});

describe("teklif (ürünlerim)", () => {
  let offerId = "";

  it("teklif oluşturulur: birim fiyat hesaplanır, fiyat geçmişi ve stok hareketi yazılır", async () => {
    const o = await offers.createOffer(supA, offerInput());
    offerId = o.id;
    expect(o.unitPrice.toString()).toBe("40");
    expect(await db.productPrice.count({ where: { supplierProductId: o.id } })).toBe(1);
    expect((await db.stock.findUniqueOrThrow({ where: { supplierProductId: o.id } })).quantity.toString()).toBe("100");
    expect(await db.stockMovement.count({ where: { supplierProductId: o.id, reason: "MANUAL" } })).toBe(1);
  });

  it("aynı ürün + paket türü tekrar eklenemez; tutarsız paket bilgisi reddedilir", async () => {
    await expect(offers.createOffer(supA, offerInput())).rejects.toBeInstanceOf(UserError);
    await expect(offers.createOffer(supA, offerInput({ productId: product2Id, packType: "ADET", unitsPerPack: "12" }))).rejects.toThrow("paket içi adet 1");
    await expect(offers.createOffer(supA, offerInput({ productId: product2Id, minOrderQty: "1.5" }))).rejects.toThrow("tam sayı");
    await expect(offers.createOffer(supA, offerInput({ productId: product2Id, vatRate: "18" }))).rejects.toBeInstanceOf(ZodError);
    await expect(offers.createOffer(supA, offerInput({ productId: product2Id, packPrice: "0" }))).rejects.toThrow("0'dan büyük");
    // KG satışta küsuratlı miktar serbest
    await expect(offers.createOffer(supA, offerInput({ productId: product2Id, packType: "KG", unitsPerPack: "1", minOrderQty: "2.5", orderStep: "0.5", stock: "40.5" }))).resolves.toBeTruthy();
  });

  it("çalışan teklif oluşturamaz ve fiyat değiştiremez", async () => {
    await expect(offers.createOffer(supAStaff, offerInput({ productId: product2Id, packType: "PAKET" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(offers.updatePriceStock(supAStaff, offerId, { packPrice: "1", stock: "1" })).rejects.toBeInstanceOf(ForbiddenError);
    // ama listeyi görebilir
    expect((await offers.listMyOffers(supAStaff, {})).total).toBeGreaterThan(0);
  });

  it("FİRMA İZOLASYONU: B, A'nın teklifini göremez ve değiştiremez", async () => {
    await expect(offers.getMyOffer(supB, offerId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(offers.updatePriceStock(supB, offerId, { packPrice: "1", stock: "0" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(offers.setOfferActive(supB, offerId, false)).rejects.toBeInstanceOf(NotFoundError);
    await expect(offers.bulkUpdatePriceStock(supB, { [`price.${offerId}`]: "1" })).rejects.toThrow("firmanıza ait olmayan");
    expect((await offers.listMyOffers(supB, {})).items.some((o) => o.id === offerId)).toBe(false);
  });

  it("fiyat değişince eski fiyat kapanır, yeni fiyat geçmişe eklenir; stok farkı hareket olarak yazılır", async () => {
    await offers.updatePriceStock(supA, offerId, { packPrice: "500,00", stock: "80" });
    const prices = await db.productPrice.findMany({ where: { supplierProductId: offerId }, orderBy: { validFrom: "asc" } });
    expect(prices).toHaveLength(2);
    expect(prices[0].validTo).not.toBeNull();
    expect(prices[1]).toMatchObject({ validTo: null });
    expect(prices[1].packPrice.toString()).toBe("500");
    const mv = await db.stockMovement.findFirstOrThrow({ where: { supplierProductId: offerId }, orderBy: { createdAt: "desc" } });
    expect(mv.change.toString()).toBe("-20");
  });

  it("toplu güncellemede hatalı satır varsa hiçbir satır kaydedilmez", async () => {
    const e = await offers.bulkUpdatePriceStock(supA, { [`price.${offerId}`]: "abc", [`stock.${offerId}`]: "70" }).catch((x) => x);
    expect(e).toBeInstanceOf(UserError);
    expect((e as UserError).fieldErrors).toHaveProperty(`price.${offerId}`);
    expect((await db.stock.findUniqueOrThrow({ where: { supplierProductId: offerId } })).quantity.toString()).toBe("80");
    expect(await offers.bulkUpdatePriceStock(supA, { [`price.${offerId}`]: "500", [`stock.${offerId}`]: "70" })).toBe(1);
  });

  it("Oda'nın kaldırdığı teklif tedarikçi tarafından açılamaz", async () => {
    await db.supplierProduct.update({ where: { id: offerId }, data: { removedByAdmin: true, removalReason: "test" } });
    await expect(offers.setOfferActive(supA, offerId, true)).rejects.toThrow("Oda tarafından");
    await db.supplierProduct.update({ where: { id: offerId }, data: { removedByAdmin: false, removalReason: null } });
  });

  it("katalogda olan barkod için talep açılamaz; yeni ürün talebi oluşturulur ve geri çekilebilir", async () => {
    await db.product.update({ where: { id: productId }, data: { barcode: `86900${Date.now()}`.slice(0, 13) } });
    const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
    await expect(offers.createProductRequest(supA, { name: `${P} x`, barcode: p.barcode, brandName: "X", unitType: "ADET" }, null)).rejects.toThrow("katalogda zaten var");
    const r = await offers.createProductRequest(supA, { name: `${P} Yeni`, brandName: "Yeni Marka", unitType: "ADET" }, null);
    expect(r.status).toBe("PENDING");
    await expect(offers.cancelProductRequest(supB, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await offers.cancelProductRequest(supA, r.id);
  });
});

describe("kampanya akışı", () => {
  it("taslak → indirim → onaya gönder → geri çek → onay → bitir", async () => {
    const offer = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: supA.supplier!.id, productId, packType: "KOLI" } });
    const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16);
    const now = new Date(Date.now() - 60_000).toISOString().slice(0, 16);
    const c = await campaigns.createMyCampaign(supA, { title: `${P} Kola fırsatı`, type: "VOLUME", membersOnly: "on", startsAt: now, endsAt: in7 });
    expect(c.status).toBe("DRAFT");
    await expect(campaigns.submitMyCampaign(supA, c.id)).rejects.toThrow("en az bir indirimli ürün");

    await expect(campaigns.addMyDiscount(supA, c.id, { supplierProductId: offer.id, kind: "FIXED_PRICE", value: "600", minQty: "1" })).rejects.toThrow("düşük olmalıdır");
    await expect(campaigns.addMyDiscount(supA, c.id, { supplierProductId: offer.id, kind: "PERCENT", value: "120", minQty: "1" })).rejects.toThrow("100'den küçük");
    await campaigns.addMyDiscount(supA, c.id, { supplierProductId: offer.id, kind: "FIXED_PRICE", value: "450", minQty: "1" });
    await campaigns.addMyDiscount(supA, c.id, { supplierProductId: offer.id, kind: "FIXED_PRICE", value: "430", minQty: "10" });
    await expect(campaigns.addMyDiscount(supA, c.id, { supplierProductId: offer.id, kind: "FIXED_PRICE", value: "440", minQty: "10" })).rejects.toThrow("aynı asgari miktar");

    // B, A'nın kampanyasına erişemez ve kendi kampanyasına A'nın ürününü ekleyemez
    await expect(campaigns.getMyCampaign(supB, c.id)).rejects.toBeInstanceOf(NotFoundError);
    const cb = await campaigns.createMyCampaign(supB, { title: `${P} B`, type: "VOLUME", startsAt: now, endsAt: in7 });
    await expect(campaigns.addMyDiscount(supB, cb.id, { supplierProductId: offer.id, kind: "PERCENT", value: "5", minQty: "1" })).rejects.toThrow("Geçerli bir ürününüzü");

    await campaigns.submitMyCampaign(supA, c.id);
    await expect(campaigns.updateMyCampaign(supA, c.id, { title: `${P} değişti`, type: "VOLUME", startsAt: now, endsAt: in7 })).rejects.toThrow("geri çekin");
    await campaigns.withdrawMyCampaign(supA, c.id);
    await campaigns.submitMyCampaign(supA, c.id);
    await review.approveCampaign(admin, c.id, {});
    await expect(campaigns.deleteMyCampaign(supA, c.id)).rejects.toBeInstanceOf(UserError);
    await campaigns.endMyCampaign(supA, c.id);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ENDED");
  });

  it("geçmiş bitiş tarihiyle kampanya açılamaz", async () => {
    await expect(
      campaigns.createMyCampaign(supA, { title: `${P} eski`, type: "VOLUME", startsAt: "2025-01-01T00:00", endsAt: "2025-01-02T00:00" }),
    ).rejects.toThrow("geçmiş olamaz");
  });
});

describe("sipariş durum makinesi", () => {
  it("geçersiz geçiş ve gerekçesiz red engellenir; B siparişi göremez", async () => {
    const offer = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: supA.supplier!.id, productId, packType: "KOLI" } });
    const so = await createTestOrder(offer.id, 2);
    await expect(orders.getMySupplierOrder(supB, so.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(orders.changeSupplierOrderStatus(supB, so.id, { to: "CONFIRMED" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(orders.changeSupplierOrderStatus(supA, so.id, { to: "SHIPPED" })).rejects.toBeInstanceOf(UserError);
    await expect(orders.changeSupplierOrderStatus(supA, so.id, { to: "REJECTED" })).rejects.toThrow("gerekçesi");
    await expect(orders.addInvoice(supA, so.id, { type: "INVOICE", documentNumber: "A1", documentDate: "2026-11-01" }, null)).rejects.toThrow("onaylanmış");
  });

  it("çalışan siparişi ilerletir; her adım geçmişe yazılır ve üyeye bildirilir; iptalde stok iade edilir", async () => {
    const offer = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: supA.supplier!.id, productId, packType: "KOLI" } });
    const before = (await db.stock.findUniqueOrThrow({ where: { supplierProductId: offer.id } })).quantity;
    const so = await createTestOrder(offer.id, 3);
    const notifBefore = await db.notification.count({ where: { userId: memberUserId } });

    await orders.changeSupplierOrderStatus(supAStaff, so.id, { to: "CONFIRMED", plannedDate: "2026-12-01" });
    await orders.changeSupplierOrderStatus(supAStaff, so.id, { to: "PREPARING" });
    await orders.addInvoice(supA, so.id, { type: "WAYBILL", documentNumber: "IRS-1", documentDate: "2026-11-01" }, null);
    await orders.changeSupplierOrderStatus(supA, so.id, { to: "CANCELLED", note: "Araç arızası" });

    const after = await db.supplierOrder.findUniqueOrThrow({ where: { id: so.id }, include: { statusHistory: true } });
    expect(after.status).toBe("CANCELLED");
    expect(after.rejectReason).toBe("Araç arızası");
    expect(after.plannedDate).not.toBeNull();
    expect(after.statusHistory).toHaveLength(4);
    expect((await db.stock.findUniqueOrThrow({ where: { supplierProductId: offer.id } })).quantity.toString()).toBe(before.toString());
    expect(await db.stockMovement.count({ where: { supplierProductId: offer.id, reason: "ORDER_CANCEL", reference: so.subNumber } })).toBe(1);
    expect(await db.notification.count({ where: { userId: memberUserId } })).toBe(notifBefore + 3);
    await expect(orders.changeSupplierOrderStatus(supA, so.id, { to: "CONFIRMED" })).rejects.toBeInstanceOf(UserError);
  });

  it("aynı anda iki durum değişikliğinden yalnızca biri başarılı olur", async () => {
    const offer = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: supA.supplier!.id, productId, packType: "KOLI" } });
    const so = await createTestOrder(offer.id, 1);
    const results = await Promise.allSettled([
      orders.changeSupplierOrderStatus(supA, so.id, { to: "CONFIRMED" }),
      orders.changeSupplierOrderStatus(supA, so.id, { to: "REJECTED", note: "stok yok" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.orderStatusHistory.count({ where: { supplierOrderId: so.id } })).toBe(2); // ilk kayıt + 1 değişiklik
  });

  it("rapor yalnızca kendi satışlarını içerir", async () => {
    const offer = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: supA.supplier!.id, productId, packType: "KOLI" } });
    await createTestOrder(offer.id, 2, "DELIVERED");
    const rA = await supplierReport(supA, {});
    expect(rA.deliveredCount).toBeGreaterThanOrEqual(1);
    expect(rA.topProducts.some((p) => p.supplierProductId === offer.id)).toBe(true);
    expect(rA.topMembers.some((m) => m.memberId === memberId)).toBe(true);
    expect(rA.series.length).toBeGreaterThan(0);
    const rB = await supplierReport(supB, {});
    expect(rB.topProducts.some((p) => p.supplierProductId === offer.id)).toBe(false);
    await expect(supplierReport(supAStaff, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("firma profili, bölgeler, kullanıcılar, bildirimler", () => {
  it("profil güncellenir; çalışan güncelleyemez", async () => {
    const s = await db.supplier.findUniqueOrThrow({ where: { id: supA.supplier!.id } });
    const input = { tradeName: s.tradeName, address: s.address, phone: "03620000000", email: s.email, contactName: s.contactName, minOrderAmount: "750,50" };
    await self.updateMyProfile(supA, input);
    expect((await db.supplier.findUniqueOrThrow({ where: { id: s.id } })).minOrderAmount.toString()).toBe("750.5");
    await expect(self.updateMyProfile(supAStaff, input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hizmet bölgesi eklenir/güncellenir; tüm ilçeler tek seferde eklenir", async () => {
    const d = await db.district.findFirstOrThrow({ where: { chamberId: admin.chamberId!, name: "Atakum" } });
    await expect(self.saveDeliveryArea(supA, { districtId: d.id })).rejects.toBeInstanceOf(ZodError); // gün seçilmedi
    await self.saveDeliveryArea(supA, { districtId: d.id, days: ["1", "3"] });
    await self.saveDeliveryArea(supA, { districtId: d.id, days: ["5", "2", "2"], minOrderAmount: "300" });
    const a = await db.deliveryArea.findUniqueOrThrow({ where: { supplierId_districtId: { supplierId: supA.supplier!.id, districtId: d.id } } });
    expect(a.deliveryDays).toEqual([2, 5]);
    await expect(self.saveDeliveryArea(supA, { districtId: "yok", days: ["1"] })).rejects.toBeInstanceOf(UserError);
    const added = await self.addAllDistricts(supA, { days: ["1", "4"] });
    expect(added).toBe(16); // 17 ilçeden Atakum zaten ekliydi
  });

  it("yetkili çalışan ekler; kendini pasife alamaz; B, A'nın kullanıcısına dokunamaz", async () => {
    const r = await self.addMyUser(supA, { fullName: `${P} Depocu`, username: `${P}depo`, role: "SUPPLIER_STAFF" });
    const u = await db.user.findUniqueOrThrow({ where: { username: r.username } });
    await expect(self.setMyUserActive(supA, supA.userId, false)).rejects.toThrow("Kendi hesabınızda");
    await expect(self.resetMyUserPassword(supB, u.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(self.addMyUser(supAStaff, { fullName: "X Y", username: `${P}x`, role: "SUPPLIER_OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("kullanıcı yalnızca kendi bildirimlerini görür ve okur", async () => {
    const memberCtx = await ctxFor("test.uye-1");
    const mine = await inbox.listMyNotifications(memberCtx, {});
    expect(mine.items.every((n) => n.userId === memberCtx.userId)).toBe(true);
    const foreign = mine.items[0];
    if (foreign) await expect(inbox.markNotificationRead(supA, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
    await inbox.markAllNotificationsRead(memberCtx);
    expect(await inbox.unreadCount(memberCtx.userId)).toBe(0);
  });
});
