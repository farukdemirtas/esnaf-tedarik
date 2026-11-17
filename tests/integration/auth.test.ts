import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/crypto";
import { memberScope, supplierScope, ScopeError } from "@/lib/auth/scope";
import { buildAuthContext } from "@/modules/auth/context";
import { changePassword, createPasswordResetToken, login, resetPasswordWithToken } from "@/modules/auth/service";

/**
 * Servis düzeyi testler. Gerçek PostgreSQL test veritabanına bağlanır;
 * her test kendi kullanıcılarını oluşturur ve sonunda siler.
 */
const run = randomBytes(4).toString("hex");
const PASS = "DogruSifre2026";
const CHAMBER = "chamber-samsun";
const created: { users: string[]; suppliers: string[]; members: string[] } = { users: [], suppliers: [], members: [] };
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function makeUser(kind: "member" | "supplier" | "staff", opts: { mustChange?: boolean } = {}) {
  const username = `it-${run}-${kind}-${created.users.length}`;
  const roleCode = kind === "member" ? "MEMBER_OWNER" : kind === "supplier" ? "SUPPLIER_OWNER" : "CHAMBER_STAFF";
  const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
  const user = await db.user.create({
    data: {
      username,
      fullName: `IT ${kind}`,
      chamberId: CHAMBER,
      passwordHash: await hashPassword(PASS),
      mustChangePassword: opts.mustChange ?? false,
      roles: { create: { roleId: role.id } },
    },
  });
  created.users.push(user.id);
  let supplierId: string | undefined;
  let memberId: string | undefined;
  if (kind === "supplier") {
    const s = await db.supplier.create({
      data: {
        legalName: "IT", tradeName: `IT Sup ${username}`, slug: username, taxOffice: "x", taxNumber: username,
        address: "x", phone: "x", email: `${username}@example.invalid`, contactName: "x", status: "APPROVED",
        users: { create: { userId: user.id } },
      },
    });
    created.suppliers.push(s.id);
    supplierId = s.id;
  }
  if (kind === "member") {
    const m = await db.member.create({
      data: {
        chamberId: CHAMBER, businessName: `IT Bakkal ${username}`, ownerName: "x", registryNumber: username,
        phone: "x", status: "ACTIVE", users: { create: { userId: user.id } },
      },
    });
    created.members.push(m.id);
    memberId = m.id;
  }
  return { user, username, supplierId, memberId };
}

beforeAll(async () => {
  await db.role.findUniqueOrThrow({ where: { code: "MEMBER_OWNER" } }); // seed çalışmış olmalı
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { userId: { in: created.users } } });
  await db.user.deleteMany({ where: { id: { in: created.users } } });
  await db.supplier.deleteMany({ where: { id: { in: created.suppliers } } });
  await db.member.deleteMany({ where: { id: { in: created.members } } });
  await db.loginAttempt.deleteMany({ where: { username: { startsWith: `it-${run}` } } });
  await db.$disconnect();
});

