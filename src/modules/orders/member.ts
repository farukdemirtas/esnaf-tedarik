import { Prisma, type SupplierOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/assert";
import { memberIdOf } from "@/lib/auth/scope";
import { NotFoundError, UserError } from "@/lib/errors";
import { ORDER_STATUS } from "@/lib/format";
import { pageArgs, z, zId, zOptId, zOptText } from "@/lib/validation";
import type { AuthContext } from "@/modules/auth/context";
import { getMemberDuesState } from "@/modules/members/dues";
import { notifySupplier } from "@/modules/notifications/service";
import { loadActiveDiscounts, normalizeQuantity, priceLine, quantityRuleError, sumLines } from "@/modules/pricing/engine";
import { evaluateCart } from "@/modules/shop/cart";
import { shopContext, visibleOfferWhere } from "@/modules/shop/context";
import { OPEN_STATUSES } from "./supplier";

/**
 * Üye sipariş motoru.
 *
 * placeOrder tek transaction'da:
 *  1. aidat engeli (güncel veriden), idempotency anahtarı (çift tıklama / yeniden gönderim),
 *  2. sepet transaction içinde yeniden değerlendirilir: görünürlük, fiyat (değiştiyse durur, onay ister),
 *     asgari miktar/adım, stok, tedarikçi/ilçe asgari tutarı (tutmayan grup sepette kalır),
 *  3. ET-YYYY-NNNNNN numarası (OrderSequence satır kilidiyle), tedarikçi başına -01, -02 alt siparişleri,
 *  4. satırların anlık kopyası, adres kopyası, durum geçmişi,
 *  5. koşullu stok düşümü (UPDATE … WHERE quantity >= n) — yetmezse tüm işlem geri alınır,
 *  6. sipariş verilen satırlar sepetten silinir, tedarikçilere bildirim, denetim kaydı.
 */

const D = Prisma.Decimal;

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, "Geçersiz istek anahtarı. Sayfayı yenileyip tekrar deneyin."),
  note: zOptText(500),
  addressId: zOptId,
  /** Yalnızca bu tedarikçilerin grupları sipariş edilsin (boşsa sipariş verilebilen tüm gruplar) */
  supplierIds: z.preprocess((v) => (v === undefined ? undefined : ([] as unknown[]).concat(v)), z.array(zId).optional()),
});

export class PriceChangedError extends UserError {
  constructor() {
    super("Sepetinizdeki bazı ürünlerin fiyatı değişti. Lütfen güncel fiyatları kontrol edip onaylayın.");
    this.name = "PriceChangedError";
  }
}

/** İstanbul saatine göre yıl */
function orderYear(now = new Date()) {
  return Number(now.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 4));
}

export function formatOrderNumber(year: number, seq: number) {
  return `ET-${year}-${String(seq).padStart(6, "0")}`;
}

