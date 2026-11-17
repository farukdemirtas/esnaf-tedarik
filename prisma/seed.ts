/**
 * Başlangıç verisi: izinler, roller, Oda, 16 ana kategori, Samsun ilçeleri, aidat ayarı, ilk yönetici.
 * Sipariş, satış, ürün veya fiyat verisi OLUŞTURULMAZ.
 *
 * SEED_TEST_USERS=1 verilirse her rolden "TEST" etiketli test hesapları eklenir
 * (yalnızca geliştirme/test ortamı içindir; canlı ortamda kullanılmaz).
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_DEFINITIONS, type RoleCode } from "../src/lib/permissions";
import { generateTempPassword, hashPassword } from "../src/lib/auth/password";

const db = new PrismaClient();

export const CHAMBER_ID = "chamber-samsun";
export const TEST_PASSWORD = "TestSifre2026";

const CATEGORIES = [
  "İçecekler",
  "Gazlı İçecekler",
  "Su ve Maden Suyu",
  "Dondurma",
  "Süt ve Süt Ürünleri",
  "Tavuk ve Tavuk Ürünleri",
  "Et ve Et Ürünleri",
  "Şarküteri",
  "Atıştırmalıklar",
  "Çikolata ve Şekerleme",
  "Bisküvi ve Gofret",
  "Kahvaltılık Ürünler",
  "Konserve ve Bakliyat",
  "Temizlik Ürünleri",
  "Kişisel Bakım",
  "Diğer Toptan Ürünler",
];

const SAMSUN_DISTRICTS = [
  "Alaçam", "Asarcık", "Atakum", "Ayvacık", "Bafra", "Canik", "Çarşamba", "Havza", "İlkadım",
  "Kavak", "Ladik", "Ondokuzmayıs", "Salıpazarı", "Tekkeköy", "Terme", "Vezirköprü", "Yakakent",
];

export function slugify(s: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u" };
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşü]/g, (c) => map[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedPermissionsAndRoles() {
  for (const [code, p] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { code },
      update: { description: p.description, group: p.group },
      create: { code, description: p.description, group: p.group },
    });
  }
  const perms = await db.permission.findMany();
  const byCode = new Map(perms.map((p) => [p.code, p.id]));

  for (const [code, def] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await db.role.upsert({
      where: { code },
      update: { name: def.name, description: def.description, scope: def.scope },
      create: { code, name: def.name, description: def.description, scope: def.scope },
    });
    // Var olan rol izinlerine dokunulmaz (yönetici özelleştirmiş olabilir); eksikler eklenir
    await db.rolePermission.createMany({
      data: def.permissions.map((p) => ({ roleId: role.id, permissionId: byCode.get(p)! })),
      skipDuplicates: true,
    });
  }
}

async function seedChamber() {
  await db.chamber.upsert({
    where: { id: CHAMBER_ID },
    update: {},
    create: {
      id: CHAMBER_ID,
      name: "Samsun Bakkallar ve Her Çeşit Bayiler Esnaf Odası",
      shortName: "Samsun Bakkallar Odası",
      city: "Samsun",
    },
  });
  for (const [i, name] of CATEGORIES.entries()) {
    await db.category.upsert({
      where: { chamberId_slug: { chamberId: CHAMBER_ID, slug: slugify(name) } },
      update: {},
      create: { chamberId: CHAMBER_ID, name, slug: slugify(name), sortOrder: (i + 1) * 10 },
    });
  }
  await db.district.createMany({
    data: SAMSUN_DISTRICTS.map((name) => ({ chamberId: CHAMBER_ID, city: "Samsun", name })),
    skipDuplicates: true,
  });
  await db.setting.upsert({
    where: { chamberId_key: { chamberId: CHAMBER_ID, key: "dues.blockOrderingAfterOverdueCount" } },
    update: {},
    create: { chamberId: CHAMBER_ID, key: "dues.blockOrderingAfterOverdueCount", value: 2 },
  });
}

async function roleId(code: RoleCode) {
  return (await db.role.findUniqueOrThrow({ where: { code } })).id;
}

async function seedAdmin() {
  const existing = await db.user.findUnique({ where: { username: "admin" } });
  if (existing) {
    console.log("• İlk yönetici zaten mevcut (admin).");
    return;
  }
  const provided = process.env.SEED_ADMIN_PASSWORD;
  const password = provided || generateTempPassword(14);
  await db.user.create({
    data: {
      username: "admin",
      fullName: "Oda Yöneticisi",
      chamberId: CHAMBER_ID,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      roles: { create: { roleId: await roleId("CHAMBER_ADMIN") } },
    },
  });
  console.log("• İlk yönetici oluşturuldu → kullanıcı adı: admin");
  if (!provided) console.log(`  Geçici şifre (yalnızca bir kez gösterilir): ${password}`);
  console.log("  İlk girişte şifre değiştirmek zorunludur.");
}

async function upsertTestUser(opts: {
  username: string;
  fullName: string;
  role: RoleCode;
  mustChangePassword?: boolean;
  supplierId?: string;
  memberId?: string;
}) {
  const hash = await hashPassword(TEST_PASSWORD);
  const user = await db.user.upsert({
    where: { username: opts.username },
    update: { status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
    create: {
      username: opts.username,
      fullName: opts.fullName,
      chamberId: CHAMBER_ID,
      passwordHash: hash,
      mustChangePassword: opts.mustChangePassword ?? false,
    },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: await roleId(opts.role) } },
    update: {},
    create: { userId: user.id, roleId: await roleId(opts.role) },
  });
  if (opts.supplierId)
    await db.supplierUser.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, supplierId: opts.supplierId } });
  if (opts.memberId)
    await db.memberUser.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, memberId: opts.memberId } });
}

async function upsertTestSupplier(key: string, name: string, status: "APPROVED" | "PENDING") {
  const s = await db.supplier.upsert({
    where: { slug: `test-${key}` },
    update: { status },
    create: {
      legalName: `${name} (TEST HESABI)`,
      tradeName: name,
      slug: `test-${key}`,
      taxOffice: "TEST",
      taxNumber: `TEST-${key}`,
      address: "TEST adresi",
      phone: "0000000000",
      email: `test-${key}@example.invalid`,
      contactName: "TEST Yetkili",
      status,
    },
  });
  await db.supplierChamber.upsert({
    where: { supplierId_chamberId: { supplierId: s.id, chamberId: CHAMBER_ID } },
    update: {},
    create: { supplierId: s.id, chamberId: CHAMBER_ID },
  });
  return s.id;
}

async function upsertTestMember(key: string, name: string, status: "ACTIVE" | "PASSIVE") {
  const m = await db.member.upsert({
    where: { chamberId_registryNumber: { chamberId: CHAMBER_ID, registryNumber: `TEST-${key}` } },
    update: { status },
    create: {
      chamberId: CHAMBER_ID,
      businessName: name,
      ownerName: "TEST Üye",
      registryNumber: `TEST-${key}`,
      phone: "0000000000",
      status,
    },
  });
  return m.id;
}

async function seedTestUsers() {
  const supA = await upsertTestSupplier("a", "TEST Tedarikçi A", "APPROVED");
  const supB = await upsertTestSupplier("b", "TEST Tedarikçi B", "APPROVED");
  const supPending = await upsertTestSupplier("onaysiz", "TEST Onaysız Tedarikçi", "PENDING");
  const mem1 = await upsertTestMember("1", "TEST Bakkal 1", "ACTIVE");
  const mem2 = await upsertTestMember("2", "TEST Bakkal 2", "ACTIVE");
  const memPassive = await upsertTestMember("pasif", "TEST Pasif Bakkal", "PASSIVE");

  await upsertTestUser({ username: "test.yonetici", fullName: "TEST Yönetici", role: "CHAMBER_ADMIN" });
  await upsertTestUser({ username: "test.personel", fullName: "TEST Personel", role: "CHAMBER_STAFF" });
  await upsertTestUser({ username: "test.tedarikci-a", fullName: "TEST A Yetkilisi", role: "SUPPLIER_OWNER", supplierId: supA });
  await upsertTestUser({ username: "test.tedarikci-a-calisan", fullName: "TEST A Çalışanı", role: "SUPPLIER_STAFF", supplierId: supA });
  await upsertTestUser({ username: "test.tedarikci-b", fullName: "TEST B Yetkilisi", role: "SUPPLIER_OWNER", supplierId: supB });
  await upsertTestUser({ username: "test.tedarikci-onaysiz", fullName: "TEST Onaysız", role: "SUPPLIER_OWNER", supplierId: supPending });
  await upsertTestUser({ username: "test.uye-1", fullName: "TEST Üye 1", role: "MEMBER_OWNER", memberId: mem1 });
  await upsertTestUser({ username: "test.uye-2", fullName: "TEST Üye 2", role: "MEMBER_OWNER", memberId: mem2 });
  await upsertTestUser({ username: "test.uye-pasif", fullName: "TEST Pasif Üye", role: "MEMBER_OWNER", memberId: memPassive });
  await upsertTestUser({ username: "test.ilk-giris", fullName: "TEST İlk Giriş", role: "MEMBER_OWNER", memberId: mem2, mustChangePassword: true });
  console.log(`• TEST hesapları hazır (şifre: ${TEST_PASSWORD}). Canlı ortamda kullanmayın.`);
}

async function main() {
  await seedPermissionsAndRoles();
  console.log("• İzinler ve roller hazır.");
  await seedChamber();
  console.log("• Oda, 16 ana kategori, Samsun ilçeleri ve aidat ayarı hazır.");
  await seedAdmin();
  if (process.env.SEED_TEST_USERS === "1") await seedTestUsers();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
