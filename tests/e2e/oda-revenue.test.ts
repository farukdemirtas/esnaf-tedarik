import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

/**
 * Aşama 6 uçtan uca testleri (Oda tarafı): paket, reklam ve katalog sayfalarının
 * gerçek sunucuda açıldığını ve izin sınırlarının uygulandığını doğrular.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PASS = "TestSifre2026";
const P = `E2E-ODAGELIR-${Date.now()}`;

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE },
    body: new URLSearchParams({ username, password: PASS }),
  });
  return res.headers.get("set-cookie")?.match(/et_session=[^;]+/)?.[0] ?? "";
}

async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie } });
  return { status: res.status, location: res.headers.get("location"), text: res.status === 200 ? await res.text() : "" };
}

let admin = "";
let staff = "";
let supplier = "";
let packageId = "";

beforeAll(async () => {
  [admin, staff, supplier] = await Promise.all([login("test.yonetici"), login("test.personel"), login("test.tedarikci-a")]);
  const supplierA = await db.supplier.findFirstOrThrow({ where: { slug: "test-a" }, include: { chambers: true } });
  const chamberId = supplierA.chambers[0].chamberId;
  packageId = (
    await db.supplierPackage.create({
      data: { chamberId, name: `${P} Vitrin Paketi`, type: "SHOWCASE", price: "1250.00", durationDays: 30, sponsoredSlots: 2, bannerSlots: 1, productLimit: null, active: true },
    })
  ).id;
});

afterAll(async () => {
  if (packageId) {
    await db.supplierSubscription.deleteMany({ where: { packageId } });
    await db.supplierPackage.deleteMany({ where: { id: packageId } });
  }
  await db.$disconnect();
});

describe("Oda gelir modeli sayfaları", () => {
  it.each([
    ["/yonetim/paketler", "Tedarikçi Paketleri"],
    ["/yonetim/reklamlar", "Reklam ve Sponsorlu Ürünler"],
    ["/yonetim/kataloglar", "Dijital Kataloglar"],
  ])("%s açılır", async (path, heading) => {
    const r = await get(path, admin);
    expect(r.status, path).toBe(200);
    expect(r.text).toContain(heading);
  });

  it("paketler sayfası tanımlı paketi ve ödeme açıklamasını gösterir", async () => {
    const r = await get("/yonetim/paketler", admin);
    expect(r.text).toContain(`${P} Vitrin Paketi`);
    expect(r.text).toContain("platform dışında");
  });

  it("reklamlar sayfası banner, sponsorlu ürün ve gelir raporu bölümlerini içerir", async () => {
    const r = await get("/yonetim/reklamlar?from=2026-01-01&to=2026-12-31", admin);
    for (const t of ["Banner reklamlar", "Sponsorlu ürünler", "Gelir raporu", "Paket geliri"]) expect(r.text).toContain(t);
  });

  it("personel paket/reklam/katalog sayfalarına giremez", async () => {
    for (const p of ["/personel/paketler", "/personel/reklamlar", "/personel/kataloglar"]) {
      const r = await get(p, staff);
      expect(r.status, p).toBeGreaterThanOrEqual(300);
      expect(r.status, p).toBeLessThan(400);
      expect(r.location, p).toBe("/yetkisiz");
    }
  });

  it("tedarikçi Oda reklam sayfasına giremez", async () => {
    const r = await get("/yonetim/reklamlar", supplier);
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.location).toBe("/yetkisiz");
  });
});
