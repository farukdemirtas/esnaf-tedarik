import { describe, expect, it } from "vitest";

/**
 * Uçtan uca rol testleri: çalışan uygulamaya (test veritabanıyla) gerçek HTTP istekleri gönderir.
 * Çalıştırma: npm run test:e2e  (E2E_BASE_URL varsayılan http://localhost:3100)
 * Gerekli: SEED_TEST_USERS=1 ile seed edilmiş test veritabanı.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PASS = "TestSifre2026";
const PANELS = ["/yonetim", "/personel", "/tedarikci", "/magaza"] as const;

async function login(username: string, password = PASS, origin: string | null = BASE) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
    body: new URLSearchParams({ username, password }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/et_session=[^;]+/)?.[0] ?? "";
  return { status: res.status, location: res.headers.get("location"), cookie };
}

async function get(path: string, cookie = "") {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: res.status, location: res.headers.get("location"), text: res.status === 200 ? await res.text() : "", headers: res.headers };
}

const ROLES = [
  { username: "test.yonetici", panel: "/yonetim" },
  { username: "test.personel", panel: "/personel" },
  { username: "test.tedarikci-a", panel: "/tedarikci" },
  { username: "test.tedarikci-a-calisan", panel: "/tedarikci" },
  { username: "test.uye-1", panel: "/magaza" },
] as const;

describe("giriş yapmamış ziyaretçi", () => {
  it.each(PANELS)("%s → giriş sayfasına yönlendirilir", async (p) => {
    const r = await get(p);
    expect(r.status).toBe(307);
    expect(r.location).toContain(`/giris?next=${encodeURIComponent(p)}`);
  });

  it("giriş sayfası açılır ve güvenlik başlıkları gönderilir", async () => {
    const r = await get("/giris");
    expect(r.status).toBe(200);
    expect(r.text).toContain("Sisteme Giriş");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("dosya API'si oturumsuz 401 döner", async () => {
    expect((await get("/api/files/products/x.png")).status).toBe(401);
  });
});

describe("giriş güvenliği", () => {
  it("Origin başlığı olmayan (CSRF) istek reddedilir", async () => {
    expect((await login("test.uye-1", PASS, null)).status).toBe(403);
    expect((await login("test.uye-1", PASS, "http://kotu-site.example")).status).toBe(403);
  });

  it("yanlış şifre", async () => {
    const r = await login("test.uye-2", "YanlisSifre1");
    expect(r.status).toBe(303);
    expect(r.location).toBe("/giris?hata=gecersiz");
    expect(r.cookie).toBe("");
  });

  it("onaysız tedarikçi ve pasif üye giremez", async () => {
    expect((await login("test.tedarikci-onaysiz")).location).toBe("/giris?hata=tedarikci-onaysiz");
    expect((await login("test.uye-pasif")).location).toBe("/giris?hata=uye-pasif");
  });

  it("dış adrese yönlendirme (open redirect) yapılmaz", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE },
      body: new URLSearchParams({ username: "test.uye-1", password: PASS, next: "//kotu-site.example" }),
    });
    expect(res.headers.get("location")).toBe("/magaza");
  });
});

describe.each(ROLES)("rol: $username", ({ username, panel }) => {
  it("kendi paneline yönlendirilir ve erişir; diğer panellere erişemez", async () => {
    const l = await login(username);
    expect(l.status).toBe(303);
    expect(l.location).toBe(panel);
    expect(l.cookie).toMatch(/^et_session=/);

    const own = await get(panel, l.cookie);
    expect(own.status).toBe(200);

    for (const other of PANELS.filter((p) => p !== panel)) {
      const r = await get(other, l.cookie);
      expect(r.status, `${username} → ${other}`).toBe(307);
      expect(r.location).toBe("/yetkisiz");
    }
  });
});

describe("veri izolasyonu", () => {
  it("tedarikçi yalnızca kendi firmasını görür", async () => {
    const a = await login("test.tedarikci-a");
    const page = await get("/tedarikci", a.cookie);
    expect(page.text).toContain("TEST Tedarikçi A");
    expect(page.text).not.toContain("TEST Tedarikçi B");
  });

  it("üye yalnızca kendi işletmesini görür", async () => {
    const m = await login("test.uye-1");
    const page = await get("/magaza", m.cookie);
    expect(page.text).toContain("TEST Bakkal 1");
    expect(page.text).not.toContain("TEST Bakkal 2");
  });
});

describe("zorunlu şifre değişikliği ve çıkış", () => {
  it("ilk girişte panel yerine şifre değiştirme sayfası", async () => {
    const l = await login("test.ilk-giris");
    expect(l.location).toBe("/sifre-degistir");
    expect((await get("/magaza", l.cookie)).location).toBe("/sifre-degistir");
    expect((await get("/sifre-degistir", l.cookie)).status).toBe(200);
  });

  it("çıkış sonrası eski çerez geçersizdir", async () => {
    const l = await login("test.uye-1");
    expect((await get("/magaza", l.cookie)).status).toBe(200);
    const out = await fetch(`${BASE}/api/auth/logout`, { method: "POST", redirect: "manual", headers: { cookie: l.cookie, origin: BASE } });
    expect(out.status).toBe(303);
    const after = await get("/magaza", l.cookie);
    expect(after.status).toBe(307);
    expect(after.location).toBe("/giris");
  });

  it("uydurma çerezle erişilemez", async () => {
    const r = await get("/yonetim", "et_session=uydurma");
    expect(r.status).toBe(307);
    expect(r.location).toBe("/giris");
  });
});
