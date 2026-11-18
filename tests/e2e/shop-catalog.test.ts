import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Aşama 5 uçtan uca testleri: üye katalog sayfaları (ana sayfa, arama, ürün + fiyat karşılaştırma,
 * tedarikçi sayfası, favoriler) ve teslimat bölgesi kısıtı (bölgeye hizmet vermeyen tedarikçi 404).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const P = `e2e5k${randomBytes(3).toString("hex")}`;
const chamberId = "chamber-samsun";

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

let member = "", supplier = "";
let productId = "", offerId = "", addressId = "";
let createdAreaId: string | null = null;
let createdDistrictId: string | null = null;
let memberId = "";
let previousDefaults: string[] = [];

beforeAll(async () => {
  [member, supplier] = await Promise.all([login("test.uye-1"), login("test.tedarikci-a")]);
  const supA = await db.supplier.findUniqueOrThrow({ where: { slug: "test-a" } });
  const supB = await db.supplier.findUniqueOrThrow({ where: { slug: "test-b" } });

  // B'nin hizmet vermediği bir ilçe seç (tercihen A'nın zaten hizmet verdiği); yoksa test ilçesi oluştur
  const candidates = await db.district.findMany({
    where: { chamberId, active: true, deliveryAreas: { none: { supplierId: supB.id } } },
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
    data: { memberId, title: `${P} Dükkan`, districtId: district.id, line: "E2E sokak 5", isDefault: true },
  });
  addressId = address.id;

  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId, parentId: null } });
  const product = await db.product.create({
    data: { chamberId, name: `${P} Çay 1kg`, slug: `${P}-cay`, brandId: brand.id, categoryId: cat.id, barcode: null },
  });
  productId = product.id;
  const offer = await db.supplierProduct.create({
    data: { supplierId: supA.id, productId, packType: "KOLI", unitsPerPack: 12, unitPrice: "150", packPrice: "1800", vatRate: 10, stock: { create: { quantity: 40 } } },
  });
  offerId = offer.id;
});

afterAll(async () => {
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

describe("üye katalog sayfaları", () => {
  it("ana sayfa açılır ve yeni ürünü gösterir", async () => {
    const r = await get("/magaza", member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(`${P} Çay 1kg`);
    expect(r.text).toContain("Teslimat ilçesi");
  });

  it("arama ürünü listeler", async () => {
    const r = await get(`/magaza/urunler?q=${encodeURIComponent(P)}`, member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(`${P} Çay 1kg`);
  });

  it("filtreli liste sayfaları açılır", async () => {
    for (const p of ["/magaza/urunler?kampanya=1&stokta=1", "/magaza/urunler?sirala=yeni&sayfa=2", "/magaza/tedarikciler", "/magaza/favoriler"])
      expect((await get(p, member)).status, p).toBe(200);
  });

  it("ürün sayfası fiyat karşılaştırmasını gösterir", async () => {
    const r = await get(`/magaza/urun/${productId}`, member);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Fiyat karşılaştırma");
    const supA = await db.supplier.findUniqueOrThrow({ where: { slug: "test-a" } });
    expect(r.text).toContain(supA.tradeName.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    expect(r.text).toContain("En uygun");
  });

  it("olmayan ürün 404", async () => {
    expect((await get(`/magaza/urun/${P}-yok`, member)).status).toBe(404);
  });

  it("tedarikçi sayfası açılır ve ürünü listeler", async () => {
    const r = await get(`/magaza/tedarikciler/test-a?q=${encodeURIComponent(P)}`, member);
    expect(r.status).toBe(200);
    expect(r.text).toContain(`${P} Çay 1kg`);
  });

  it("bölgeye hizmet vermeyen tedarikçinin sayfası 404", async () => {
    expect((await get("/magaza/tedarikciler/test-b", member)).status).toBe(404);
  });
});

describe("erişim", () => {
  it("tedarikçi kullanıcısı mağaza sayfalarına giremez", async () => {
    const r = await get("/magaza/urunler", supplier);
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.location).toContain("/yetkisiz");
  });

  it("oturumsuz kullanıcı girişe yönlendirilir", async () => {
    const r = await get("/magaza/urunler", "");
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.location).toContain("/giris");
  });
});
