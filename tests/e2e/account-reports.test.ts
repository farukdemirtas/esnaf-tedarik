import { beforeAll, describe, expect, it } from "vitest";

/**
 * Üye "Hesabım" sayfası ve Oda raporları uçtan uca testleri (gerçek sunucu).
 * Veritabanına yazmaz; yalnızca sayfaların açıldığını ve izin sınırlarını doğrular.
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

let member = "";
let admin = "";
let staff = "";
let supplier = "";

beforeAll(async () => {
  [member, admin, staff, supplier] = await Promise.all([login("test.uye-1"), login("test.yonetici"), login("test.personel"), login("test.tedarikci-a")]);
  expect(member && admin && staff && supplier, "test hesaplarıyla giriş yapılamadı").toBeTruthy();
});

describe("üye hesabım sayfası", () => {
  it("üye kendi hesap sayfasını açar", async () => {
    const r = await get("/magaza/hesabim", member);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Teslimat adresleri");
    expect(r.text).toContain("Aidat durumu");
  });
});

describe("oda raporları", () => {
  it("yönetici raporlar sayfasını açar", async () => {
    const r = await get("/yonetim/raporlar", admin);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Raporlar");
  });

  it("personel (report.view) raporlar sayfasını açar", async () => {
    const r = await get("/personel/raporlar", staff);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Raporlar");
  });

  it("tarih aralığı ve aylık gruplama ile açılır", async () => {
    const r = await get("/yonetim/raporlar?from=2026-01-01&to=2026-12-31&group=month", admin);
    expect(r.status).toBe(200);
    expect(r.text).toContain("Raporlar");
  });

  it("tedarikçi yönetim raporlarına erişemez", async () => {
    const r = await get("/yonetim/raporlar", supplier);
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.location).toMatch(/\/yetkisiz$/);
  });

  it("üye yönetim raporlarına erişemez", async () => {
    const r = await get("/yonetim/raporlar", member);
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.location).toMatch(/\/yetkisiz$/);
  });
});
