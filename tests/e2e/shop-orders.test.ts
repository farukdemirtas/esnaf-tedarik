import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Aşama 5 uçtan uca testleri: üye sepeti, siparişlerim, sipariş ayrıntısı, bildirimler;
 * üyeler arası izolasyon (TEST-1'in siparişi TEST-2'ye 404) ve panel koruması.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const P = `e2e5${randomBytes(3).toString("hex")}`;
const CHAMBER = "chamber-samsun";

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE },
    body: new URLSearchParams({ username, password: "TestSifre2026" }),
  });
  return res.headers.get("set-cookie")?.match(/et_session=[^;]+/)?.[0] ?? "";
}
async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie } });
  return { status: res.status, location: res.headers.get("location"), text: res.status === 200 ? await res.text() : "" };
}

let member1 = "", member2 = "", supplier = "";
let memberId = "", offerId = "", orderId = "", cartItemId = "", addressId = "";
let createdAreaId: string | null = null;
let previousDefaults: string[] = [];
const productName = `${P} Çay 1kg`;
const orderNumber = `ET-${P}`;
const subNumber = `ET-${P}-01`;

beforeAll(async () => {
  [member1, member2, supplier] = await Promise.all([login("test.uye-1"), login("test.uye-2"), login("test.tedarikci-a")]);

  const supA = await db.supplier.findUniqueOrThrow({ where: { slug: "test-a" } });
  const m = await db.member.findFirstOrThrow({ where: { registryNumber: "TEST-1", chamberId: CHAMBER }, include: { users: true } });
  memberId = m.id;
  const district = await db.district.findFirstOrThrow({ where: { chamberId: CHAMBER, active: true }, orderBy: { name: "asc" } });

  // A'nın bu ilçede teslimat bölgesi yoksa (asgari tutar 0) oluştur; varsa olduğu gibi kullan
  const area = await db.deliveryArea.findUnique({ where: { supplierId_districtId: { supplierId: supA.id, districtId: district.id } } });
  if (!area) {
    const created = await db.deliveryArea.create({ data: { supplierId: supA.id, districtId: district.id, deliveryDays: [1, 4], minOrderAmount: 0 } });
    createdAreaId = created.id;
  }

  // Bu ilçede varsayılan teslimat adresi (diğer adreslerin varsayılanlığı afterAll'da geri yüklenir)
  previousDefaults = (await db.address.findMany({ where: { memberId, isDefault: true }, select: { id: true } })).map((a) => a.id);
  await db.address.updateMany({ where: { memberId, isDefault: true }, data: { isDefault: false } });
  const address = await db.address.create({ data: { memberId, title: `${P} Dükkan`, districtId: district.id, line: "E2E sokak 5", isDefault: true } });
  addressId = address.id;

  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId: CHAMBER, parentId: null } });
  const product = await db.product.create({ data: { chamberId: CHAMBER, name: productName, slug: `${P}-cay`, brandId: brand.id, categoryId: cat.id } });
  // Yüksek paket fiyatı: var olan bölgenin asgari tutarı da karşılansın
  const offer = await db.supplierProduct.create({
    data: {
      supplierId: supA.id,
      productId: product.id,
      packType: "KOLI",
      unitsPerPack: 12,
      unitPrice: "500",
      packPrice: "6000",
      vatRate: 10,
      stock: { create: { quantity: 50 } },
    },
  });
  offerId = offer.id;

  const cart = await db.cart.upsert({ where: { memberId }, update: {}, create: { memberId }, select: { id: true } });
  const item = await db.cartItem.create({ data: { cartId: cart.id, supplierProductId: offer.id, quantity: 2, seenPackPrice: "6000" } });
  cartItemId = item.id;

  const order = await db.order.create({
    data: {
      orderNumber,
      chamberId: CHAMBER,
      memberId,
      createdById: m.users[0].userId,
      idempotencyKey: P,
      addressSnapshot: { title: "Dükkan", district: district.name, city: district.city, line: "E2E sokak 5", contactName: "E2E", phone: "05320000000" },
      subtotal: 12000,
      discountTotal: 0,
      vatTotal: 1200,
      grandTotal: 13200,
      supplierOrders: {
        create: {
          supplierId: supA.id,
          subNumber,
          subtotal: 12000,
          discountTotal: 0,
          vatTotal: 1200,
          grandTotal: 13200,
          items: {
            create: {
              supplierProductId: offer.id,
              productName,
              brandName: brand.name,
              packType: "KOLI",
              unitsPerPack: 12,
              quantity: 2,
              listPackPrice: 6000,
              finalPackPrice: 6000,
              vatRate: 10,
              lineSubtotal: 12000,
              lineDiscount: 0,
              lineVat: 1200,
              lineTotal: 13200,
            },
          },
          statusHistory: { create: { toStatus: "PENDING", note: "Sipariş oluşturuldu" } },
        },
      },
    },
  });
  orderId = order.id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { orderNumber } });
  if (cartItemId) await db.cartItem.deleteMany({ where: { id: cartItemId } });
  if (offerId) await db.supplierProduct.deleteMany({ where: { id: offerId } });
  await db.product.deleteMany({ where: { name: { startsWith: P } } });
  await db.brand.deleteMany({ where: { name: { startsWith: P } } });
  if (addressId) await db.address.deleteMany({ where: { id: addressId } });
  if (previousDefaults.length) await db.address.updateMany({ where: { id: { in: previousDefaults } }, data: { isDefault: true } });
  if (createdAreaId) await db.deliveryArea.deleteMany({ where: { id: createdAreaId } });
  await db.$disconnect();
});

