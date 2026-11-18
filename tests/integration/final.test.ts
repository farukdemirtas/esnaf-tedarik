import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { login, requestPasswordResetByEmail, resetPasswordWithToken } from "@/modules/auth/service";
import { notifySupplier } from "@/modules/notifications/service";
import { dispatchPendingEmails } from "@/modules/notifications/dispatch";
import { listMyNotifications, unreadCount } from "@/modules/notifications/inbox";
import { listShopProducts } from "@/modules/shop/catalog";

/** Son düzenlemeler: e-posta bildirim kuyruğu, e-postayla şifre sıfırlama, fiyata göre sıralama. */
const P = `it7${randomBytes(3).toString("hex")}`;
const ip = () => `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const CH = "chamber-samsun";
let supA: AuthContext, m1: AuthContext;
let userId = "", addressId = "", districtId = "";
let prevDefaults: string[] = [];
let areaCreated = false;

async function ctxFor(username: string, password = "TestSifre2026") {
  const r = await login({ username, password }, ip(), null);
  if (!r.ok) throw new Error(`${username}: ${r.error}`);
  return (await buildAuthContext(r.token))!;
}

beforeAll(async () => {
  [supA, m1] = await Promise.all([ctxFor("test.tedarikci-a"), ctxFor("test.uye-1")]);
  const hash = (await db.user.findUniqueOrThrow({ where: { username: "test.uye-2" } })).passwordHash;
  userId = (await db.user.create({ data: { username: `${P}.kullanici`, fullName: "TEST Sıfırlama", email: `${P}@example.com`, passwordHash: hash, mustChangePassword: false, chamberId: CH, roles: { create: { role: { connect: { code: "MEMBER_OWNER" } } } }, memberUser: { create: { memberId: m1.member!.id } } } })).id;
  // Fiyat sıralaması için: 3 ürün, farklı birim fiyatlar
  districtId = (await db.district.findFirstOrThrow({ where: { chamberId: CH }, orderBy: { name: "asc" }, skip: 3 })).id;
  const key = { supplierId_districtId: { supplierId: supA.supplier!.id, districtId } };
  if (!(await db.deliveryArea.findUnique({ where: key }))) {
    await db.deliveryArea.create({ data: { supplierId: supA.supplier!.id, districtId, deliveryDays: [1] } });
    areaCreated = true;
  }
  prevDefaults = (await db.address.findMany({ where: { memberId: m1.member!.id, isDefault: true }, select: { id: true } })).map((a) => a.id);
  await db.address.updateMany({ where: { memberId: m1.member!.id }, data: { isDefault: false } });
  addressId = (await db.address.create({ data: { memberId: m1.member!.id, title: `${P} adres`, districtId, line: "Test sokak 3", isDefault: true } })).id;
  const brand = await db.brand.create({ data: { name: `${P} Marka`, slug: `${P}-marka` } });
  const cat = await db.category.findFirstOrThrow({ where: { chamberId: CH, parentId: null } });
  for (const [name, price, units] of [["Pahalı", 600, 10], ["Ucuz", 100, 10], ["Orta", 360, 12]] as const) {
    const p = await db.product.create({ data: { chamberId: CH, name: `${P} ${name}`, slug: `${P}-${name.toLowerCase()}`, brandId: brand.id, categoryId: cat.id } });
    await db.supplierProduct.create({ data: { supplierId: supA.supplier!.id, productId: p.id, packType: "KOLI", unitsPerPack: units, unitPrice: price / units, packPrice: price, stock: { create: { quantity: 5 } } } });
  }
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const like = { startsWith: P };
  await db.supplierProduct.deleteMany({ where: { product: { name: like } } });
  await db.product.deleteMany({ where: { name: like } });
  await db.brand.deleteMany({ where: { name: like } });
  await db.address.deleteMany({ where: { id: addressId } });
  await db.address.updateMany({ where: { id: { in: prevDefaults } }, data: { isDefault: true } });
  if (areaCreated) await db.deliveryArea.deleteMany({ where: { supplierId: supA.supplier!.id, districtId } });
  await db.notification.deleteMany({ where: { title: like } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("fiyata göre sıralama", () => {
  it("ürünler en düşük birim fiyata göre sıralanır", async () => {
    const r = await listShopProducts(m1, { q: P, sirala: "fiyat" });
    expect(r.items.map((p) => p.name)).toEqual([`${P} Ucuz`, `${P} Orta`, `${P} Pahalı`]);
    expect(r.total).toBe(3);
  });
});

describe("e-posta bildirimleri", () => {
  it("e-posta kapalıyken yalnızca panel içi bildirim oluşur", async () => {
    vi.stubEnv("SMTP_URL", "");
    await notifySupplier(supA.supplier!.id, { type: "test", title: `${P} kapalı`, message: "x" });
    expect(await db.notification.count({ where: { title: `${P} kapalı`, channel: "EMAIL" } })).toBe(0);
    expect(await db.notification.count({ where: { title: `${P} kapalı`, channel: "IN_APP" } })).toBeGreaterThan(0);
  });

  it("e-posta açıkken kuyruğa eklenir, işçi gönderir; panel listesi yalnızca panel içi bildirimleri gösterir", async () => {
    vi.stubEnv("SMTP_URL", "log");
    vi.stubEnv("MAIL_FROM", "Test <test@example.com>");
    const before = await unreadCount(supA.userId);
    await notifySupplier(supA.supplier!.id, { type: "test", title: `${P} açık`, message: "Yeni sipariş", link: "/tedarikci/siparisler" });
    expect(await db.notification.count({ where: { title: `${P} açık`, channel: "EMAIL", delivery: "PENDING" } })).toBeGreaterThan(0);
    expect(await unreadCount(supA.userId)).toBe(before + 1);
    const list = await listMyNotifications(supA, {});
    expect(list.items.every((n) => n.channel === "IN_APP")).toBe(true);
    const r = await dispatchPendingEmails(500);
    expect(r.sent + r.skipped).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { title: `${P} açık`, channel: "EMAIL", delivery: "PENDING" } })).toBe(0);
  });
});

describe("e-postayla şifre sıfırlama", () => {
  it("kapalıyken devre dışı; açıkken bağlantı gönderilir ve kullanılabilir; bilinmeyen kullanıcı ifşa edilmez", async () => {
    vi.stubEnv("SMTP_URL", "");
    expect(await requestPasswordResetByEmail(`${P}.kullanici`, ip())).toBe("DISABLED");
    vi.stubEnv("SMTP_URL", "log");
    vi.stubEnv("MAIL_FROM", "Test <test@example.com>");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(String(m)));
    expect(await requestPasswordResetByEmail("boyle-biri-yok", ip())).toBe("SENT");
    expect(await requestPasswordResetByEmail(`${P}@example.com`, ip())).toBe("SENT");
    spy.mockRestore();
    const line = logs.find((l) => l.includes("sifre-sifirla?token="))!;
    expect(line).toContain(`${P}@example.com`);
    const token = line.match(/token=([A-Za-z0-9_-]+)/)![1];
    const r = await resetPasswordWithToken({ token, newPassword: "YeniSifre2026x", confirmPassword: "YeniSifre2026x" }, null);
    expect(r.ok).toBe(true);
    await expect(ctxFor(`${P}.kullanici`, "YeniSifre2026x")).resolves.toBeTruthy();
  });

  it("aynı IP'den çok fazla talep sınırlanır", async () => {
    vi.stubEnv("SMTP_URL", "log");
    vi.stubEnv("MAIL_FROM", "Test <test@example.com>");
    const same = ip();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await requestPasswordResetByEmail("kimse", same));
    expect(results.at(-1)).toBe("RATE_LIMITED");
  });
});