export async function placeOrder(auth: AuthContext, input: unknown) {
  assertPermission(auth, "memberSelf.order");
  const memberId = memberIdOf(auth);
  const d = placeOrderSchema.parse(input);

  // Aynı anahtarla daha önce oluşturulmuş sipariş varsa aynısı döner (yeni sipariş açılmaz)
  const prior = await db.order.findUnique({ where: { idempotencyKey: d.idempotencyKey }, select: { id: true, orderNumber: true, memberId: true } });
  if (prior) {
    if (prior.memberId !== memberId) throw new UserError("Geçersiz istek anahtarı. Sayfayı yenileyip tekrar deneyin.");
    return { orderId: prior.id, orderNumber: prior.orderNumber, duplicate: true, supplierOrderCount: 0, skipped: [] as string[] };
  }

  const member = await db.member.findUniqueOrThrow({ where: { id: memberId } });
  const dues = await getMemberDuesState(memberId, member.chamberId);
  if (dues.orderingBlocked)
    throw new UserError(`Vadesi geçmiş ${dues.overdueCount} aidat kaydınız bulunduğu için sipariş veremezsiniz. Lütfen Oda ile iletişime geçin.`);

  const ctx = await shopContext(auth);
  const address = d.addressId
    ? await db.address.findFirst({ where: { id: d.addressId, memberId }, include: { district: true } })
    : ctx.address && (await db.address.findFirst({ where: { id: ctx.address.id, memberId }, include: { district: true } }));
  if (!address) throw new UserError("Teslimat adresi bulunamadı. Hesabım sayfasından adres ekleyin.", "addressId");
  // Görünürlük teslimat adresinin ilçesine göre değerlendirilir
  const evalCtx = { chamberId: ctx.chamberId, districtId: address.districtId };

  try {
    return await db.$transaction(
      async (tx) => {
        // Aynı üyenin eşzamanlı siparişleri (iki sekme) sepet satırı kilidiyle sıraya girer
        await tx.$executeRaw`SELECT id FROM "Cart" WHERE "memberId" = ${memberId} FOR UPDATE`;
        const again = await tx.order.findUnique({ where: { idempotencyKey: d.idempotencyKey }, select: { id: true, orderNumber: true, memberId: true } });
        if (again?.memberId === memberId)
          return { orderId: again.id, orderNumber: again.orderNumber, duplicate: true, supplierOrderCount: 0, skipped: [] as string[] };
        const items = await tx.cartItem.findMany({ where: { cart: { memberId } }, orderBy: { createdAt: "asc" } });
        if (items.length === 0) throw new UserError("Sepetiniz boş.");
        const view = await evaluateCart(tx, evalCtx, items);
        const wanted = d.supplierIds?.length ? new Set(d.supplierIds) : null;
        const selected = view.groups.filter((g) => !wanted || wanted.has(g.supplier.id));
        if (selected.length === 0) throw new UserError("Sipariş verilecek tedarikçi seçilmedi.");

        const blocked = selected.find((g) => g.hasBlocking);
        if (blocked) {
          const l = blocked.lines.find((x) => x.blocking)!;
          const why = !l.available ? "artık bölgenizde satışta değil" : (l.quantityError ?? l.stockError);
          throw new UserError(`${blocked.supplier.tradeName}: "${l.offer.product.name}" ${why} Sepetinizi güncelleyin.`);
        }
        if (selected.some((g) => g.hasPriceChange)) throw new PriceChangedError();

        const groups = selected.filter((g) => g.meetsMin);
        const skipped = selected.filter((g) => !g.meetsMin).map((g) => g.supplier.tradeName);
        if (groups.length === 0)
          throw new UserError(
            `Asgari sipariş tutarı karşılanmadı: ${selected.map((g) => `${g.supplier.tradeName} (en az ${g.minAmount.toFixed(2)} ₺, KDV hariç)`).join(", ")}.`,
          );

        // Sipariş numarası: yıl satırı kilitlenerek artırılır (eşzamanlı siparişlerde çakışma olmaz)
        const year = orderYear();
        const [{ value: seq }] = await tx.$queryRaw<{ value: number }[]>`
          INSERT INTO "OrderSequence" (year, value) VALUES (${year}, 1)
          ON CONFLICT (year) DO UPDATE SET value = "OrderSequence".value + 1
          RETURNING value`;
        const orderNumber = formatOrderNumber(year, seq);
        const totals = sumLines(groups.flatMap((g) => g.lines.map((l) => l.price)));

        // Önce ana kayıt: idempotencyKey benzersiz indeksi, aynı anahtarlı ikinci isteği burada bekletir/durdurur
        const order = await tx.order.create({
          data: {
            orderNumber,
            chamberId: member.chamberId,
            memberId,
            createdById: auth.userId,
            idempotencyKey: d.idempotencyKey,
            addressSnapshot: {
              title: address.title,
              district: address.district.name,
              city: address.district.city,
              ...(address.neighborhood ? { neighborhood: address.neighborhood } : {}),
              line: address.line,
              contactName: member.ownerName,
              phone: member.phone,
            },
            note: d.note ?? null,
            ...totals,
          },
        });

        const created: { id: string; subNumber: string; supplierId: string; supplierName: string }[] = [];
        const stockOps: ((typeof groups)[number]["lines"][number] & { subNumber: string; supplierName: string })[] = [];
        for (const [i, g] of groups.entries()) {
          const subNumber = `${orderNumber}-${String(i + 1).padStart(2, "0")}`;
          const so = await tx.supplierOrder.create({
            data: {
              orderId: order.id,
              supplierId: g.supplier.id,
              subNumber,
              ...g.totals,
              items: {
                create: g.lines.map((l) => ({
                  supplierProductId: l.supplierProductId,
                  productName: l.offer.product.name,
                  brandName: l.offer.product.brand.name,
                  barcode: l.offer.product.barcode,
                  packType: l.offer.packType,
                  unitsPerPack: l.offer.unitsPerPack,
                  quantity: l.quantity,
                  listPackPrice: l.price.listPackPrice,
                  finalPackPrice: l.price.finalPackPrice,
                  vatRate: l.price.vatRate,
                  lineSubtotal: l.price.lineSubtotal,
                  lineDiscount: l.price.lineDiscount,
                  lineVat: l.price.lineVat,
                  lineTotal: l.price.lineTotal,
                  campaignId: l.price.campaignId,
                })),
              },
              statusHistory: { create: { toStatus: "PENDING", changedById: auth.userId, note: "Sipariş oluşturuldu" } },
            },
          });
          for (const l of g.lines) stockOps.push({ ...l, subNumber, supplierName: g.supplier.tradeName });
          created.push({ id: so.id, subNumber, supplierId: g.supplier.id, supplierName: g.supplier.tradeName });
        }

        // Koşullu stok düşümü; satırlar kimliğe göre sıralanır (eşzamanlı siparişlerde kilitlenmeyi önler)
        stockOps.sort((a, b) => (a.supplierProductId < b.supplierProductId ? -1 : 1));
        for (const l of stockOps) {
          const n = await tx.$executeRaw`
            UPDATE "Stock" SET quantity = quantity - ${l.quantity.toString()}::numeric, "updatedAt" = now()
            WHERE "supplierProductId" = ${l.supplierProductId} AND quantity >= ${l.quantity.toString()}::numeric`;
          if (n === 0) throw new UserError(`${l.supplierName}: "${l.offer.product.name}" için yeterli stok kalmadı. Sepetinizi güncelleyin.`);
          await tx.stockMovement.create({
            data: { supplierProductId: l.supplierProductId, change: l.quantity.negated(), reason: "ORDER", reference: l.subNumber, userId: auth.userId },
          });
        }

        await tx.cartItem.deleteMany({ where: { id: { in: groups.flatMap((g) => g.lines.map((l) => l.itemId)) } } });

        for (const so of created)
          await notifySupplier(
            so.supplierId,
            {
              type: "order.new",
              title: "Yeni sipariş",
              message: `${member.businessName} işletmesinden ${so.subNumber} numaralı yeni sipariş geldi.`,
              link: `/tedarikci/siparisler/${so.id}`,
            },
            tx,
          );
        await audit(
          {
            userId: auth.userId,
            action: "order.place",
            entityType: "Order",
            entityId: order.id,
            data: { orderNumber, supplierOrders: created.map((c) => c.subNumber), grandTotal: totals.grandTotal.toFixed(2), skipped },
          },
          tx,
        );
        return { orderId: order.id, orderNumber, duplicate: false, supplierOrderCount: created.length, skipped };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    // Aynı anahtarlı eşzamanlı istek: ilk istek kazandı, onun sonucunu döndür
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = ([] as string[]).concat((e.meta?.target as string[] | string) ?? []).join(",");
      if (target.includes("idempotencyKey")) {
        const o = await db.order.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
        if (o && o.memberId === memberId) return { orderId: o.id, orderNumber: o.orderNumber, duplicate: true, supplierOrderCount: 0, skipped: [] as string[] };
      }
    }
    throw e;
  }
}

// ───────────── Siparişlerim ─────────────

export async function listMyOrders(auth: AuthContext, f: { durum?: string; sayfa?: string }) {
  assertPermission(auth, "memberSelf.orders.view");
  const memberId = memberIdOf(auth);
  const { skip, take, page, size } = pageArgs(f.sayfa, 20);
  const statuses = Object.keys(ORDER_STATUS);
  const where: Prisma.OrderWhereInput = {
    memberId,
    ...(f.durum === "acik"
      ? { supplierOrders: { some: { status: { in: OPEN_STATUSES } } } }
      : statuses.includes(f.durum ?? "")
        ? { supplierOrders: { some: { status: f.durum as SupplierOrderStatus } } }
        : {}),
  };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        supplierOrders: {
          orderBy: { subNumber: "asc" },
          select: { id: true, subNumber: true, status: true, grandTotal: true, supplier: { select: { tradeName: true } }, _count: { select: { items: true } } },
        },
      },
    }),
    db.order.count({ where }),
  ]);
  return { items, total, page, size };
}

