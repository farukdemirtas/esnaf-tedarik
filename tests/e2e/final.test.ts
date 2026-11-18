import { describe, expect, it } from "vitest";

/** Son eklemeler: sağlık kontrolü, şifremi unuttum, fiyata göre sıralama, rapor sayfası. */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE },
    body: new URLSearchParams({ username, password: "TestSifre2026" }),
  });
  return res.headers.get("set-cookie")?.match(/et_session=[^;]+/)?.[0] ?? "";
}

describe("son eklemeler", () => {
  it("/api/health çalışır ve ayrıntı vermez", async () => {
    const r = await fetch(`${BASE}/api/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
  });

  it("şifremi unuttum sayfası açılır; başka kökenden istek reddedilir", async () => {
    const page = await fetch(`${BASE}/sifremi-unuttum`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Şifremi Unuttum");
    const bad = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://kotu.example.com" },
      body: new URLSearchParams({ identifier: "test.uye-1" }),
    });
    expect(bad.status).toBe(403);
  });

  it("ürünler fiyata göre sıralanabilir", async () => {
    const cookie = await login("test.uye-1");
    const r = await fetch(`${BASE}/magaza/urunler?sirala=fiyat`, { headers: { cookie }, redirect: "manual" });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("En düşük birim fiyat");
  });
});
