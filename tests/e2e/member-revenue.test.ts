import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Aşama 6 uçtan uca testleri (üye tarafı): banner reklam, reklam tıklaması,
 * sponsorlu ürünler ve dijital kataloglar.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const P = `e2e6r${randomBytes(3).toString("hex")}`;
const chamberId = "chamber-samsun";
const DAY = 24 * 60 * 60 * 1000;

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

let member = "";
let productId = "", offerId = "", addressId = "", catalogId = "", adId = "", sponsoredId = "";
let createdAreaId: string | null = null;
let createdDistrictId: string | null = null;
let createdSlotId: string | null = null;
let slotWasInactive: string | null = null;
let memberId = "";
let previousDefaults: string[] = [];
const productName = `${P} Zeytin 1kg`;
const catalogTitle = `${P} Kasım Broşürü`;
const adTitle = `${P} Banner`;

beforeAll(async () => {
  member = await login("test.uye-1");
  const supA = await db.supplier.findUniqueOrThrow({ where: { slug: "test-a" } });

  // A'nın hizmet verdiği bir ilçe seç; yoksa A için teslimat bölgesi (gerekirse test ilçesi) oluştur
  const candidates = await db.district.findMany({
    where: { chamberId, active: true },
    include: { deliveryAreas: { where: { supplierId: supA.id } } },
    orderBy: { name: "asc" },
  });
  let district = candidates.find((d) => d.deliveryAreas.length > 0) ?? candidates[0];
  if (!district) {
    const created = await db.district.create({ data: { chamberId, city: "Samsun", name: `${P} İlçe` }, include: { deliveryAreas: true } });
    createdDistrictId = created.id;
    district = created;
  }
  if (district.deliveryAreas.length === 0) {
    const area = await db.deliveryArea.create({ data: { supplierId: supA.id, districtId: district.id, deliveryDays: [1, 4], minOrderAmount: "500" } });
    createdAreaId = area.id;
  }

  // Üyenin mevcut varsayılan adresleri geçici olarak varsayılan olmaktan çıkarılır, sonra geri alınır
  const m = await db.member.findFirstOrThrow({ where: { registryNumber: "TEST-1", chamberId } });
  memberId = m.id;
  previousDefaults = (await db.address.findMany({ where: { memberId, isDefault: true }, select: { id: true } })).map((a) => a.id);
  await db.address.updateMany({ where: { memberId, isDefault: true }, data: { isDefault: false } });
  const address = await db.address.create({
    data: { memberId, title: `${P} Dükkan`, districtId: district.id, line: "E2E sokak 6", isDefault: true },
  });
  addressId = address.id;

  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId, parentId: null } });
  const product = await db.product.create({
    data: { chamberId, name: productName, slug: `${P}-zeytin`, brandId: brand.id, categoryId: cat.id, barcode: null },
  });
  productId = product.id;
  const offer = await db.supplierProduct.create({
    data: { supplierId: supA.id, productId, packType: "KOLI", unitsPerPack: 6, unitPrice: "200", packPrice: "1200", vatRate: 10, stock: { create: { quantity: 30 } } },
  });
  offerId = offer.id;

  const now = Date.now();
  const catalog = await db.catalog.create({
    data: {
      supplierId: supA.id,
      title: catalogTitle,
      startsAt: new Date(now - DAY),
      endsAt: new Date(now + 7 * DAY),
      status: "APPROVED",
      items: { create: [{ supplierProductId: offerId, sortOrder: 0 }] },
    },
  });
  catalogId = catalog.id;

  // Reklam alanı: varsa kullan (pasifse geçici olarak etkinleştir), yoksa oluştur
  const existingSlot = await db.adSlot.findUnique({ where: { chamberId_code: { chamberId, code: "home-top" } } });
  if (existingSlot && !existingSlot.active) slotWasInactive = existingSlot.id;
  const slot = await db.adSlot.upsert({
    where: { chamberId_code: { chamberId, code: "home-top" } },
    update: { active: true },
    create: { chamberId, code: "home-top", name: "Mağaza ana sayfa üst bant", width: 1200, height: 300 },
  });
  if (!existingSlot) createdSlotId = slot.id;
  // En yeni başlangıç tarihi: alanda başka reklam olsa da ilk sırada gösterilir
  const ad = await db.advertisement.create({
    data: {
      slotId: slot.id,
      title: adTitle,
      imagePath: "ads/test.png",
      targetUrl: `/magaza/kataloglar/${catalogId}`,
      startsAt: new Date(now - 60 * 1000),
      endsAt: new Date(now + DAY),
      status: "APPROVED",
    },
  });
  adId = ad.id;

  const sp = await db.sponsoredProduct.create({
    data: { supplierProductId: offerId, startsAt: new Date(now - DAY), endsAt: new Date(now + DAY), sortOrder: -1000, active: true },
  });
  sponsoredId = sp.id;
});