export async function getMyOrder(auth: AuthContext, id: string) {
  assertPermission(auth, "memberSelf.orders.view");
  const order = await db.order.findFirst({
    where: { id, memberId: memberIdOf(auth) },
    include: {
      createdBy: { select: { fullName: true } },
      supplierOrders: {
        orderBy: { subNumber: "asc" },
        include: {
          supplier: { select: { id: true, tradeName: true, slug: true, phone: true, email: true } },
          items: { include: { campaign: { select: { title: true } } } },
          statusHistory: { orderBy: { createdAt: "asc" } },
          invoices: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, documentNumber: true, documentDate: true, amount: true } },
        },
      },
    },
  });
  if (!order) throw new NotFoundError("Sipariş bulunamadı.");
  return order;
}

/** Üye, alt siparişi yalnızca "Beklemede" (tedarikçi onaylamadan) iken iptal edebilir; stok iade edilir */
export async function cancelMySupplierOrder(auth: AuthContext, supplierOrderId: string, input: unknown) {
  assertPermission(auth, "memberSelf.order");
  const memberId = memberIdOf(auth);
  const { note } = z.object({ note: zOptText(500) }).parse(input ?? {});
  const so = await db.supplierOrder.findFirst({
    where: { id: supplierOrderId, order: { memberId } },
    include: { items: true, order: { select: { id: true, member: { select: { businessName: true } } } } },
  });
  if (!so) throw new NotFoundError("Sipariş bulunamadı.");
  if (so.status !== "PENDING") throw new UserError("Tedarikçi siparişi işleme aldığı için iptal edilemez. Tedarikçiyle iletişime geçin.");

  await db.$transaction(async (tx) => {
    const r = await tx.supplierOrder.updateMany({
      where: { id: so.id, status: "PENDING" },
      data: { status: "CANCELLED", rejectReason: note ? `Üye iptali: ${note}` : "Üye tarafından iptal edildi" },
    });
    if (r.count === 0) throw new UserError("Sipariş bu arada tedarikçi tarafından güncellendi. Sayfayı yenileyin.");
    for (const item of so.items) {
      await tx.stock.upsert({
        where: { supplierProductId: item.supplierProductId },
        update: { quantity: { increment: item.quantity } },
        create: { supplierProductId: item.supplierProductId, quantity: item.quantity },
      });
      await tx.stockMovement.create({
        data: { supplierProductId: item.supplierProductId, change: item.quantity, reason: "ORDER_CANCEL", reference: so.subNumber, userId: auth.userId },
      });
    }
    await tx.orderStatusHistory.create({
      data: { supplierOrderId: so.id, fromStatus: "PENDING", toStatus: "CANCELLED", changedById: auth.userId, note: note ?? "Üye tarafından iptal edildi" },
    });
    await notifySupplier(
      so.supplierId,
      {
        type: "order.cancelled",
        title: "Sipariş iptal edildi",
        message: `${so.order.member.businessName}, ${so.subNumber} numaralı siparişi iptal etti.${note ? ` Not: ${note}` : ""}`,
        link: `/tedarikci/siparisler/${so.id}`,
      },
      tx,
    );
    await audit({ userId: auth.userId, action: "order.member.cancel", entityType: "SupplierOrder", entityId: so.id, data: { subNumber: so.subNumber, note } }, tx);
  });
}