describe("giriş", () => {
  it("doğru bilgilerle oturum açar ve paneline yönlendirir", async () => {
    const { username, user } = await makeUser("member");
    const r = await login({ username, password: PASS }, ip(), "vitest");
    expect(r).toMatchObject({ ok: true, redirectTo: "/magaza" });
    if (!r.ok) throw new Error();
    const session = await db.session.findUnique({ where: { tokenHash: sha256(r.token) } });
    expect(session?.userId).toBe(user.id);
  });

  it("büyük/küçük harf ve boşluk duyarsız kullanıcı adı", async () => {
    const { username } = await makeUser("member");
    const r = await login({ username: `  ${username.toUpperCase()} `, password: PASS }, ip(), null);
    expect(r.ok).toBe(true);
  });

  it("olmayan kullanıcı ve yanlış şifre aynı hatayı verir", async () => {
    const { username } = await makeUser("member");
    expect(await login({ username: `yok-${run}`, password: PASS }, ip(), null)).toEqual({ ok: false, error: "INVALID" });
    expect(await login({ username, password: "yanlis" }, ip(), null)).toEqual({ ok: false, error: "INVALID" });
  });

  it("5 hatalı denemede hesabı geçici kilitler; doğru şifre de reddedilir", async () => {
    const { username, user } = await makeUser("member");
    for (let i = 0; i < 5; i++) await login({ username, password: "yanlis" }, ip(), null);
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await login({ username, password: PASS }, ip(), null)).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("aynı IP'den çok sayıda hatalı denemeyi engeller", async () => {
    const addr = ip();
    await db.loginAttempt.createMany({
      data: Array.from({ length: 30 }, () => ({ username: `it-${run}-flood`, ip: addr, success: false })),
    });
    const { username } = await makeUser("member");
    expect(await login({ username, password: PASS }, addr, null)).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("pasif kullanıcı, pasif üye ve onaysız tedarikçi giremez", async () => {
    const a = await makeUser("member");
    await db.user.update({ where: { id: a.user.id }, data: { status: "PASSIVE" } });
    expect(await login({ username: a.username, password: PASS }, ip(), null)).toEqual({ ok: false, error: "USER_PASSIVE" });

    const b = await makeUser("member");
    await db.member.update({ where: { id: b.memberId }, data: { status: "PASSIVE" } });
    expect(await login({ username: b.username, password: PASS }, ip(), null)).toEqual({ ok: false, error: "MEMBER_NOT_ACTIVE" });

    const c = await makeUser("supplier");
    await db.supplier.update({ where: { id: c.supplierId }, data: { status: "PENDING" } });
    expect(await login({ username: c.username, password: PASS }, ip(), null)).toEqual({ ok: false, error: "SUPPLIER_NOT_APPROVED" });
  });

  it("ilk girişte şifre değiştirme sayfasına yönlendirir", async () => {
    const { username } = await makeUser("member", { mustChange: true });
    expect(await login({ username, password: PASS }, ip(), null)).toMatchObject({ ok: true, redirectTo: "/sifre-degistir" });
  });
});

describe("oturum ve anlık yetki iptali", () => {
  it("hesap pasife alınınca açık oturum anında geçersiz olur", async () => {
    const { username, user } = await makeUser("member");
    const r = await login({ username, password: PASS }, ip(), null);
    if (!r.ok) throw new Error();
    expect(await buildAuthContext(r.token)).not.toBeNull();
    await db.user.update({ where: { id: user.id }, data: { status: "PASSIVE" } });
    expect(await buildAuthContext(r.token)).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("tedarikçi askıya alınınca çalışanlarının oturumu düşer", async () => {
    const { username, supplierId } = await makeUser("supplier");
    const r = await login({ username, password: PASS }, ip(), null);
    if (!r.ok) throw new Error();
    await db.supplier.update({ where: { id: supplierId }, data: { status: "SUSPENDED" } });
    expect(await buildAuthContext(r.token)).toBeNull();
  });

  it("süresi dolan oturum geçersizdir", async () => {
    const { username } = await makeUser("member");
    const r = await login({ username, password: PASS }, ip(), null);
    if (!r.ok) throw new Error();
    await db.session.update({ where: { tokenHash: sha256(r.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await buildAuthContext(r.token)).toBeNull();
  });

  it("uydurma token reddedilir", async () => {
    expect(await buildAuthContext("uydurma-token")).toBeNull();
  });
});

describe("kapsam (satır düzeyi yetki)", () => {
  it("tedarikçi bağlamı kendi firmasıyla sınırlı, üye kapsamı alamaz", async () => {
    const { username, supplierId } = await makeUser("supplier");
    const r = await login({ username, password: PASS }, ip(), null);
    if (!r.ok) throw new Error();
    const ctx = (await buildAuthContext(r.token))!;
    expect(supplierScope(ctx)).toEqual({ supplierId });
    expect(() => memberScope(ctx)).toThrow(ScopeError);
    expect(ctx.permissions.has("panel.admin")).toBe(false);
  });

  it("üye bağlamı kendi işletmesiyle sınırlı ve aidat durumunu içerir", async () => {
    const { username, memberId } = await makeUser("member");
    const r = await login({ username, password: PASS }, ip(), null);
    if (!r.ok) throw new Error();
    let ctx = (await buildAuthContext(r.token))!;
    expect(memberScope(ctx)).toEqual({ memberId });
    expect(() => supplierScope(ctx)).toThrow(ScopeError);
    expect(ctx.member!.dues.orderingBlocked).toBe(false);

    const past = new Date(Date.now() - 40 * 86400_000);
    await db.membershipDue.createMany({
      data: ["2026-08", "2026-09"].map((period) => ({ chamberId: CHAMBER, memberId: memberId!, period, amount: 100, dueDate: past })),
    });
    ctx = (await buildAuthContext(r.token))!;
    expect(ctx.member!.dues).toMatchObject({ overdueCount: 2, orderingBlocked: true });
  });

  it("kişiye özel izin kaldırma uygulanır", async () => {
    const { username, user } = await makeUser("staff");
    const perm = await db.permission.findUniqueOrThrow({ where: { code: "dues.manage" } });
    await db.userPermission.create({ data: { userId: user.id, permissionId: perm.id, granted: false } });
    const r = await login({ username, password: PASS }, ip(), null);
    if (!r.ok) throw new Error();
    const ctx = (await buildAuthContext(r.token))!;
    expect(ctx.permissions.has("dues.manage")).toBe(false);
    expect(ctx.permissions.has("dues.view")).toBe(true);
  });
});

describe("şifre değiştirme ve sıfırlama", () => {
  it("mevcut şifre ve politika kontrolü; başarıda diğer oturumlar kapanır", async () => {
    const { username, user } = await makeUser("member", { mustChange: true });
    const s1 = await login({ username, password: PASS }, ip(), null);
    const s2 = await login({ username, password: PASS }, ip(), null);
    if (!s1.ok || !s2.ok) throw new Error();
    const ctx = (await buildAuthContext(s1.token))!;

    expect(await changePassword(user.id, ctx.sessionId, { currentPassword: "yanlis", newPassword: "YeniSifre2026", confirmPassword: "YeniSifre2026" }, null))
      .toEqual({ ok: false, error: "WRONG_CURRENT" });
    expect(await changePassword(user.id, ctx.sessionId, { currentPassword: PASS, newPassword: "kisa", confirmPassword: "kisa" }, null))
      .toMatchObject({ ok: false, error: "POLICY" });
    expect(await changePassword(user.id, ctx.sessionId, { currentPassword: PASS, newPassword: "YeniSifre2026", confirmPassword: "Farkli2026xx" }, null))
      .toEqual({ ok: false, error: "MISMATCH" });
    expect(await changePassword(user.id, ctx.sessionId, { currentPassword: PASS, newPassword: "YeniSifre2026", confirmPassword: "YeniSifre2026" }, null))
      .toEqual({ ok: true });

    expect(await buildAuthContext(s1.token)).not.toBeNull();
    expect(await buildAuthContext(s2.token)).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);
    expect((await login({ username, password: "YeniSifre2026" }, ip(), null)).ok).toBe(true);
    expect((await login({ username, password: PASS }, ip(), null)).ok).toBe(false);
  });

  it("sıfırlama bağlantısı tek kullanımlıktır ve kilidi açar", async () => {
    const { username, user } = await makeUser("member");
    await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 600_000) } });
    const token = await createPasswordResetToken(user.id, null, null);
    const body = { token, newPassword: "Sifirlandi2026", confirmPassword: "Sifirlandi2026" };
    expect(await resetPasswordWithToken(body, null)).toEqual({ ok: true });
    expect(await resetPasswordWithToken(body, null)).toEqual({ ok: false, error: "INVALID_TOKEN" });
    expect((await login({ username, password: "Sifirlandi2026" }, ip(), null)).ok).toBe(true);
  });

  it("yeni bağlantı eskisini geçersiz kılar; süresi dolan bağlantı reddedilir", async () => {
    const { user } = await makeUser("member");
    const old = await createPasswordResetToken(user.id, null, null);
    const fresh = await createPasswordResetToken(user.id, null, null);
    expect(await resetPasswordWithToken({ token: old, newPassword: "Sifirlandi2026", confirmPassword: "Sifirlandi2026" }, null))
      .toEqual({ ok: false, error: "INVALID_TOKEN" });
    await db.passwordResetToken.update({ where: { tokenHash: sha256(fresh) }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await resetPasswordWithToken({ token: fresh, newPassword: "Sifirlandi2026", confirmPassword: "Sifirlandi2026" }, null))
      .toEqual({ ok: false, error: "INVALID_TOKEN" });
  });
});
