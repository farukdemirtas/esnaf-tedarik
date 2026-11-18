import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Aşama 6 uçtan uca testleri: tedarikçi pazarlama sayfaları (paketler, banner, sponsorlu, katalog),
 * çalışan kısıtı ve firmalar arası katalog izolasyonu (A'nın kataloğu B'ye 404).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const P = `e2e6${randomBytes(3).toString("hex")}`;

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
let catalogId = "";

beforeAll(async () => {
  [owner, staff, other] = await Promise.all([login("test.tedarikci-a"), login("test.tedarikci-a-calisan"), login("test.tedarikci-b")]);
  const supA = await db.supplier.findUniqueOrThrow({ where: { slug: "test-a" } });
  const catalog = await db.catalog.create({ data: { supplierId: supA.id, title: `${P} Katalog`, startsAt: new Date(), status: "PENDING" } });
  catalogId = catalog.id;
});

afterAll(async () => {
  await db.catalog.deleteMany({ where: { title: { startsWith: P } } });
  await db.$disconnect();
});

const PAGES = ["/tedarikci/pazarlama", "/tedarikci/reklamlar", "/tedarikci/sponsorlu", "/tedarikci/kataloglar"];

describe("tedarikçi yetkilisi — pazarlama", () => {
  it.each(PAGES)("%s açılır", async (p) => {
    expect((await get(p, owner)).status, p).toBe(200);
  });

  it("kendi kataloğunu listede ve detayda görür", async () => {
    expect((await get("/tedarikci/kataloglar", owner)).text).toContain(`${P} Katalog`);
    const r = await get(`/tedarikci/kataloglar/${catalogId}`, owner);
    expect(r.status).toBe(200);
    expect(r.text).toContain(`${P} Katalog`);
  });
});

describe("tedarikçi çalışanı (pazarlama izni yok)", () => {
  it.each([...PAGES, "/tedarikci/kataloglar/x"])("%s yetkisiz", async (p) => {
    const r = await get(p, staff);
    expect(r.status, p).toBeGreaterThanOrEqual(300);
    expect(r.status, p).toBeLessThan(400);
    expect(r.location, p).toBe("/yetkisiz");
  });
});

describe("firmalar arası izolasyon", () => {
  it("B firması A'nın kataloğunu açamaz (404)", async () => {
    expect((await get(`/tedarikci/kataloglar/${catalogId}`, other)).status).toBe(404);
  });

  it("B'nin katalog listesinde A'nın kataloğu görünmez", async () => {
    expect((await get("/tedarikci/kataloglar", other)).text).not.toContain(`${P} Katalog`);
  });
});
