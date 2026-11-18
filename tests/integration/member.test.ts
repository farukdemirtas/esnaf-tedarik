import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, UserError } from "@/lib/errors";
import { ScopeError } from "@/lib/auth/scope";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { login } from "@/modules/auth/service";
import * as catalog from "@/modules/shop/catalog";
import * as cart from "@/modules/shop/cart";
import * as favorites from "@/modules/shop/favorites";
import * as memberOrders from "@/modules/orders/member";
import * as supplierOrders from "@/modules/orders/supplier";
import * as account from "@/modules/members/self";
import { chamberReport } from "@/modules/reports/admin";

/**
 * Aşama 5: üye paneli servis testleri.
 * Görünürlük (ilçe/tedarikçi durumu), fiyat motoru entegrasyonu, sepet kuralları,
 * çok tedarikçili sipariş motoru (idempotency, eşzamanlılık, stok, asgari tutar, aidat), üye izolasyonu.
 */
const P = `it5${randomBytes(3).toString("hex")}`;
const ip = () => `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const CH = "chamber-samsun";
let admin: AuthContext, staff: AuthContext, supA: AuthContext, supB: AuthContext, m1: AuthContext, m2: AuthContext;
let distX = "", distY = "";
let productId = "", product2Id = "", product3Id = "";
let offerA = "", offerA2 = "", offerB = "", offerBlimited = "", offerHidden = "";
let campaignId = "";
let m1Id = "", m2Id = "";
const createdAddresses: string[] = [];

async function ctxFor(username: string) {
  const r = await login({ username, password: "TestSifre2026" }, ip(), null);
  if (!r.ok) throw new Error(`${username}: ${r.error}`);
  return (await buildAuthContext(r.token))!;
}
const key = () => randomUUID();
const stockOf = async (id: string) => (await db.stock.findUniqueOrThrow({ where: { supplierProductId: id } })).quantity.toString();

async function offer(supplierId: string, prodId: string, o: { packPrice: number; stock: number; minOrderQty?: number; orderStep?: number; packType?: "KOLI" | "PAKET" }) {
  const sp = await db.supplierProduct.create({
    data: {
      supplierId,
      productId: prodId,
      packType: o.packType ?? "KOLI",
      unitsPerPack: 12,
      unitPrice: (o.packPrice / 12).toFixed(2),
      packPrice: o.packPrice,
      vatRate: 10,
      minOrderQty: o.minOrderQty ?? 1,
      orderStep: o.orderStep ?? 1,
      stock: { create: { quantity: o.stock } },
    },
  });
  return sp.id;
}

beforeAll(async () => {
  [admin, staff, supA, supB, m1, m2] = await Promise.all([
    ctxFor("test.yonetici"), ctxFor("test.personel"), ctxFor("test.tedarikci-a"), ctxFor("test.tedarikci-b"), ctxFor("test.uye-1"), ctxFor("test.uye-2"),
  ]);
  m1Id = m1.member!.id;
  m2Id = m2.member!.id;
  const ds = await db.district.findMany({ where: { chamberId: CH }, orderBy: { name: "asc" }, take: 2 });
  [distX, distY] = [ds[0].id, ds[1].id];
  // Önceki çalıştırmalardan kalan sepet/adres temizliği
  await db.cartItem.deleteMany({ where: { cart: { memberId: { in: [m1Id, m2Id] } } } });
  await db.address.deleteMany({ where: { memberId: { in: [m1Id, m2Id] } } });

  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId: CH, parentId: null } });
  const mk = (name: string) => db.product.create({ data: { chamberId: CH, name: `${P} ${name}`, slug: `${P}-${name.toLowerCase()}`, brandId: brand.id, categoryId: cat.id } });
  productId = (await mk("Kola")).id;
  product2Id = (await mk("Ayran")).id;
  product3Id = (await mk("Gizli")).id;

  // A: X ve Y ilçelerine; B: yalnızca X ilçesine hizmet verir
  await db.deliveryArea.createMany({
    data: [
      // İlçe asgari tutarı 0: firmanın genel asgari tutarını (başka testler değiştirebilir) ezer
      { supplierId: supA.supplier!.id, districtId: distX, deliveryDays: [1, 3, 5], minOrderAmount: 0 },
      { supplierId: supA.supplier!.id, districtId: distY, deliveryDays: [2], minOrderAmount: 0 },
      { supplierId: supB.supplier!.id, districtId: distX, deliveryDays: [4], minOrderAmount: 1000 },
    ],
  });
  offerA = await offer(supA.supplier!.id, productId, { packPrice: 480, stock: 100 });
  offerA2 = await offer(supA.supplier!.id, product2Id, { packPrice: 100, stock: 50, minOrderQty: 2, orderStep: 2 });
  offerB = await offer(supB.supplier!.id, productId, { packPrice: 470, stock: 100 });
  offerBlimited = await offer(supB.supplier!.id, product2Id, { packPrice: 300, stock: 5 });
  offerHidden = await offer(supA.supplier!.id, product3Id, { packPrice: 50, stock: 10 });
  await db.supplierProduct.update({ where: { id: offerHidden }, data: { removedByAdmin: true, removalReason: "test" } });

  const c = await db.campaign.create({
    data: {
      chamberId: CH, supplierId: supA.supplier!.id, title: `${P} Kampanya`, type: "VOLUME", status: "APPROVED",
      startsAt: new Date(Date.now() - 86400_000), endsAt: new Date(Date.now() + 86400_000),
      discounts: { create: [{ supplierProductId: offerA, kind: "FIXED_PRICE", value: 450, minQty: 5 }, { supplierProductId: offerA, kind: "PERCENT", value: 2, minQty: 1 }] },
    },
  });
  campaignId = c.id;
  // Onay bekleyen kampanya fiyata yansımamalı
  await db.campaign.create({
    data: {
      chamberId: CH, supplierId: supB.supplier!.id, title: `${P} Bekleyen`, type: "VOLUME", status: "PENDING",
      startsAt: new Date(Date.now() - 86400_000), endsAt: new Date(Date.now() + 86400_000),
      discounts: { create: [{ supplierProductId: offerB, kind: "FIXED_PRICE", value: 100, minQty: 1 }] },
    },
  });
});

afterAll(async () => {
  const like = { startsWith: P };
  const orders = await db.order.findMany({ where: { supplierOrders: { some: { items: { some: { productName: like } } } } }, select: { id: true } });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.membershipDue.deleteMany({ where: { period: { startsWith: "1990" } } });
  await db.cartItem.deleteMany({ where: { cart: { memberId: { in: [m1Id, m2Id] } } } });
  await db.favorite.deleteMany({ where: { product: { name: like } } });
  await db.campaign.deleteMany({ where: { title: like } });
  await db.supplierProduct.deleteMany({ where: { product: { name: like } } });
  await db.product.deleteMany({ where: { name: like } });
  await db.brand.deleteMany({ where: { name: like } });
  await db.deliveryArea.deleteMany({ where: { supplierId: { in: [supA.supplier!.id, supB.supplier!.id] } } });
  await db.address.deleteMany({ where: { memberId: { in: [m1Id, m2Id] } } });
  await db.$disconnect();
});

const addrInput = (districtId: string, title = "Dükkan") => ({ title, districtId, neighborhood: "Merkez", line: "Test sokak no 1", isDefault: "on" });

describe("görünürlük", () => {
  it("adresi olmayan üye hiçbir teklif görmez", async () => {
    const r = await catalog.listShopProducts(m1, { q: P });
    expect(r.total).toBe(0);
  });

  it("hesabım: üye kendi adresini ekler; başka üyenin adresine dokunamaz", async () => {
    await account.addMyAddress(m1, addrInput(distX));
    await account.addMyAddress(m2, addrInput(distY));
    const a1 = (await account.getMyAccount(m1)).member.addresses;
    expect(a1).toHaveLength(1);
    expect(a1[0].isDefault).toBe(true);
    createdAddresses.push(a1[0].id);
    await expect(account.deleteMyAddress(m2, a1[0].id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(account.updateMyAddress(m2, a1[0].id, addrInput(distY))).rejects.toBeInstanceOf(NotFoundError);
    await expect(account.deleteMyAddress(m1, a1[0].id)).rejects.toThrow(/Son teslimat adresiniz/);
    await expect(account.addMyAddress(m1, { ...addrInput(distX), districtId: "yok" })).rejects.toBeInstanceOf(UserError);
  });

  it("X ilçesindeki üye A ve B'yi, Y'deki üye yalnızca A'yı görür; kaldırılan teklif görünmez", async () => {
    const r1 = await catalog.listShopProducts(m1, { q: P });
    expect(r1.items.map((p) => p.name).sort()).toEqual([`${P} Ayran`, `${P} Kola`]);
    const kola = r1.items.find((p) => p.id === productId)!;
    expect(kola.offerCount).toBe(2);
    const r2 = await catalog.listShopProducts(m2, { q: P });
    expect(r2.items.find((p) => p.id === productId)!.offerCount).toBe(1);
    await expect(catalog.getShopProduct(m1, product3Id)).resolves.toMatchObject({ offers: [] });
    const supplierView = await catalog.getShopSupplier(m2, "test-a", {});
    expect(supplierView.items.some((p) => p.id === productId)).toBe(true);
    await expect(catalog.getShopSupplier(m2, "test-b", {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("askıya alınan tedarikçinin teklifleri anında gizlenir", async () => {
    await db.supplier.update({ where: { id: supB.supplier!.id }, data: { status: "SUSPENDED" } });
    try {
      const p = await catalog.getShopProduct(m1, productId);
      expect(p.offers.map((o) => o.supplier.id)).toEqual([supA.supplier!.id]);
    } finally {
      await db.supplier.update({ where: { id: supB.supplier!.id }, data: { status: "APPROVED" } });
    }
  });

  it("filtreler: tedarikçi, kampanyalı, stokta", async () => {
    expect((await catalog.listShopProducts(m1, { q: P, tedarikci: supB.supplier!.id })).total).toBe(2);
    const k = await catalog.listShopProducts(m1, { q: P, kampanya: "1" });
    expect(k.items.map((p) => p.id)).toEqual([productId]);
    const f = await catalog.shopFacets(m1);
    expect(f.suppliers.map((s) => s.slug)).toEqual(expect.arrayContaining(["test-a", "test-b"]));
  });

  it("fiyat karşılaştırma: onaylı kampanya uygulanır, bekleyen kampanya uygulanmaz", async () => {
    const p = await catalog.getShopProduct(m1, productId);
    const a = p.offers.find((o) => o.offerId === offerA)!;
    const b = p.offers.find((o) => o.offerId === offerB)!;
    expect(a.finalPackPrice.toFixed(2)).toBe("470.40"); // %2 (1+ koli)
    expect(a.lowestPackPrice.toFixed(2)).toBe("450.00"); // 5+ koli kademesi
    expect(a.tiers).toHaveLength(2);
    expect(b.finalPackPrice.toFixed(2)).toBe("470.00"); // PENDING kampanya yok sayılır
    expect(b.supplierMinAmount.toString()).toBe("1000");
    expect(a.deliveryDays).toEqual([1, 3, 5]);
    expect(p.cheapestId).toBe(offerB);
  });

  it("tedarikçi ve Oda kullanıcıları mağaza servislerini kullanamaz", async () => {
    await expect(catalog.listShopProducts(supA, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(memberOrders.placeOrder(admin, { idempotencyKey: key() })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cart.getCart(staff)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("favoriler", () => {
  it("ekle / listele / çıkar", async () => {
    expect(await favorites.toggleFavorite(m1, productId)).toBe(true);
    expect((await favorites.listFavorites(m1)).items.map((p) => p.id)).toEqual([productId]);
    expect((await catalog.getShopProduct(m1, productId)).isFavorite).toBe(true);
    expect(await favorites.toggleFavorite(m1, productId)).toBe(false);
    expect((await favorites.listFavorites(m1)).total).toBe(0);
  });
});

describe("sepet", () => {
  it("miktar kuralları ve stok kontrolü", async () => {
    await expect(cart.addToCart(m1, { supplierProductId: offerA2, quantity: "1" })).rejects.toThrow(/Asgari/);
    await expect(cart.addToCart(m1, { supplierProductId: offerA2, quantity: "3" })).rejects.toThrow(/katları/);
    await expect(cart.addToCart(m1, { supplierProductId: offerBlimited, quantity: "6" })).rejects.toThrow(/Stokta yalnızca 5/);
    await expect(cart.addToCart(m1, { supplierProductId: offerHidden, quantity: "1" })).rejects.toThrow(/satışta değil/);
    // Y'deki üye B'nin ürününü sepete ekleyemez
    await expect(cart.addToCart(m2, { supplierProductId: offerB, quantity: "1" })).rejects.toThrow(/satışta değil/);
  });

  it("ekleme birleşir, tedarikçiye göre gruplanır, kampanya kademesi miktara göre uygulanır", async () => {
    await cart.addToCart(m1, { supplierProductId: offerA, quantity: "2" });
    await cart.addToCart(m1, { supplierProductId: offerA, quantity: "3" }); // toplam 5 → 450 kademe
    await cart.addToCart(m1, { supplierProductId: offerA2, quantity: "2" });
    await cart.addToCart(m1, { supplierProductId: offerB, quantity: "1" });
    const c = await cart.getCart(m1);
    expect(c.groups.map((g) => g.supplier.id).sort()).toEqual([supA.supplier!.id, supB.supplier!.id].sort());
    const ga = c.groups.find((g) => g.supplier.id === supA.supplier!.id)!;
    const la = ga.lines.find((l) => l.supplierProductId === offerA)!;
    expect(la.quantity.toString()).toBe("5");
    expect(la.price.finalPackPrice.toFixed(2)).toBe("450.00");
    expect(la.price.campaignId).toBe(campaignId);
    expect(ga.orderable).toBe(true);
    const gb = c.groups.find((g) => g.supplier.id === supB.supplier!.id)!;
    expect(gb.meetsMin).toBe(false); // 470 < 1000 (ilçe asgari tutarı)
    expect(c.orderableCount).toBe(1);
  });

  it("başka üyenin sepet satırına erişilemez", async () => {
    const item = await db.cartItem.findFirstOrThrow({ where: { cart: { memberId: m1Id } } });
    await expect(cart.setCartQuantity(m2, item.id, { quantity: "1" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(cart.removeCartItem(m2, item.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fiyat değişince uyarı verir, sipariş durur; onaydan sonra devam eder", async () => {
    await db.supplierProduct.update({ where: { id: offerA2 }, data: { packPrice: 110 } });
    const c = await cart.getCart(m1);
    expect(c.hasPriceChange).toBe(true);
    const before = await stockOf(offerA2);
    await expect(memberOrders.placeOrder(m1, { idempotencyKey: key() })).rejects.toBeInstanceOf(memberOrders.PriceChangedError);
    expect(await stockOf(offerA2)).toBe(before);
    expect(await cart.acceptCartPrices(m1)).toBe(1);
    expect((await cart.getCart(m1)).hasPriceChange).toBe(false);
  });
});

describe("sipariş motoru", () => {
  let orderId = "";

  it("aidat engeli: vadesi geçmiş 2 aidatta sipariş verilemez", async () => {
    const old = new Date("1990-02-01T00:00:00Z");
    await db.membershipDue.createMany({
      data: [
        { chamberId: CH, memberId: m1Id, period: "1990-01", amount: 100, dueDate: old },
        { chamberId: CH, memberId: m1Id, period: "1990-02", amount: 100, dueDate: old },
      ],
    });
    try {
      await expect(memberOrders.placeOrder(m1, { idempotencyKey: key() })).rejects.toThrow(/aidat/);
    } finally {
      await db.membershipDue.deleteMany({ where: { memberId: m1Id, period: { startsWith: "1990" } } });
    }
  });

  it("asgari tutarı tutmayan grup sepette kalır; diğerleri tek siparişte -01 alt siparişi olur", async () => {
    const stockA = await stockOf(offerA);
    const r = await memberOrders.placeOrder(m1, { idempotencyKey: key(), note: "Sabah teslim" });
    orderId = r.orderId;
    expect(r.orderNumber).toMatch(/^ET-\d{4}-\d{6}$/);
    expect(r.supplierOrderCount).toBe(1);
    expect(r.skipped).toEqual(["TEST Tedarikçi B"]);
    const o = await memberOrders.getMyOrder(m1, orderId);
    expect(o.supplierOrders).toHaveLength(1);
    const so = o.supplierOrders[0];
    expect(so.subNumber).toBe(`${r.orderNumber}-01`);
    expect(so.status).toBe("PENDING");
    expect(so.statusHistory).toHaveLength(1);
    // Satır anlık kopyası ve tutarlar: 5×480 liste, 5×450 kampanya; 2×110
    const kola = so.items.find((i) => i.supplierProductId === offerA)!;
    expect(kola.productName).toBe(`${P} Kola`);
    expect(kola.listPackPrice.toFixed(2)).toBe("480.00");
    expect(kola.finalPackPrice.toFixed(2)).toBe("450.00");
    expect(kola.campaignId).toBe(campaignId);
    expect(o.subtotal.toFixed(2)).toBe("2620.00");
    expect(o.discountTotal.toFixed(2)).toBe("150.00");
    expect(o.vatTotal.toFixed(2)).toBe("247.00");
    expect(o.grandTotal.toFixed(2)).toBe("2717.00");
    expect(o.addressSnapshot).toMatchObject({ title: "Dükkan", city: "Samsun", neighborhood: "Merkez", line: "Test sokak no 1" });
    expect(Object.keys(o.addressSnapshot as object).sort()).toEqual(["city", "contactName", "district", "line", "neighborhood", "phone", "title"]);
    // Stok düştü, hareket yazıldı, sepetten yalnızca sipariş edilenler silindi
    expect(Number(await stockOf(offerA))).toBe(Number(stockA) - 5);
    expect(await db.stockMovement.count({ where: { supplierProductId: offerA, reason: "ORDER", reference: so.subNumber } })).toBe(1);
    const rest = await cart.getCart(m1);
    expect(rest.groups.map((g) => g.supplier.id)).toEqual([supB.supplier!.id]);
    // Tedarikçiye bildirim ve denetim kaydı
    expect(await db.notification.count({ where: { type: "order.new", link: `/tedarikci/siparisler/${so.id}` } })).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: "order.place", entityId: orderId } })).toBe(1);
    // Tedarikçi siparişi görür; diğer tedarikçi göremez
    await expect(supplierOrders.getMySupplierOrder(supA, so.id)).resolves.toBeTruthy();
    await expect(supplierOrders.getMySupplierOrder(supB, so.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("çok tedarikçili sipariş: -01 ve -02 alt siparişleri", async () => {
    await cart.addToCart(m1, { supplierProductId: offerB, quantity: "2" }); // B: 3×470 = 1410 ≥ 1000
    await cart.addToCart(m1, { supplierProductId: offerA, quantity: "1" });
    const r = await memberOrders.placeOrder(m1, { idempotencyKey: key() });
    expect(r.supplierOrderCount).toBe(2);
    const o = await memberOrders.getMyOrder(m1, r.orderId);
    expect(o.supplierOrders.map((s) => s.subNumber)).toEqual([`${r.orderNumber}-01`, `${r.orderNumber}-02`]);
    expect(o.grandTotal.toFixed(2)).toBe(o.supplierOrders.reduce((s, x) => s + Number(x.grandTotal), 0).toFixed(2));
    expect((await cart.getCart(m1)).itemCount).toBe(0);
  });

  it("idempotency: aynı anahtarla tekrar gönderim yeni sipariş açmaz (ardışık ve eşzamanlı)", async () => {
    await cart.addToCart(m1, { supplierProductId: offerA, quantity: "1" });
    const k = key();
    const before = await stockOf(offerA);
    const results = await Promise.all([memberOrders.placeOrder(m1, { idempotencyKey: k }), memberOrders.placeOrder(m1, { idempotencyKey: k })]);
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    const again = await memberOrders.placeOrder(m1, { idempotencyKey: k });
    expect(again.duplicate).toBe(true);
    expect(again.orderId).toBe(results[0].orderId);
    expect(await db.order.count({ where: { idempotencyKey: k } })).toBe(1);
    expect(Number(await stockOf(offerA))).toBe(Number(before) - 1);
    // Başka üye aynı anahtarı kullanamaz
    await expect(memberOrders.placeOrder(m2, { idempotencyKey: k })).rejects.toThrow(/anahtar/);
  });

  it("eşzamanlı siparişlerde stok eksiye düşmez (koşullu stok düşümü)", async () => {
    await account.addMyAddress(m2, addrInput(distX, "İkinci dükkan")); // m2 artık X'te, B'yi görür
    await db.deliveryArea.update({ where: { supplierId_districtId: { supplierId: supB.supplier!.id, districtId: distX } }, data: { minOrderAmount: 0 } });
    await cart.addToCart(m1, { supplierProductId: offerBlimited, quantity: "3" });
    await cart.addToCart(m2, { supplierProductId: offerBlimited, quantity: "3" });
    const res = await Promise.allSettled([
      memberOrders.placeOrder(m1, { idempotencyKey: key() }),
      memberOrders.placeOrder(m2, { idempotencyKey: key() }),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const fail = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(fail.reason.message)).toMatch(/stok/i);
    expect(await stockOf(offerBlimited)).toBe("2");
  });

  it("siparişlerim: üye yalnızca kendi siparişlerini görür", async () => {
    const l1 = await memberOrders.listMyOrders(m1, {});
    expect(l1.items.some((o) => o.id === orderId)).toBe(true);
    const l2 = await memberOrders.listMyOrders(m2, {});
    expect(l2.items.some((o) => o.id === orderId)).toBe(false);
    await expect(memberOrders.getMyOrder(m2, orderId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await memberOrders.listMyOrders(m1, { durum: "acik" })).total).toBeGreaterThan(0);
  });

  it("iptal: yalnızca Beklemede iken; stok iade edilir; başka üye iptal edemez", async () => {
    const o = await memberOrders.getMyOrder(m1, orderId);
    const so = o.supplierOrders[0];
    await expect(memberOrders.cancelMySupplierOrder(m2, so.id, {})).rejects.toBeInstanceOf(NotFoundError);
    const before = Number(await stockOf(offerA));
    await memberOrders.cancelMySupplierOrder(m1, so.id, { note: "Yanlış sipariş" });
    const after = await memberOrders.getMyOrder(m1, orderId);
    expect(after.supplierOrders[0].status).toBe("CANCELLED");
    expect(Number(await stockOf(offerA))).toBe(before + 5);
    await expect(memberOrders.cancelMySupplierOrder(m1, so.id, {})).rejects.toBeInstanceOf(UserError);
    expect(await db.notification.count({ where: { type: "order.cancelled", link: `/tedarikci/siparisler/${so.id}` } })).toBeGreaterThan(0);

    // Tedarikçi onayladıktan sonra iptal edilemez
    const list = await memberOrders.listMyOrders(m1, {});
    const pending = list.items.flatMap((x) => x.supplierOrders).find((s) => s.status === "PENDING" && s.supplier.tradeName === "TEST Tedarikçi A")!;
    await supplierOrders.changeSupplierOrderStatus(supA, pending.id, { to: "CONFIRMED" });
    await expect(memberOrders.cancelMySupplierOrder(m1, pending.id, {})).rejects.toThrow(/iptal edilemez/);
  });

  it("tekrar sipariş: satırlar güncel fiyatla sepete eklenir", async () => {
    await cart.clearCart(m1);
    const r = await memberOrders.reorder(m1, orderId);
    expect(r.added).toBe(2);
    const c = await cart.getCart(m1);
    const la = c.groups.flatMap((g) => g.lines).find((l) => l.supplierProductId === offerA2)!;
    expect(la.seenPackPrice.toFixed(2)).toBe("110.00");
    expect(c.hasPriceChange).toBe(false);
    await expect(memberOrders.reorder(m2, orderId)).rejects.toBeInstanceOf(NotFoundError);
    await cart.clearCart(m1);
  });

  it("supplier kullanıcısı üye kapsamına giremez", async () => {
    const forged = { ...supA, permissions: new Set([...supA.permissions, "memberSelf.order", "memberSelf.orders.view"]) };
    await expect(memberOrders.listMyOrders(forged, {})).rejects.toBeInstanceOf(ScopeError);
  });
});

describe("Oda raporu", () => {
  it("sipariş verisinden canlı rapor; yetkisiz kullanıcı göremez", async () => {
    const r = await chamberReport(admin, {});
    expect(r.orderCount).toBeGreaterThan(0);
    expect(r.salesCount).toBeGreaterThan(0);
    expect(r.topProducts.some((p) => p.productId === productId)).toBe(true);
    expect(r.series.length).toBeGreaterThan(0);
    await expect(chamberReport(staff, {})).resolves.toBeTruthy();
    await expect(chamberReport(supA, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(chamberReport(m1, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});
