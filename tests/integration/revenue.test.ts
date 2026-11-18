import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, UserError } from "@/lib/errors";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { login } from "@/modules/auth/service";
import * as packages from "@/modules/revenue/packages";
import * as ads from "@/modules/revenue/ads";
import * as sponsored from "@/modules/revenue/sponsored";
import * as catalogs from "@/modules/revenue/catalogs";
import { revenueReport } from "@/modules/revenue/report";
import { sponsoredProducts } from "@/modules/shop/catalog";
import * as offers from "@/modules/catalog/offers-supplier";

/** Aşama 6: paketler, haklar, banner, sponsorlu ürün, dijital katalog — yetki ve firma izolasyonu dahil. */
const P = `it6${randomBytes(3).toString("hex")}`;
const ip = () => `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const CH = "chamber-samsun";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const PDF = Buffer.from("%PDF-1.4\n%test catalog\n");
let admin: AuthContext, staff: AuthContext, supA: AuthContext, supAStaff: AuthContext, supB: AuthContext, m1: AuthContext;
let offerA = "", offerB = "", productId = "", product2Id = "", districtId = "", addressId = "";
let pkgId = "";
let prevDefaults: string[] = [];
let areaCreated = false;
const soon = (h: number) => new Date(Date.now() + h * 3600e3);
const dt = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16).replace(" ", "T");

async function ctxFor(username: string) {
  const r = await login({ username, password: "TestSifre2026" }, ip(), null);
  if (!r.ok) throw new Error(`${username}: ${r.error}`);
  return (await buildAuthContext(r.token))!;
}

beforeAll(async () => {
  [admin, staff, supA, supAStaff, supB, m1] = await Promise.all(
    ["test.yonetici", "test.personel", "test.tedarikci-a", "test.tedarikci-a-calisan", "test.tedarikci-b", "test.uye-1"].map(ctxFor),
  );
  await ads.ensureSlots(CH);
  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId: CH, parentId: null } });
  productId = (await db.product.create({ data: { chamberId: CH, name: `${P} Lokum`, slug: `${P}-lokum`, brandId: brand.id, categoryId: cat.id } })).id;
  product2Id = (await db.product.create({ data: { chamberId: CH, name: `${P} Helva`, slug: `${P}-helva`, brandId: brand.id, categoryId: cat.id } })).id;
  const mk = (supplierId: string, pid: string) =>
    db.supplierProduct.create({ data: { supplierId, productId: pid, packType: "KOLI", unitsPerPack: 10, unitPrice: 10, packPrice: 100, stock: { create: { quantity: 20 } } } });
  offerA = (await mk(supA.supplier!.id, productId)).id;
  offerB = (await mk(supB.supplier!.id, productId)).id;
  districtId = (await db.district.findFirstOrThrow({ where: { chamberId: CH }, orderBy: { name: "desc" } })).id;
  const key = { supplierId_districtId: { supplierId: supA.supplier!.id, districtId } };
  if (!(await db.deliveryArea.findUnique({ where: key }))) {
    await db.deliveryArea.create({ data: { supplierId: supA.supplier!.id, districtId, deliveryDays: [2] } });
    areaCreated = true;
  }
  prevDefaults = (await db.address.findMany({ where: { memberId: m1.member!.id, isDefault: true }, select: { id: true } })).map((a) => a.id);
  await db.address.updateMany({ where: { memberId: m1.member!.id }, data: { isDefault: false } });
  addressId = (await db.address.create({ data: { memberId: m1.member!.id, title: `${P} adres`, districtId, line: "Test sokak 9", isDefault: true } })).id;
});

afterAll(async () => {
  const like = { startsWith: P };
  await db.catalog.deleteMany({ where: { title: like } });
  await db.advertisement.deleteMany({ where: { title: like } });
  await db.sponsoredProduct.deleteMany({ where: { supplierProduct: { product: { name: like } } } });
  await db.supplierSubscription.deleteMany({ where: { package: { name: like } } });
  await db.supplierPackage.deleteMany({ where: { name: like } });
  await db.setting.deleteMany({ where: { chamberId: CH, key: packages.DEFAULT_PRODUCT_LIMIT_KEY } });
  await db.supplierProduct.deleteMany({ where: { product: { name: like } } });
  await db.product.deleteMany({ where: { name: like } });
  await db.brand.deleteMany({ where: { name: like } });
  await db.address.deleteMany({ where: { id: addressId } });
  await db.address.updateMany({ where: { id: { in: prevDefaults } }, data: { isDefault: true } });
  if (areaCreated) await db.deliveryArea.deleteMany({ where: { supplierId: supA.supplier!.id, districtId } });
  await db.$disconnect();
});

describe("paketler ve haklar", () => {
  it("Oda paket tanımlar; personel ve tedarikçi tanımlayamaz", async () => {
    const pkgInput = { name: `${P} Vitrin`, type: "SHOWCASE", productLimit: "", sponsoredSlots: "2", bannerSlots: "1", price: "1500", durationDays: "30", active: "on" };
    pkgId = (await packages.createPackage(admin, pkgInput)).id;
    await expect(packages.createPackage(staff, pkgInput)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(packages.createPackage(supA, pkgInput)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(packages.createPackage(admin, { ...pkgInput, price: "abc" })).rejects.toBeTruthy();
  });

  it("paketsiz tedarikçinin hakkı yok; varsayılan ürün limiti uygulanır", async () => {
    const e = await packages.supplierEntitlements(supA.supplier!.id);
    expect(e.sponsoredSlots).toBe(0);
    expect(e.bannerSlots).toBe(0);
    const count = await db.supplierProduct.count({ where: { supplierId: supA.supplier!.id, removedByAdmin: false } });
    await packages.setDefaultProductLimit(admin, { limit: String(count) });
    await expect(
      offers.createOffer(supA, { productId: product2Id, packType: "KOLI", unitsPerPack: "10", packPrice: "90", vatRate: "10", minOrderQty: "1", orderStep: "1", stock: "5", active: "on" }),
    ).rejects.toThrow(/limit/);
    await packages.setDefaultProductLimit(admin, { limit: "" });
  });

  it("tedarikçi talep eder, Oda onaylar → haklar açılır; çalışan talep edemez", async () => {
    await expect(packages.requestPackage(supAStaff, { packageId: pkgId })).rejects.toBeInstanceOf(ForbiddenError);
    const s = await packages.requestPackage(supA, { packageId: pkgId, note: "Havale yapıldı" });
    await expect(packages.requestPackage(supA, { packageId: pkgId })).rejects.toThrow(/bekleyen/);
    await packages.approveSubscription(admin, s.id, {});
    const e = await packages.supplierEntitlements(supA.supplier!.id);
    expect(e.sponsoredSlots).toBe(2);
    expect(e.bannerSlots).toBe(1);
    expect(e.activePackages).toHaveLength(1);
    const m = await packages.getMyMarketing(supA);
    expect(m.subscriptions.find((x) => x.id === s.id)?.status).toBe("ACTIVE");
    // B'nin hakkı yok, A'nın talebini geri çekemez
    expect((await packages.supplierEntitlements(supB.supplier!.id)).bannerSlots).toBe(0);
    await expect(packages.cancelMyPackageRequest(supB, s.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("banner reklam", () => {
  let adId = "";
  it("tedarikçi hakkı kadar talep eder; dış bağlantı kabul edilmez", async () => {
    const slots = await ads.ensureSlots(CH);
    const home = slots.find((s) => s.code === "home-top")!;
    const input = { slotId: home.id, title: `${P} Banner`, targetUrl: "/magaza/tedarikciler/test-a", startsAt: dt(soon(-1)), endsAt: dt(soon(48)) };
    await expect(ads.requestAd(supA, { ...input, targetUrl: "https://kotu.example.com" }, PNG)).rejects.toBeTruthy();
    await expect(ads.requestAd(supB, input, PNG)).rejects.toThrow(/hakkınız yok/);
    adId = (await ads.requestAd(supA, input, PNG)).id;
    await expect(ads.requestAd(supA, { ...input, title: `${P} Banner 2` }, PNG)).rejects.toThrow(/tamamını/);
    // Onaydan önce üyeye gösterilmez
    expect((await ads.activeAds(CH, "home-top")).some((a) => a.id === adId)).toBe(false);
    await expect(ads.approveAd(supA, adId, {})).rejects.toBeInstanceOf(ForbiddenError);
    await ads.approveAd(admin, adId, { fee: "750" });
  });

  it("yayındaki banner gösterilir, gösterim ve tıklama sayılır; hedef güvenli", async () => {
    expect((await ads.activeAds(CH, "home-top")).some((a) => a.id === adId)).toBe(true);
    expect(await ads.registerAdClick(m1, adId)).toBe("/magaza/tedarikciler/test-a");
    const ad = await db.advertisement.findUniqueOrThrow({ where: { id: adId } });
    expect(ad.impressions).toBeGreaterThan(0);
    expect(ad.clicks).toBe(1);
    await expect(ads.withdrawMyAd(supB, adId)).rejects.toBeInstanceOf(NotFoundError);
    // Askıya alınan tedarikçinin bannerı gösterilmez
    await db.supplier.update({ where: { id: supA.supplier!.id }, data: { status: "SUSPENDED" } });
    try {
      expect((await ads.activeAds(CH, "home-top")).some((a) => a.id === adId)).toBe(false);
    } finally {
      await db.supplier.update({ where: { id: supA.supplier!.id }, data: { status: "APPROVED" } });
    }
  });

  it("gelir raporu paket ve reklam ücretlerini içerir; personel göremez", async () => {
    const r = await revenueReport(admin, {});
    expect(Number(r.packageRevenue)).toBeGreaterThanOrEqual(1500);
    expect(Number(r.adRevenue)).toBeGreaterThanOrEqual(750);
    expect(r.ads.some((a) => a.id === adId)).toBe(true);
    await expect(revenueReport(staff, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("sponsorlu ürün", () => {
  it("hak sınırı, firma izolasyonu ve üye görünümü", async () => {
    const input = { startsAt: dt(soon(-1)), endsAt: dt(soon(24)) };
    await expect(sponsored.addMySponsored(supA, { ...input, supplierProductId: offerB })).rejects.toThrow(/ürününüzü/);
    await expect(sponsored.addMySponsored(supB, { ...input, supplierProductId: offerB })).rejects.toThrow(/hakkınız yok/);
    const s = await sponsored.addMySponsored(supA, { ...input, supplierProductId: offerA });
    await sponsored.addMySponsored(supA, { ...input, supplierProductId: offerA });
    await expect(sponsored.addMySponsored(supA, { ...input, supplierProductId: offerA })).rejects.toThrow(/tamamını/);
    const list = await sponsoredProducts(m1, 10);
    expect(list.map((p) => p.id)).toContain(productId);
    await expect(sponsored.stopMySponsored(supB, s.id)).rejects.toBeInstanceOf(NotFoundError);
    await sponsored.stopMySponsored(supA, s.id);
  });
});

describe("dijital katalog", () => {
  let catalogId = "";
  it("tedarikçi oluşturur, Oda onaylar, üye görür; B erişemez", async () => {
    await expect(catalogs.createMyCatalog(supA, { title: `${P} Katalog`, startsAt: "2026-01-01" }, null, null)).rejects.toThrow(/Kapak/);
    const c = await catalogs.createMyCatalog(supA, { title: `${P} Katalog`, startsAt: "2026-01-01" }, PNG, PDF);
    catalogId = c.id;
    await catalogs.addMyCatalogItem(supA, catalogId, { supplierProductId: offerA });
    await expect(catalogs.addMyCatalogItem(supA, catalogId, { supplierProductId: offerB })).rejects.toThrow(/Ürününüzü/);
    await expect(catalogs.getMyCatalog(supB, catalogId)).rejects.toBeInstanceOf(NotFoundError);
    // Onaysız katalog üyeye görünmez
    await expect(catalogs.getShopCatalog(m1, catalogId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(catalogs.reviewCatalog(admin, catalogId, "reject", {})).rejects.toThrow(/gerekçe/);
    await expect(catalogs.reviewCatalog(supA, catalogId, "approve", {})).rejects.toBeInstanceOf(ForbiddenError);
    await catalogs.reviewCatalog(admin, catalogId, "approve", {});
    const v = await catalogs.getShopCatalog(m1, catalogId);
    expect(v.products.map((p) => p.id)).toEqual([productId]);
    expect((await catalogs.listShopCatalogs(m1)).items.some((x) => x.id === catalogId)).toBe(true);
    await expect(catalogs.deleteMyCatalog(supA, catalogId)).rejects.toBeInstanceOf(UserError);
    await catalogs.endMyCatalog(supA, catalogId);
    await expect(catalogs.getShopCatalog(m1, catalogId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