/**
 * Tekrar sipariş: eski siparişin satırları, hâlâ satışta olan tekliflerle sepete eklenir.
 * Fiyatlar güncel fiyattır; miktar kurallara uymuyorsa en yakın geçerli miktara yuvarlanır, stok yetmiyorsa atlanır.
 */
export async function reorder(auth: AuthContext, orderId: string, input?: unknown) {
  assertPermission(auth, "memberSelf.cart");
  const memberId = memberIdOf(auth);
  const { supplierOrderId } = z.object({ supplierOrderId: zOptId }).parse(input ?? {});
  const order = await db.order.findFirst({
    where: { id: orderId, memberId },
    include: { supplierOrders: { where: supplierOrderId ? { id: supplierOrderId } : {}, include: { items: true } } },
  });
  if (!order) throw new NotFoundError("Sipariş bulunamadı.");
  const ctx = await shopContext(auth);
  const lines = order.supplierOrders.flatMap((s) => s.items);
  const offers = await db.supplierProduct.findMany({
    where: { id: { in: lines.map((l) => l.supplierProductId) }, ...visibleOfferWhere(ctx) },
    include: { stock: true },
  });
  const offerBy = new Map(offers.map((o) => [o.id, o]));
  const cart = await db.cart.upsert({ where: { memberId }, update: {}, create: { memberId }, select: { id: true } });
  const discounts = await loadActiveDiscounts(offers.map((o) => o.id), ctx.chamberId);

  let added = 0;
  const skipped: string[] = [];
  for (const l of lines) {
    const o = offerBy.get(l.supplierProductId);
    if (!o) {
      skipped.push(`${l.productName} (satışta değil)`);
      continue;
    }
    const existing = await db.cartItem.findUnique({ where: { cartId_supplierProductId: { cartId: cart.id, supplierProductId: o.id } } });
    let qty = normalizeQuantity(o, new D(l.quantity).plus(existing?.quantity ?? 0));
    const stock = o.stock?.quantity ?? new D(0);
    if (qty.gt(stock)) {
      // Stok yetmiyorsa kurallara uyan en büyük miktar
      qty = stock.minus(stock.mod(o.orderStep));
      if (qty.lt(o.minOrderQty) || quantityRuleError(o, qty)) {
        skipped.push(`${l.productName} (stok yetersiz)`);
        continue;
      }
    }
    const price = priceLine({ packPrice: o.packPrice, vatRate: o.vatRate, discounts: discounts.get(o.id) ?? [] }, qty);
    await db.cartItem.upsert({
      where: { cartId_supplierProductId: { cartId: cart.id, supplierProductId: o.id } },
      update: { quantity: qty, seenPackPrice: price.finalPackPrice },
      create: { cartId: cart.id, supplierProductId: o.id, quantity: qty, seenPackPrice: price.finalPackPrice },
    });
    added++;
  }
  await audit({ userId: auth.userId, action: "order.reorder", entityType: "Order", entityId: order.id, data: { added, skipped: skipped.length } });
  return { added, skipped };
}