describe("üye sepeti ve siparişleri", () => {
  it("sepet ürünü ve sipariş formunu gösterir", async () => {
    const r = await get("/magaza/sepet", member1);
    expect(r.status).toBe(200);
    expect(r.text).toContain(productName);
    expect(r.text).toContain("Siparişi ver");
  });

  it("siparişlerim listesinde sipariş görünür", async () => {
    const r = await get("/magaza/siparislerim", member1);
    expect(r.status).toBe(200);
    expect(r.text).toContain(orderNumber);
    expect((await get("/magaza/siparislerim?durum=acik", member1)).text).toContain(orderNumber);
  });

  it("sipariş ayrıntısı alt siparişi ve iptal formunu gösterir", async () => {
    const r = await get(`/magaza/siparislerim/${orderId}`, member1);
    expect(r.status).toBe(200);
    expect(r.text).toContain(subNumber);
    expect(r.text).toContain("İptal");
  });

  it("yeni sipariş mesajı gösterilir", async () => {
    const r = await get(`/magaza/siparislerim/${orderId}?yeni=1&kalan=1`, member1);
    expect(r.text).toContain("Siparişiniz alındı");
  });

  it("bildirimler sayfası açılır", async () => {
    expect((await get("/magaza/bildirimler", member1)).status).toBe(200);
  });
});

describe("izolasyon ve panel koruması", () => {
  it("başka üye siparişi açamaz (404) ve listesinde görmez", async () => {
    expect((await get(`/magaza/siparislerim/${orderId}`, member2)).status).toBe(404);
    expect((await get("/magaza/siparislerim", member2)).text).not.toContain(orderNumber);
  });

  it("başka üyenin sepetinde ürün görünmez", async () => {
    expect((await get("/magaza/sepet", member2)).text).not.toContain(productName);
  });

  it("tedarikçi kullanıcısı mağaza sepetine giremez", async () => {
    expect((await get("/magaza/sepet", supplier)).location).toBe("/yetkisiz");
  });

  it("oturumsuz erişim girişe yönlenir", async () => {
    expect((await get("/magaza/siparislerim", "")).status).toBe(307);
  });
});
