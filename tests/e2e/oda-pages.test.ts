import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

/**
 * Aşama 3 uçtan uca testleri: yönetici ve personel sayfalarının gerçek sunucuda
 * açıldığını ve izin sınırlarının uygulandığını doğrular.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PASS = "TestSifre2026";

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
let memberId = "";
let supplierId = "";

beforeAll(async () => {
  [admin, staff, supplier] = await Promise.all([login("test.yonetici"), login("test.personel"), login("test.tedarikci-a")]);
  memberId = (await db.member.findFirstOrThrow({ where: { registryNumber: "TEST-1" } })).id;
  supplierId = (await db.supplier.findFirstOrThrow({ where: { slug: "test-a" } })).id;
});
afterAll(() => db.$disconnect());

const ADMIN_PAGES = [
  "/yonetim",
  "/yonetim/uyeler",
  "/yonetim/uyeler/yeni",
  "/yonetim/aidatlar",
  "/yonetim/tedarikciler",
  "/yonetim/tedarikciler/yeni",
  "/yonetim/kategoriler",
  "/yonetim/markalar",
  "/yonetim/urunler",
  "/yonetim/urunler/yeni",
  "/yonetim/urun-talepleri",
  "/yonetim/teklifler",
  "/yonetim/kampanyalar",
  "/yonetim/siparisler",
  "/yonetim/duyurular",
  "/yonetim/kullanicilar",
  "/yonetim/denetim",
  "/yonetim/ayarlar",
];

describe("yönetici paneli", () => {
  it.each(ADMIN_PAGES)("%s açılır", async (p) => {
    const r = await get(p, admin);
    expect(r.status, p).toBe(200);
  });

  it("üye ve tedarikçi detay sayfaları açılır; olmayan kayıt 404", async () => {
    expect((await get(`/yonetim/uyeler/${memberId}`, admin)).text).toContain("TEST Bakkal 1");
    expect((await get(`/yonetim/tedarikciler/${supplierId}`, admin)).text).toContain("TEST Tedarikçi A");
    expect((await get(`/yonetim/uyeler/olmayan-kayit`, admin)).status).toBe(404);
  });

  it("menü tüm yönetim bölümlerini içerir", async () => {
    const r = await get("/yonetim", admin);
    for (const label of ["Üyeler", "Aidatlar", "Tedarikçiler", "Kategoriler", "Kullanıcılar ve Yetkiler", "Denetim Kayıtları"]) expect(r.text).toContain(label);
  });
});

describe("personel paneli (sınırlı yetki)", () => {
  it.each(["/personel", "/personel/uyeler", "/personel/aidatlar", "/personel/tedarikciler", "/personel/siparisler"])("%s açılır", async (p) => {
    expect((await get(p, staff)).status, p).toBe(200);
  });

  it("personel üye detayını görür", async () => {
    expect((await get(`/personel/uyeler/${memberId}`, staff)).text).toContain("TEST Bakkal 1");
  });

  it.each(["/personel/kullanicilar", "/personel/ayarlar", "/personel/kategoriler", "/personel/denetim", "/personel/uyeler/yeni", "/personel/kampanyalar"])(
    "%s yetkisiz",
    async (p) => {
      const r = await get(p, staff);
      expect(r.status, p).toBe(307);
      expect(r.location).toBe("/yetkisiz");
    },
  );

  it("personel menüsünde yönetici bölümleri görünmez", async () => {
    const r = await get("/personel", staff);
    expect(r.text).toContain("Üyeler");
    expect(r.text).not.toContain("Kullanıcılar ve Yetkiler");
    expect(r.text).not.toContain("Denetim Kayıtları");
  });

  it("personel yönetici paneline giremez", async () => {
    expect((await get("/yonetim/uyeler", staff)).location).toBe("/yetkisiz");
  });
});

describe("diğer roller", () => {
  it("tedarikçi Oda sayfalarına giremez", async () => {
    for (const p of ["/yonetim/uyeler", "/personel/uyeler", `/yonetim/tedarikciler/${supplierId}`]) expect((await get(p, supplier)).location, p).toBe("/yetkisiz");
  });

  it("başvuru ve KVKK sayfaları herkese açık", async () => {
    for (const p of ["/basvuru", "/basvuru/uye", "/basvuru/tedarikci", "/kvkk"]) expect((await get(p, "")).status, p).toBe(200);
  });
});