afterAll(async () => {
  if (adId) await db.advertisement.deleteMany({ where: { id: adId } });
  if (createdSlotId) await db.adSlot.deleteMany({ where: { id: createdSlotId, advertisements: { none: {} } } });
  if (slotWasInactive) await db.adSlot.update({ where: { id: slotWasInactive }, data: { active: false } });
  if (sponsoredId) await db.sponsoredProduct.deleteMany({ where: { id: sponsoredId } });
  if (catalogId) await db.catalog.deleteMany({ where: { id: catalogId } });
  await db.favorite.deleteMany({ where: { productId } });
  await db.cartItem.deleteMany({ where: { supplierProductId: offerId } });
  await db.supplierProduct.deleteMany({ where: { id: offerId } });
  await db.product.deleteMany({ where: { name: { startsWith: P } } });
  await db.brand.deleteMany({ where: { name: { startsWith: P } } });
  if (addressId) await db.address.deleteMany({ where: { id: addressId } });
  if (previousDefaults.length) await db.address.updateMany({ where: { id: { in: previousDefaults } }, data: { isDefault: true } });
  if (createdAreaId) await db.deliveryArea.deleteMany({ where: { id: createdAreaId } });
  if (createdDistrictId) await db.district.deleteMany({ where: { id: createdDistrictId } });
  await db.$disconnect();
});

describe("banner reklam ve sponsorlu ürünler", () => {
  it("ana sayfa reklamı ve öne çıkan ürünleri gösterir", async () => {
    const r = await get("/magaza", member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(`alt="${adTitle}"`);
    expect(r.text).toContain(`/api/reklam/${adId}`);
    expect(r.text).toContain("Öne çıkan ürünler");
    expect(r.text).toContain("Sponsorlu");
  });

  it("reklam tıklaması sayılır ve mağaza içine yönlendirir", async () => {
    const before = await db.advertisement.findUniqueOrThrow({ where: { id: adId } });
    const r = await get(`/api/reklam/${adId}`, member);
    expect(r.status).toBe(303);
    expect(r.location).toMatch(/^\/magaza/);
    const after = await db.advertisement.findUniqueOrThrow({ where: { id: adId } });
    expect(after.clicks).toBe(before.clicks + 1);
  });

  it("oturumsuz reklam tıklaması girişe yönlendirir", async () => {
    const r = await get(`/api/reklam/${adId}`, "");
    expect(r.status).toBe(303);
    expect(r.location).toContain("/giris");
  });
});

describe("dijital kataloglar", () => {
  it("katalog listesi yayındaki kataloğu gösterir", async () => {
    const r = await get("/magaza/kataloglar", member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(catalogTitle);
  });

  it("katalog detayı ürünleri listeler", async () => {
    const r = await get(`/magaza/kataloglar/${catalogId}`, member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(catalogTitle);
    expect(r.text).toContain(productName);
  });

  it("tedarikçi sayfası kataloğa bağlantı verir", async () => {
    const r = await get("/magaza/tedarikciler/test-a", member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(`/magaza/kataloglar/${catalogId}`);
  });

  it("olmayan katalog 404", async () => {
    expect((await get(`/magaza/kataloglar/${P}-yok`, member)).status).toBe(404);
  });
});
