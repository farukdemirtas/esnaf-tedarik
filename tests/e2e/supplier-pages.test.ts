import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Aşama 4 uçtan uca testleri: tedarikçi paneli sayfaları, çalışan kısıtları
 * ve firmalar arası erişim (A'nın kaydı B'ye 404).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const P = `e2e4${randomBytes(3).toString("hex")}`;

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

let owner = "", staff = "", other = "";
let offerId = "", orderId = "";

beforeAll(async () => {
  [owner, staff, other] = await Promise.all([login("test.tedarikci-a"), login("test.tedarikci-a-calisan"), login("test.tedarikci-b")]);
  const supA = await db.supplier.findUniqueOrThrow({ where: { slug: "test-a" } });
  const chamberId = "chamber-samsun";
  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId, parentId: null } });
  const product = await db.product.create({ data: { chamberId, name: `${P} Su 0,5L`, slug: `${P}-su`, brandId: brand.id, categoryId: cat.id } });
  const offer = await db.supplierProduct.create({
    data: { supplierId: supA.id, productId: product.id, packType: "KOLI", unitsPerPack: 24, unitPrice: "5", packPrice: "120", stock: { create: { quantity: 50 } } },
  });
  offerId = offer.id;
  const m = await db.member.findFirstOrThrow({ where: { registryNumber: "TEST-1" }, include: { users: true } });
  const order = await db.order.create({
    data: {
      orderNumber: `ET-${P}`, chamberId, memberId: m.id, createdById: m.users[0].userId, idempotencyKey: P,
      addressSnapshot: { title: "Dükkan", district: "İlkadım", city: "Samsun", line: "E2E sokak 3", contactName: "E2E", phone: "05320000000" },
      subtotal: 240, discountTotal: 0, vatTotal: 24, grandTotal: 264,
      supplierOrders: {
        create: {
          supplierId: supA.id, subNumber: `ET-${P}-01`, subtotal: 240, discountTotal: 0, vatTotal: 24, grandTotal: 264,
          items: { create: { supplierProductId: offer.id, productName: product.name, brandName: brand.name, packType: "KOLI", unitsPerPack: 24, quantity: 2, listPackPrice: 120, finalPackPrice: 120, vatRate: 10, lineSubtotal: 240, lineDiscount: 0, lineVat: 24, lineTotal: 264 } },
          statusHistory: { create: { toStatus: "PENDING" } },
        },
      },
    },
    include: { supplierOrders: true },
  });
  orderId = order.supplierOrders[0].id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { orderNumber: `ET-${P}` } });
  await db.supplierProduct.deleteMany({ where: { id: offerId } });
  await db.product.deleteMany({ where: { name: { startsWith: P } } });
  await db.brand.deleteMany({ where: { name: { startsWith: P } } });
  await db.$disconnect();
});

const OWNER_PAGES = [
  "/tedarikci",
  "/tedarikci/siparisler",
  "/tedarikci/siparisler?durum=PENDING",
  "/tedarikci/urunler",
  "/tedarikci/urunler/yeni",
  "/tedarikci/fiyat-stok",
  "/tedarikci/urun-talepleri",
  "/tedarikci/kampanyalar",
  "/tedarikci/raporlar",
  "/tedarikci/raporlar?grup=month",
  "/tedarikci/firma",
  "/tedarikci/bolgeler",
  "/tedarikci/kullanicilar",
  "/tedarikci/bildirimler",
];

describe("tedarikçi yetkilisi", () => {
  it.each(OWNER_PAGES)("%s açılır", async (p) => {
    expect((await get(p, owner)).status, p).toBe(200);
  });

  it("katalog araması ve ürün seçimi çalışır", async () => {
    const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: offerId } });
    expect((await get(`/tedarikci/urunler/yeni?q=${encodeURIComponent(P)}`, owner)).text).toContain(`${P} Su`);
    expect((await get(`/tedarikci/urunler/yeni?urun=${product.productId}`, owner)).status).toBe(200);
  });

  it("kendi ürün, sipariş ve sevk fişi sayfaları açılır", async () => {
    expect((await get(`/tedarikci/urunler/${offerId}`, owner)).text).toContain(`${P} Su`);
    const so = await get(`/tedarikci/siparisler/${orderId}`, owner);
    expect(so.text).toContain(`ET-${P}-01`);
    expect(so.text).toContain("TEST Bakkal 1");
    expect((await get(`/yazdir/sevk-fisi/${orderId}`, owner)).text).toContain("E2E sokak 3");
  });
});

describe("tedarikçi çalışanı (sınırlı)", () => {
  it.each(["/tedarikci", "/tedarikci/siparisler", "/tedarikci/urunler", "/tedarikci/bildirimler"])("%s açılır", async (p) => {
    expect((await get(p, staff)).status, p).toBe(200);
  });

  it.each(["/tedarikci/fiyat-stok", "/tedarikci/urunler/yeni", "/tedarikci/urun-talepleri", "/tedarikci/kampanyalar", "/tedarikci/raporlar", "/tedarikci/kullanicilar"])(
    "%s yetkisiz",
    async (p) => {
      expect((await get(p, staff)).location, p).toBe("/yetkisiz");
    },
  );

  it("çalışan siparişi görür", async () => {
    expect((await get(`/tedarikci/siparisler/${orderId}`, staff)).status).toBe(200);
  });
});

describe("firmalar arası izolasyon", () => {
  it("B firması, A'nın sipariş, ürün ve sevk fişi sayfalarını açamaz (404)", async () => {
    expect((await get(`/tedarikci/siparisler/${orderId}`, other)).status).toBe(404);
    expect((await get(`/tedarikci/urunler/${offerId}`, other)).status).toBe(404);
    expect((await get(`/yazdir/sevk-fisi/${orderId}`, other)).status).toBe(404);
  });

  it("B'nin sipariş listesinde A'nın siparişi görünmez", async () => {
    expect((await get("/tedarikci/siparisler", other)).text).not.toContain(`ET-${P}-01`);
  });

  it("oturumsuz sevk fişi açılamaz", async () => {
    const r = await get(`/yazdir/sevk-fisi/${orderId}`, "");
    expect(r.status).toBe(307);
  });
});
