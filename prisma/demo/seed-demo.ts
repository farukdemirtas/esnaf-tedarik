/**
 * DEMO verisi yükleyici — yalnızca sunum/deneme ortamı için.
 *
 *   npm run db:demo              → demo hesapları ve örnek verileri yükler (zaten yüklüyse atlar)
 *   DEMO_RESET=1 npm run db:demo → önce tüm demo verisini siler, sonra yeniden yükler
 *
 * Tüm demo hesapların şifresi "55"; kullanıcı adları demo1…demo9.
 * Firma, marka ve kişi adları kurgusaldır ve "Demo" ibaresi taşır. Canlı ortamda ÇALIŞTIRMAYIN.
 * Siparişler gerçek servislerle (sepet → sipariş motoru → tedarikçi durum değişiklikleri) oluşturulur.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { saveFile } from "@/lib/storage";
import type { RoleCode } from "@/lib/permissions";
import { buildAuthContext, type AuthContext } from "@/modules/auth/context";
import { login } from "@/modules/auth/service";
import * as cart from "@/modules/shop/cart";
import * as memberOrders from "@/modules/orders/member";
import * as supplierOrders from "@/modules/orders/supplier";
import { ensureSlots } from "@/modules/revenue/ads";
import { DEMO_MEMBERS, DEMO_PASSWORD, DEMO_PRODUCTS, DEMO_SUPPLIERS, DEMO_USERNAMES, DEMO_USERS } from "./data";

const CH = "chamber-samsun";
const ASSETS = path.join(__dirname, "assets");
const DAY = 86400_000;
const D = (v: number | string) => new Prisma.Decimal(v);
const asset = (f: string) => readFile(path.join(ASSETS, f));

async function roleId(code: RoleCode) {
  return (await db.role.findUniqueOrThrow({ where: { code } })).id;
}

let passwordHash = "";
async function demoUser(username: string, fullName: string, role: RoleCode, link: { supplierId?: string; memberId?: string } = {}) {
  const u = await db.user.create({
    data: {
      username,
      fullName,
      chamberId: CH,
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      roles: { create: { roleId: await roleId(role) } },
      ...(link.supplierId ? { supplierUser: { create: { supplierId: link.supplierId, title: role === "SUPPLIER_OWNER" ? "Yetkili" : "Depo" } } } : {}),
      ...(link.memberId ? { memberUser: { create: { memberId: link.memberId } } } : {}),
    },
  });
  return u;
}

async function ctx(username: string): Promise<AuthContext> {
  const r = await login({ username, password: DEMO_PASSWORD }, null, "demo-seed");
  if (!r.ok) throw new Error(`Demo girişi başarısız: ${username} (${r.error})`);
  return (await buildAuthContext(r.token))!;
}

// ───────────── Silme ─────────────

async function resetDemo() {
  const suppliers = await db.supplier.findMany({ where: { slug: { startsWith: "demo-" } }, select: { id: true } });
  const members = await db.member.findMany({ where: { chamberId: CH, registryNumber: { startsWith: "DEMO-" } }, select: { id: true } });
  const sIds = suppliers.map((s) => s.id);
  const mIds = members.map((m) => m.id);
  await db.order.deleteMany({ where: { OR: [{ memberId: { in: mIds } }, { supplierOrders: { some: { supplierId: { in: sIds } } } }] } });
  await db.advertisement.deleteMany({ where: { OR: [{ supplierId: { in: sIds } }, { title: { startsWith: "DEMO" } }] } });
  await db.supplierSubscription.deleteMany({ where: { supplierId: { in: sIds } } });
  await db.supplierPackage.deleteMany({ where: { chamberId: CH, name: { endsWith: "(Demo)" } } });
  await db.announcement.deleteMany({ where: { chamberId: CH, title: { startsWith: "DEMO" } } });
  await db.user.deleteMany({
    where: {
      OR: [
        { username: { in: [...DEMO_USERNAMES] } },
        { username: { startsWith: "demo." } }, // eski demo.* kullanıcı adları
      ],
    },
  });
  await db.supplier.deleteMany({ where: { id: { in: sIds } } }); // teklif, kampanya, katalog, bölge: cascade
  await db.member.deleteMany({ where: { id: { in: mIds } } });
  await db.product.deleteMany({ where: { chamberId: CH, slug: { startsWith: "demo-" } } });
  await db.brand.deleteMany({ where: { name: { endsWith: "(Demo)" } } });
  console.log("• Eski demo verisi silindi.");
}

// ───────────── Yükleme ─────────────

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo verisi canlı ortamda yüklenemez.");
  if (!(await db.chamber.findUnique({ where: { id: CH } }))) throw new Error("Önce temel seed çalıştırılmalı: npm run db:seed");
  if (process.env.DEMO_RESET === "1") await resetDemo();
  else if (await db.user.findUnique({ where: { username: DEMO_USERS.admin } })) {
    console.log("• Demo verisi zaten yüklü. Yeniden yüklemek için: DEMO_RESET=1 npm run db:demo");
    return;
  }
  passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const districts = new Map((await db.district.findMany({ where: { chamberId: CH } })).map((d) => [d.name, d.id]));
  const categories = new Map((await db.category.findMany({ where: { chamberId: CH } })).map((c) => [c.name, c.id]));

  // Oda kullanıcıları
  await demoUser(DEMO_USERS.admin, "Demo Yönetici", "CHAMBER_ADMIN");
  await demoUser(DEMO_USERS.staff, "Demo Personel", "CHAMBER_STAFF");

  // Tedarikçiler
  const supplierIds: string[] = [];
  for (const [si, s] of DEMO_SUPPLIERS.entries()) {
    const sup = await db.supplier.create({
      data: {
        legalName: s.legalName, tradeName: s.tradeName, slug: s.slug, description: s.description,
        taxOffice: "Demo VD", taxNumber: `DEMO-${s.key}`, address: `Demo Sanayi Sitesi ${s.key}. Blok, Samsun`,
        phone: `036200000${s.key}0`, email: `${s.slug}@demo.invalid`, contactName: `Demo Yetkili ${s.key}`,
        minOrderAmount: s.minOrderAmount, status: "APPROVED", approvedAt: now,
        chambers: { create: { chamberId: CH } },
        deliveryAreas: {
          create: ["Atakum", "İlkadım", "Canik", "Tekkeköy"].map((name, i) => ({ districtId: districts.get(name)!, deliveryDays: i % 2 ? [2, 4, 6] : [1, 3, 5] })),
        },
      },
    });
    supplierIds.push(sup.id);
    await demoUser(DEMO_USERS.suppliers[si], `Demo Tedarikçi ${s.key} Yetkilisi`, "SUPPLIER_OWNER", { supplierId: sup.id });
  }
  await demoUser(DEMO_USERS.worker, "Demo Depo Çalışanı", "SUPPLIER_STAFF", { supplierId: supplierIds[0] });

  // Üyeler
  const memberIds: string[] = [];
  for (const m of DEMO_MEMBERS) {
    const mem = await db.member.create({
      data: {
        chamberId: CH, businessName: m.businessName, ownerName: m.fullName, registryNumber: `DEMO-${m.key}`,
        businessType: "Bakkal", phone: `05320000${m.key.padStart(3, "0")}`, email: `${m.username}@demo.invalid`, status: "ACTIVE",
        addresses: { create: { title: "Dükkan", districtId: districts.get(m.district)!, line: m.line, isDefault: true } },
      },
    });
    memberIds.push(mem.id);
    await demoUser(m.username, m.fullName, "MEMBER_OWNER", { memberId: mem.id });
  }

  // Ürünler, görseller, teklifler
  const offerBySlug = new Map<string, string[]>();
  for (const p of DEMO_PRODUCTS) {
    const brand = await db.brand.upsert({ where: { name: p.brand }, update: {}, create: { name: p.brand, slug: p.slug.replace(/^demo-/, "demo-marka-") + "-" + p.brand.length } });
    const img = await saveFile("products", await asset(`${p.slug}.png`), ["image"]);
    const prod = await db.product.create({
      data: {
        chamberId: CH, name: p.name, slug: p.slug, barcode: p.barcode, brandId: brand.id, categoryId: categories.get(p.category)!,
        unitType: p.unitType, unitAmount: p.unitAmount, description: "DEMO ürün — örnek gösterim amaçlıdır.", status: "ACTIVE",
        createdAt: new Date(now.getTime() - (DEMO_PRODUCTS.indexOf(p) % 10) * DAY),
        images: { create: { path: img.key } },
      },
    });
    const ids: string[] = [];
    for (const [si, packPrice, units, stock] of p.offers) {
      const o = await db.supplierProduct.create({
        data: {
          supplierId: supplierIds[si], productId: prod.id, sku: `D${si + 1}-${p.barcode.slice(-4)}`, packType: "KOLI", unitsPerPack: units,
          packPrice, unitPrice: D(packPrice).div(units).toDecimalPlaces(2), vatRate: p.category.includes("Temizlik") || p.category.includes("Bakım") ? 20 : 10,
          minOrderQty: 1, orderStep: 1,
          stock: { create: { quantity: stock } },
          prices: { create: [{ type: "LIST", packPrice: packPrice * 0.95, validFrom: new Date(now.getTime() - 40 * DAY), validTo: new Date(now.getTime() - 10 * DAY) }, { type: "LIST", packPrice, validFrom: new Date(now.getTime() - 10 * DAY) }] },
          stockMovements: { create: { change: stock, reason: "MANUAL", reference: "Demo başlangıç stoğu" } },
        },
      });
      ids.push(o.id);
    }
    offerBySlug.set(p.slug, ids);
  }
  const offer = (slug: string, i = 0) => offerBySlug.get(slug)![i];

  // Kampanyalar (onaylı + bekleyen)
  const admin = await db.user.findUniqueOrThrow({ where: { username: DEMO_USERS.admin } });
  await db.campaign.create({
    data: {
      chamberId: CH, supplierId: supplierIds[1], title: "Yaz serinliği: içeceklerde indirim", description: "Su ve gazlı içeceklerde Oda üyelerine özel fiyat. 10 koli ve üzeri ek indirim.",
      type: "VOLUME", status: "APPROVED", featured: true, reviewedById: admin.id, reviewedAt: now,
      startsAt: new Date(now.getTime() - 5 * DAY), endsAt: new Date(now.getTime() + 25 * DAY),
      discounts: {
        create: [
          { supplierProductId: offer("demo-dogal-su-05"), kind: "PERCENT", value: 8, minQty: 1 },
          { supplierProductId: offer("demo-dogal-su-05"), kind: "FIXED_PRICE", value: 84, minQty: 10 },
          { supplierProductId: offer("demo-kola-1l"), kind: "AMOUNT", value: 24, minQty: 5 },
        ],
      },
    },
  });
  await db.campaign.create({
    data: {
      chamberId: CH, supplierId: supplierIds[0], title: "Kahvaltı haftası", description: "Peynir ve reçelde koli fiyatına indirim.", type: "CHAMBER_SPECIAL", status: "APPROVED",
      reviewedById: admin.id, reviewedAt: now, startsAt: new Date(now.getTime() - 2 * DAY), endsAt: new Date(now.getTime() + 12 * DAY),
      discounts: {
        create: [
          { supplierProductId: offer("demo-beyaz-peynir"), kind: "FIXED_PRICE", value: 1360, minQty: 1 },
          { supplierProductId: offer("demo-beyaz-peynir"), kind: "FIXED_PRICE", value: 1290, minQty: 5 },
          { supplierProductId: offer("demo-recel-cilek"), kind: "PERCENT", value: 10, minQty: 2 },
        ],
      },
    },
  });
  await db.campaign.create({
    data: {
      chamberId: CH, supplierId: supplierIds[2], title: "Temizlikte toplu alım fırsatı", type: "VOLUME", status: "PENDING",
      startsAt: now, endsAt: new Date(now.getTime() + 20 * DAY),
      discounts: { create: [{ supplierProductId: offer("demo-camasir-suyu"), kind: "PERCENT", value: 12, minQty: 5 }] },
    },
  });

  // Gelir modeli: paketler, abonelikler, banner, sponsorlu ürün, katalog
  const showcase = await db.supplierPackage.create({ data: { chamberId: CH, name: "Vitrin Paketi (Demo)", type: "SHOWCASE", description: "3 sponsorlu ürün hakkı, sınırsız ürün.", productLimit: null, sponsoredSlots: 3, bannerSlots: 0, price: 2500, durationDays: 30 } });
  const promo = await db.supplierPackage.create({ data: { chamberId: CH, name: "Tanıtım Paketi (Demo)", type: "PROMOTION", description: "5 sponsorlu ürün + 2 banner reklam hakkı.", productLimit: null, sponsoredSlots: 5, bannerSlots: 2, price: 5000, durationDays: 30 } });
  const started = new Date(now.getTime() - 6 * DAY);
  await db.supplierSubscription.createMany({
    data: [
      { supplierId: supplierIds[1], packageId: promo.id, status: "ACTIVE", startsAt: started, endsAt: new Date(started.getTime() + 30 * DAY), pricePaid: promo.price, note: "Demo: havale ile ödendi" },
      { supplierId: supplierIds[0], packageId: showcase.id, status: "ACTIVE", startsAt: started, endsAt: new Date(started.getTime() + 30 * DAY), pricePaid: showcase.price },
      { supplierId: supplierIds[2], packageId: showcase.id, status: "PENDING", startsAt: now, endsAt: now, pricePaid: showcase.price, note: "Demo: ödeme bekleniyor" },
    ],
  });
  const slots = new Map((await ensureSlots(CH)).map((s) => [s.code, s.id]));
  await db.advertisement.create({
    data: {
      slotId: slots.get("home-top")!, supplierId: supplierIds[1], title: "DEMO Yaz serinliği bannerı", imagePath: (await saveFile("ads", await asset("banner-home.png"), ["image"])).key,
      targetUrl: "/magaza/tedarikciler/demo-icecek-dagitim", startsAt: started, endsAt: new Date(now.getTime() + 24 * DAY), status: "APPROVED", fee: 1500, impressions: 214, clicks: 19,
    },
  });
  await db.advertisement.create({
    data: {
      slotId: slots.get("products-top")!, supplierId: supplierIds[2], title: "DEMO Temizlik kampanyası bannerı", imagePath: (await saveFile("ads", await asset("banner-products.png"), ["image"])).key,
      targetUrl: "/magaza/tedarikciler/demo-temizlik-toptan", startsAt: started, endsAt: new Date(now.getTime() + 24 * DAY), status: "APPROVED", fee: 1000, impressions: 132, clicks: 7,
    },
  });
  await db.sponsoredProduct.createMany({
    data: [
      { supplierProductId: offer("demo-findik-ezmesi"), startsAt: started, endsAt: new Date(now.getTime() + 20 * DAY), sortOrder: 1 },
      { supplierProductId: offer("demo-siyah-cay-1kg"), startsAt: started, endsAt: new Date(now.getTime() + 20 * DAY), sortOrder: 2 },
      { supplierProductId: offer("demo-kola-1l"), startsAt: started, endsAt: new Date(now.getTime() + 20 * DAY), sortOrder: 3 },
      { supplierProductId: offer("demo-dogal-su-05"), startsAt: started, endsAt: new Date(now.getTime() + 20 * DAY), sortOrder: 4 },
    ],
  });
  await db.catalog.create({
    data: {
      supplierId: supplierIds[0], title: "Aylık Fırsat Kataloğu", categoryId: categories.get("Kahvaltılık Ürünler"), status: "APPROVED",
      coverPath: (await saveFile("catalogs", await asset("catalog-cover.png"), ["image"])).key,
      filePath: (await saveFile("catalogs", await asset("catalog.pdf"), ["document"])).key,
      startsAt: new Date(now.getTime() - 3 * DAY), endsAt: new Date(now.getTime() + 27 * DAY),
      items: { create: ["demo-beyaz-peynir", "demo-findik-ezmesi", "demo-recel-cilek", "demo-siyah-cay-1kg", "demo-kirmizi-mercimek", "demo-patates-cipsi"].map((s, i) => ({ supplierProductId: offer(s), sortOrder: i })) },
    },
  });

  // Duyurular
  await db.announcement.createMany({
    data: [
      { chamberId: CH, title: "DEMO: Platforma hoş geldiniz", body: "Bu bir demo duyurusudur. Ürünleri karşılaştırın, tek sepetten birden çok tedarikçiye sipariş verin.", audience: "ALL", pinned: true, createdById: admin.id },
      { chamberId: CH, title: "DEMO: Bayram öncesi teslimat günleri", body: "Bayram haftasında teslimatlar bir gün erken yapılacaktır (demo duyuru).", audience: "MEMBERS", createdById: admin.id },
      { chamberId: CH, title: "DEMO: Tedarikçi bilgilendirmesi", body: "Kampanyalarınızı ay sonuna kadar onaya gönderin (demo duyuru).", audience: "SUPPLIERS", createdById: admin.id },
    ],
  });

  // Siparişler — gerçek akışla: sepet → sipariş → tedarikçi durumları; sonra tarihleri geçmişe yayılır
  const [b1, b2, b3] = await Promise.all(DEMO_MEMBERS.map((m) => ctx(m.username)));
  const [t1, t2, t3] = await Promise.all(DEMO_USERS.suppliers.map((u) => ctx(u)));
  const supplierCtx = new Map([[supplierIds[0], t1], [supplierIds[1], t2], [supplierIds[2], t3]]);
  type Line = [string, number, number?];
  const flows: Record<string, ("CONFIRMED" | "PREPARING" | "SHIPPED" | "DELIVERED" | "REJECTED" | "CANCELLED")[]> = {
    DELIVERED: ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"],
    SHIPPED: ["CONFIRMED", "PREPARING", "SHIPPED"],
    PREPARING: ["CONFIRMED", "PREPARING"],
    CONFIRMED: ["CONFIRMED"],
    REJECTED: ["REJECTED"],
    CANCELLED: ["CONFIRMED", "CANCELLED"],
    PENDING: [],
  };
  const scenarios: { who: AuthContext; daysAgo: number; lines: Line[]; status: keyof typeof flows; note?: string }[] = [
    { who: b1, daysAgo: 27, lines: [["demo-dogal-su-05", 10], ["demo-kola-1l", 6]], status: "DELIVERED" },
    { who: b2, daysAgo: 25, lines: [["demo-siyah-cay-1kg", 2], ["demo-beyaz-peynir", 2]], status: "DELIVERED" },
    { who: b3, daysAgo: 22, lines: [["demo-bulasik-deterjani", 2], ["demo-camasir-suyu", 3]], status: "DELIVERED" },
    { who: b1, daysAgo: 19, lines: [["demo-findik-ezmesi", 2], ["demo-ayran-200", 4], ["demo-tuvalet-kagidi", 1]], status: "DELIVERED" },
    { who: b2, daysAgo: 16, lines: [["demo-kola-1l", 5], ["demo-maden-suyu", 3]], status: "DELIVERED" },
    { who: b1, daysAgo: 13, lines: [["demo-pirinc-baldo", 2], ["demo-kirmizi-mercimek", 2]], status: "REJECTED", note: "Demo: depoda sayım farkı" },
    { who: b2, daysAgo: 10, lines: [["demo-sutlu-cikolata", 2], ["demo-findikli-gofret", 2], ["demo-sivi-sabun", 2]], status: "DELIVERED" },
    { who: b3, daysAgo: 8, lines: [["demo-dogal-su-15", 15]], status: "CANCELLED", note: "Demo: üye talebiyle iptal" },
    { who: b1, daysAgo: 5, lines: [["demo-beyaz-peynir", 5], ["demo-recel-cilek", 2]], status: "SHIPPED" },
    { who: b2, daysAgo: 3, lines: [["demo-dogal-su-05", 12], ["demo-gazoz-250", 4]], status: "PREPARING" },
    { who: b3, daysAgo: 2, lines: [["demo-patates-cipsi", 3], ["demo-domates-salcasi", 2]], status: "CONFIRMED" },
    { who: b1, daysAgo: 1, lines: [["demo-turk-kahvesi", 2], ["demo-camasir-suyu", 2]], status: "PENDING", note: "Sabah 10'dan önce teslim lütfen." },
    { who: b2, daysAgo: 0, lines: [["demo-sut-1l", 3], ["demo-tuzlu-findik", 2]], status: "PENDING" },
  ];
  let orderCount = 0;
  for (const sc of scenarios) {
    await cart.clearCart(sc.who);
    for (const [slug, qty, i] of sc.lines) await cart.addToCart(sc.who, { supplierProductId: offer(slug, i ?? 0), quantity: String(qty) });
    const r = await memberOrders.placeOrder(sc.who, { idempotencyKey: `demo-${crypto.randomUUID()}`, note: sc.note && sc.status === "PENDING" ? sc.note : undefined });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { supplierOrders: true } });
    const placedAt = new Date(now.getTime() - sc.daysAgo * DAY - 3 * 3600e3);
    for (const so of order.supplierOrders) {
      const sctx = supplierCtx.get(so.supplierId)!;
      for (const to of flows[sc.status]) {
        const needsNote = to === "REJECTED" || to === "CANCELLED";
        await supplierOrders.changeSupplierOrderStatus(sctx, so.id, {
          to,
          note: needsNote ? (sc.note ?? "Demo gerekçe") : undefined,
          plannedDate: to === "CONFIRMED" ? new Date(placedAt.getTime() + 2 * DAY).toLocaleDateString("sv-SE") : undefined,
        });
      }
      if (sc.status === "DELIVERED")
        await supplierOrders.addInvoice(sctx, so.id, { type: "INVOICE", documentNumber: `DEMO${String(++orderCount).padStart(5, "0")}`, documentDate: new Date(placedAt.getTime() + DAY).toLocaleDateString("sv-SE"), amount: so.grandTotal.toFixed(2) }, null);
      // Tarihleri geçmişe yay (raporlar ve listeler gerçekçi görünsün)
      const hist = await db.orderStatusHistory.findMany({ where: { supplierOrderId: so.id }, orderBy: { createdAt: "asc" } });
      for (const [i, h] of hist.entries()) await db.orderStatusHistory.update({ where: { id: h.id }, data: { createdAt: new Date(placedAt.getTime() + i * 7 * 3600e3) } });
      await db.supplierOrder.update({ where: { id: so.id }, data: { createdAt: placedAt } });
    }
    await db.order.update({ where: { id: order.id }, data: { createdAt: placedAt } });
  }

  // Aidatlar: son 3 ay; Demo Bakkal Canik'in 2 aidatı gecikmiş → sipariş verme kapalı (aidat engeli gösterimi)
  for (const [mi, memberId] of memberIds.entries()) {
    for (let k = 3; k >= 1; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
      const period = d.toLocaleDateString("sv-SE").slice(0, 7);
      const dueDate = new Date(d.getTime() + 14 * DAY);
      const overdueUnpaid = mi === 2 && k >= 2;
      const paid = !overdueUnpaid && dueDate < now;
      await db.membershipDue.create({
        data: { chamberId: CH, memberId, period, amount: 350, dueDate, status: paid ? "PAID" : "UNPAID", paidAt: paid ? new Date(dueDate.getTime() - 3 * DAY) : null, recordedById: paid ? admin.id : null },
      });
    }
  }

  // Sepette bekleyen ürünler ve favoriler (Demo Bakkal Atakum)
  await cart.addToCart(b1, { supplierProductId: offer("demo-dogal-su-05"), quantity: "10" });
  await cart.addToCart(b1, { supplierProductId: offer("demo-siyah-cay-1kg"), quantity: "1" });
  await cart.addToCart(b1, { supplierProductId: offer("demo-bulasik-deterjani"), quantity: "1" });
  for (const s of ["demo-siyah-cay-1kg", "demo-beyaz-peynir", "demo-kola-1l"]) {
    const p = await db.product.findFirstOrThrow({ where: { chamberId: CH, slug: s } });
    await db.favorite.create({ data: { memberId: memberIds[0], productId: p.id } });
  }

  // Demo girişleri oturum/giriş kayıtlarında görünmesin
  await db.session.deleteMany({ where: { userAgent: "demo-seed" } });

  console.log(`• DEMO verisi yüklendi: ${DEMO_SUPPLIERS.length} tedarikçi, ${DEMO_MEMBERS.length} üye, ${DEMO_PRODUCTS.length} ürün, ${scenarios.length} sipariş.`);
  console.log(`  Tüm demo hesapların şifresi: ${DEMO_PASSWORD}`);
  console.log(`  Kullanıcı adları: ${DEMO_USERNAMES.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
