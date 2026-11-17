import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError, UserError } from "@/lib/errors";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { login } from "@/modules/auth/service";
import * as members from "@/modules/members/service";
import * as dues from "@/modules/members/dues-admin";
import { getMemberDuesState } from "@/modules/members/dues";
import * as suppliers from "@/modules/suppliers/service";
import * as taxonomy from "@/modules/catalog/taxonomy";
import * as products from "@/modules/catalog/products";
import * as offers from "@/modules/catalog/offers-admin";
import * as campaigns from "@/modules/campaigns/review";
import * as users from "@/modules/users/service";
import * as apps from "@/modules/applications/service";

/**
 * Aşama 3 servis testleri: Oda yönetimi iş kuralları ve yetki sınırları.
 * Test veritabanında seed edilmiş test.yonetici / test.personel hesaplarıyla çalışır.
 */
const run = randomBytes(3).toString("hex");
const P = `it3${run}`; // kayıtları ayırt etmek için önek
const ip = () => `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
let admin: AuthContext;
let staff: AuthContext;
let seq = 0;
const uniq = () => `${P}${++seq}`;
const taxNo = () => String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 9000) + 1000);

async function ctxFor(username: string, password: string) {
  const r = await login({ username, password }, ip(), null);
  if (!r.ok) throw new Error(`giriş başarısız: ${username} ${r.error}`);
  return (await buildAuthContext(r.token))!;
}

const memberInput = (o: Record<string, string> = {}) => ({
  businessName: `${P} Bakkal ${++seq}`,
  ownerName: "Test Sahibi",
  registryNumber: uniq(),
  phone: "05321234567",
  ...o,
});
const supplierInput = (o: Record<string, string> = {}) => ({
  legalName: `${P} Gıda Ltd. Şti.`,
  tradeName: `${P} Dağıtım ${++seq}`,
  taxOffice: "Samsun",
  taxNumber: taxNo(),
  address: "Test adresi 1",
  phone: "03621234567",
  email: `${uniq()}@example.invalid`,
  contactName: "Yetkili Kişi",
  minOrderAmount: "500",
  ...o,
});

beforeAll(async () => {
  admin = await ctxFor("test.yonetici", "TestSifre2026");
  staff = await ctxFor("test.personel", "TestSifre2026");
});

afterAll(async () => {
  const like = { startsWith: P };
  await db.membershipDue.deleteMany({ where: { period: { in: ["2026-01", "2026-02"] } } });
  await db.campaign.deleteMany({ where: { title: like } });
  await db.supplierProduct.deleteMany({ where: { product: { name: like } } });
  await db.productRequest.deleteMany({ where: { name: like } });
  await db.product.deleteMany({ where: { name: like } });
  await db.brand.deleteMany({ where: { name: like } });
  await db.category.deleteMany({ where: { name: like, parentId: { not: null } } });
  await db.category.deleteMany({ where: { name: like } });
  const us = await db.user.findMany({ where: { OR: [{ username: like }, { fullName: like }, { memberUser: { member: { businessName: like } } }, { supplierUser: { supplier: { tradeName: like } } }] }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { userId: { in: us.map((u) => u.id) } } });
  await db.user.deleteMany({ where: { id: { in: us.map((u) => u.id) } } });
  await db.member.deleteMany({ where: { businessName: like } });
  await db.supplier.deleteMany({ where: { tradeName: like } });
  await db.$disconnect();
});

describe("yetki sınırları (personel)", () => {
  it("personel üyeleri görebilir ama yönetici işlemlerini yapamaz", async () => {
    await expect(members.listMembers(staff, {})).resolves.toBeTruthy();
    await expect(members.createMember(staff, memberInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taxonomy.createCategory(staff, { name: `${P} kat` })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suppliers.createSupplier(staff, { ...supplierInput(), ownerName: "Xx Yy" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(users.listUsers(staff, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(dues.updateDuesThreshold(staff, { threshold: "5" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("personel üye güncelleyebilir ve başvuru onaylayabilir (varsayılan izinleri)", async () => {
    const m = await members.createMember(admin, memberInput());
    await expect(members.updateMember(staff, m.member.id, { ...memberInput(), registryNumber: m.member.registryNumber })).resolves.toBeUndefined();
    await expect(members.setMemberActive(staff, m.member.id, false, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("üye yönetimi", () => {
  it("üye eklenir, geçici şifre ile ilk girişte şifre değiştirme istenir", async () => {
    const r = await members.createMember(admin, memberInput({ taxId: "12345678901" }));
    expect(r.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const stored = await db.member.findUniqueOrThrow({ where: { id: r.member.id } });
    expect(stored.taxIdEncrypted).not.toContain("12345678901");
    const l = await login({ username: r.username, password: r.tempPassword }, ip(), null);
    expect(l).toMatchObject({ ok: true, redirectTo: "/sifre-degistir" });
  });

  it("aynı sicil numarası ikinci kez eklenemez; geçersiz telefon reddedilir", async () => {
    const reg = uniq();
    await members.createMember(admin, memberInput({ registryNumber: reg }));
    await expect(members.createMember(admin, memberInput({ registryNumber: reg }))).rejects.toBeInstanceOf(UserError);
    await expect(members.createMember(admin, memberInput({ phone: "123" }))).rejects.toBeInstanceOf(ZodError);
  });

  it("başvuru onayı hesap oluşturur; pasife alma oturumları kapatır", async () => {
    await apps.submitMemberApplication({ ...memberInput(), kvkk: "on" }, ip());
    const pending = await db.member.findFirstOrThrow({ where: { businessName: { startsWith: P }, status: "PENDING" }, orderBy: { createdAt: "desc" } });
    const creds = await members.approveMember(admin, pending.id, {});
    expect(creds?.username).toBe(pending.registryNumber.toLowerCase());
    const l = await login({ username: creds!.username, password: creds!.tempPassword }, ip(), null);
    if (!l.ok) throw new Error();
    await members.setMemberActive(admin, pending.id, false, { note: "test" });
    expect(await buildAuthContext(l.token)).toBeNull();
  });

  it("ret gerekçesi zorunlu; yalnızca bekleyen başvuru reddedilir", async () => {
    const m = await members.createMember(admin, memberInput());
    await expect(members.rejectMember(admin, m.member.id, { note: "uygun değil" })).rejects.toBeInstanceOf(UserError);
  });

  it("ilk adres otomatik varsayılan olur; başka Oda ilçesi seçilemez", async () => {
    const m = await members.createMember(admin, memberInput());
    const district = await db.district.findFirstOrThrow({ where: { chamberId: admin.chamberId! } });
    await members.addAddress(admin, m.member.id, { title: "Dükkan", districtId: district.id, line: "Test caddesi no 5" });
    const a = await db.address.findFirstOrThrow({ where: { memberId: m.member.id } });
    expect(a.isDefault).toBe(true);
    await expect(members.addAddress(admin, m.member.id, { title: "X", districtId: "yok", line: "Test caddesi no 5" })).rejects.toBeInstanceOf(UserError);
  });
});

describe("aidat", () => {
  it("dönem aidatı tüm aktif üyelere açılır, tekrar çalıştırmada atlanır; eşik aşılınca sipariş kapanır", async () => {
    const m = await members.createMember(admin, memberInput());
    const r1 = await dues.createDuesForPeriod(admin, { period: "2026-01", amount: "150", dueDate: "2026-01-31" });
    expect(r1.created).toBeGreaterThan(0);
    const r2 = await dues.createDuesForPeriod(admin, { period: "2026-01", amount: "150", dueDate: "2026-01-31" });
    expect(r2.created).toBe(0);
    await dues.addDue(admin, m.member.id, { period: "2026-02", amount: "150,50", dueDate: "2026-02-28" });
    expect((await getMemberDuesState(m.member.id, admin.chamberId!)).orderingBlocked).toBe(true);

    const due = await db.membershipDue.findFirstOrThrow({ where: { memberId: m.member.id, period: "2026-02" } });
    expect(due.amount.toString()).toBe("150.5");
    await dues.markDuePaid(admin, due.id, { paidAt: "2026-03-01" });
    expect((await getMemberDuesState(m.member.id, admin.chamberId!)).orderingBlocked).toBe(false);
    await expect(dues.deleteDue(admin, due.id)).rejects.toBeInstanceOf(UserError); // ödenmiş kayıt silinemez
    await expect(dues.waiveDue(admin, due.id, { note: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(dues.markDuePaid(admin, due.id, { paidAt: "2099-01-01" })).rejects.toBeInstanceOf(UserError);
    await expect(dues.addDue(admin, m.member.id, { period: "2026-02", amount: "1", dueDate: "2026-02-28" })).rejects.toBeInstanceOf(UserError);
  });
});

describe("tedarikçi yönetimi", () => {
  it("Oda eklediği firma onaylı açılır; aynı vergi no ikinci kez eklenemez", async () => {
    const input = supplierInput();
    const r = await suppliers.createSupplier(admin, { ...input, ownerName: "Firma Yetkilisi" });
    expect(r.supplier.status).toBe("APPROVED");
    expect((await login({ username: r.username, password: r.tempPassword }, ip(), null)).ok).toBe(true);
    await expect(suppliers.createSupplier(admin, { ...supplierInput({ taxNumber: input.taxNumber }), ownerName: "Xx Yy" })).rejects.toBeInstanceOf(UserError);
  });

  it("başvuru onayı hesap açar; askıya alma oturumu düşürür ve girişi engeller", async () => {
    const input = supplierInput();
    await apps.submitSupplierApplication({ ...input, kvkk: "on" }, ip());
    const s = await db.supplier.findUniqueOrThrow({ where: { taxNumber: input.taxNumber } });
    expect(s.status).toBe("PENDING");
    const creds = await suppliers.approveSupplier(admin, s.id, {});
    const l = await login({ username: creds!.username, password: creds!.tempPassword }, ip(), null);
    if (!l.ok) throw new Error();
    await expect(suppliers.setSupplierSuspended(admin, s.id, true, {})).rejects.toBeInstanceOf(ZodError); // gerekçe zorunlu
    await suppliers.setSupplierSuspended(admin, s.id, true, { note: "belge eksik" });
    expect(await buildAuthContext(l.token)).toBeNull();
    expect(await login({ username: creds!.username, password: creds!.tempPassword }, ip(), null)).toEqual({ ok: false, error: "SUPPLIER_NOT_APPROVED" });
  });

  it("firmaya çalışan eklenir; çalışan fiyat iznine sahip değildir", async () => {
    const r = await suppliers.createSupplier(admin, { ...supplierInput(), ownerName: "Sahip" });
    const u = await suppliers.addSupplierUser(admin, r.supplier.id, { fullName: `${P} Çalışan`, username: uniq(), role: "SUPPLIER_STAFF" });
    const ctx = await ctxFor(u.username, u.tempPassword);
    expect(ctx.supplier?.id).toBe(r.supplier.id);
    expect(ctx.permissions.has("supplierSelf.pricing")).toBe(false);
    expect(ctx.permissions.has("supplierSelf.orders.process")).toBe(true);
  });
});

describe("kategori, marka, ürün", () => {
  it("kategori döngüsü ve dolu kategori silme engellenir", async () => {
    await taxonomy.createCategory(admin, { name: `${P} Ana`, active: "on" });
    const parent = await db.category.findFirstOrThrow({ where: { name: `${P} Ana` } });
    await taxonomy.createCategory(admin, { name: `${P} Alt`, parentId: parent.id, active: "on" });
    const child = await db.category.findFirstOrThrow({ where: { name: `${P} Alt` } });
    await expect(taxonomy.updateCategory(admin, parent.id, { name: `${P} Ana`, parentId: child.id })).rejects.toBeInstanceOf(UserError);
    await expect(taxonomy.deleteCategory(admin, parent.id)).rejects.toBeInstanceOf(UserError);
  });

  it("marka adı büyük/küçük harf farkıyla tekrar eklenemez", async () => {
    await taxonomy.createBrand(admin, { name: `${P} Marka` });
    await expect(taxonomy.createBrand(admin, { name: `${P} MARKA` })).rejects.toBeInstanceOf(UserError);
  });

  it("barkod tekildir; görsel içerik kontrolünden geçer", async () => {
    await taxonomy.createBrand(admin, { name: `${P} B2` });
    const brand = await db.brand.findFirstOrThrow({ where: { name: `${P} B2` } });
    const cat = await db.category.findFirstOrThrow({ where: { chamberId: admin.chamberId!, parentId: null } });
    const barcode = `869${Date.now()}`.slice(0, 13);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    const p = await products.createProduct(admin, { name: `${P} Kola 1L`, barcode, brandId: brand.id, categoryId: cat.id, unitType: "LITRE", unitAmount: "1", status: "ACTIVE" }, png);
    expect(await db.productImage.count({ where: { productId: p.id } })).toBe(1);
    await expect(
      products.createProduct(admin, { name: `${P} Kopya`, barcode, brandId: brand.id, categoryId: cat.id, unitType: "ADET", status: "ACTIVE" }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(products.addProductImage(admin, p.id, Buffer.from("<script>alert(1)</script>".padEnd(64)))).rejects.toThrow("Desteklenmeyen");

    // Aynı barkodlu talep mevcut ürüne bağlanır; yeni barkodlu talep yeni ürün + marka oluşturur
    const sup = await suppliers.createSupplier(admin, { ...supplierInput(), ownerName: "Sahip Kişi" });
    const r1 = await db.productRequest.create({ data: { chamberId: admin.chamberId!, supplierId: sup.supplier.id, name: `${P} Kola talep`, barcode, brandName: "x" } });
    const a1 = await products.approveProductRequest(admin, r1.id, { name: `${P} Kola talep`, barcode, brandName: "x", categoryId: cat.id, unitType: "ADET" });
    expect(a1).toEqual({ productId: p.id, linked: true });
    const r2 = await db.productRequest.create({ data: { chamberId: admin.chamberId!, supplierId: sup.supplier.id, name: `${P} Yeni ürün`, brandName: `${P} YeniMarka` } });
    const a2 = await products.approveProductRequest(admin, r2.id, { name: `${P} Yeni ürün`, brandName: `${P} YeniMarka`, categoryId: cat.id, unitType: "ADET" });
    expect(a2.linked).toBe(false);
    expect(await db.brand.count({ where: { name: `${P} YeniMarka` } })).toBe(1);
    expect(await db.notification.count({ where: { user: { supplierUser: { supplierId: sup.supplier.id } }, type: "productRequest.approved" } })).toBe(2);
    await expect(products.approveProductRequest(admin, r2.id, { name: "x", brandName: "x", categoryId: cat.id, unitType: "ADET" })).rejects.toBeInstanceOf(UserError);

    // Teklif kaldırma / geri alma ve kampanya onay kuralları
    const offer = await db.supplierProduct.create({ data: { supplierId: sup.supplier.id, productId: p.id, packType: "KOLI", unitsPerPack: 12, unitPrice: "40", packPrice: "480" } });
    await expect(offers.removeOffer(admin, offer.id, { reason: "" })).rejects.toBeInstanceOf(ZodError);
    await offers.removeOffer(admin, offer.id, { reason: "Hatalı fiyat" });
    expect((await db.supplierProduct.findUniqueOrThrow({ where: { id: offer.id } })).removedByAdmin).toBe(true);
    await offers.restoreOffer(admin, offer.id);

    const base = { chamberId: admin.chamberId!, supplierId: sup.supplier.id, type: "CHAMBER_SPECIAL" as const, startsAt: new Date(), status: "PENDING" as const };
    const empty = await db.campaign.create({ data: { ...base, title: `${P} boş`, endsAt: new Date(Date.now() + 86400_000) } });
    await expect(campaigns.approveCampaign(admin, empty.id, {})).rejects.toThrow("indirimli ürün");
    const expired = await db.campaign.create({ data: { ...base, title: `${P} eski`, endsAt: new Date(Date.now() - 1000), discounts: { create: { supplierProductId: offer.id, kind: "FIXED_PRICE", value: "450" } } } });
    await expect(campaigns.approveCampaign(admin, expired.id, {})).rejects.toThrow("bitiş");
    const ok = await db.campaign.create({ data: { ...base, title: `${P} iyi`, endsAt: new Date(Date.now() + 86400_000), discounts: { create: { supplierProductId: offer.id, kind: "FIXED_PRICE", value: "450" } } } });
    await campaigns.approveCampaign(admin, ok.id, { featured: "on" });
    expect(await db.campaign.findUniqueOrThrow({ where: { id: ok.id } })).toMatchObject({ status: "APPROVED", featured: true });
    await expect(campaigns.approveCampaign(admin, ok.id, {})).rejects.toBeInstanceOf(UserError);
    await expect(campaigns.endCampaign(admin, ok.id, { note: "erken bitiş" })).resolves.toBeUndefined();
  });
});

describe("kullanıcı ve izin yönetimi (yetki yükseltme engeli)", () => {
  it("personel hesabı oluşturulur; kendine ait olmayan izni veremez, kendi iznini değiştiremez", async () => {
    const s1 = await users.createChamberUser(admin, { fullName: `${P} Personel 1`, username: uniq(), role: "CHAMBER_STAFF" });
    const s2 = await users.createChamberUser(admin, { fullName: `${P} Personel 2`, username: uniq(), role: "CHAMBER_STAFF" });
    // s1'e kullanıcı yönetimi izni verilir
    await users.setUserPermissions(admin, s1.userId, { "perm.user.manage": "grant", "perm.dues.manage": "deny" });
    const ctx1 = await ctxFor(s1.username, s1.tempPassword);
    expect(ctx1.permissions.has("user.manage")).toBe(true);
    expect(ctx1.permissions.has("dues.manage")).toBe(false);
    // s1, sahip olmadığı "settings.manage" iznini s2'ye veremez
    await expect(users.setUserPermissions(ctx1, s2.userId, { "perm.settings.manage": "grant" })).rejects.toBeInstanceOf(ForbiddenError);
    // s1 kendi izinlerini değiştiremez, yönetici hesabına dokunamaz, yönetici oluşturamaz
    await expect(users.setUserPermissions(ctx1, s1.userId, {})).rejects.toBeInstanceOf(UserError);
    await expect(users.setUserActive(ctx1, admin.userId, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(users.createChamberUser(ctx1, { fullName: `${P} Yönetici`, username: uniq(), role: "CHAMBER_ADMIN" })).rejects.toBeInstanceOf(ForbiddenError);
    // panel izinleri kişiye özel verilemez (form alanı yok sayılır)
    await users.setUserPermissions(admin, s2.userId, { "perm.panel.admin": "grant" });
    const ctx2 = await ctxFor(s2.username, s2.tempPassword);
    expect(ctx2.permissions.has("panel.admin")).toBe(false);
  });

  it("izin değişince kullanıcının açık oturumları kapanır", async () => {
    const s = await users.createChamberUser(admin, { fullName: `${P} P3`, username: uniq(), role: "CHAMBER_STAFF" });
    const l = await login({ username: s.username, password: s.tempPassword }, ip(), null);
    if (!l.ok) throw new Error();
    await users.setUserPermissions(admin, s.userId, { "perm.report.view": "deny" });
    expect(await buildAuthContext(l.token)).toBeNull();
  });
});

describe("herkese açık başvurular", () => {
  it("KVKK onayı zorunlu; bot tuzağı doluysa kayıt açılmaz; IP sınırı uygulanır", async () => {
    await expect(apps.submitMemberApplication(memberInput(), ip())).rejects.toBeInstanceOf(ZodError);
    const before = await db.member.count();
    await apps.submitMemberApplication({ ...memberInput(), kvkk: "on", website: "http://spam" }, ip());
    expect(await db.member.count()).toBe(before);
    const addr = ip();
    for (let i = 0; i < apps.MAX_APPLICATIONS_PER_HOUR; i++) await apps.submitMemberApplication({ ...memberInput(), kvkk: "on" }, addr);
    await expect(apps.submitMemberApplication({ ...memberInput(), kvkk: "on" }, addr)).rejects.toThrow("Çok fazla başvuru");
  });
});
