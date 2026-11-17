import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { encryptField } from "@/lib/crypto";
import { UserError } from "@/lib/errors";
import { uniqueSlug } from "@/lib/slug";
import { z } from "@/lib/validation";
import { memberSchema } from "@/modules/members/service";
import { supplierSchema } from "@/modules/suppliers/service";

/**
 * Herkese açık başvuru formları. Başvurular "Başvuru" durumunda kaydedilir;
 * hesap Oda onayından sonra oluşturulur. IP başına saatlik sınır uygulanır.
 */

export const MAX_APPLICATIONS_PER_HOUR = 5;

const consent = z.object({
  kvkk: z.preprocess((v) => v === "on" || v === "true", z.literal(true, { errorMap: () => ({ message: "Devam etmek için aydınlatma metnini onaylamanız gerekir." }) })),
  website: z.string().optional(), // bot tuzağı: gerçek kullanıcılar bu alanı görmez
});

async function activeChamberId() {
  const c = await db.chamber.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (!c) throw new UserError("Başvuru şu an alınamıyor.");
  return c.id;
}

async function assertRateLimit(ip: string | null) {
  if (!ip) return;
  const count = await db.auditLog.count({
    where: { ip, action: { startsWith: "application." }, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (count >= MAX_APPLICATIONS_PER_HOUR) throw new UserError("Çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin.");
}

export async function submitMemberApplication(input: unknown, ip: string | null) {
  const c = consent.parse(input);
  if (c.website) return; // bot: sessizce yok say
  const d = memberSchema.parse(input);
  await assertRateLimit(ip);
  const chamberId = await activeChamberId();
  const dup = await db.member.findUnique({ where: { chamberId_registryNumber: { chamberId, registryNumber: d.registryNumber } } });
  if (dup) throw new UserError("Bu oda sicil numarasıyla daha önce kayıt/başvuru yapılmış. Lütfen Oda ile iletişime geçin.", "registryNumber");
  const m = await db.member.create({
    data: {
      chamberId,
      businessName: d.businessName,
      ownerName: d.ownerName,
      registryNumber: d.registryNumber,
      businessType: d.businessType,
      taxOffice: d.taxOffice,
      taxIdEncrypted: d.taxId ? encryptField(d.taxId) : null,
      phone: d.phone,
      email: d.email,
      status: "PENDING",
    },
  });
  await audit({ action: "application.member", entityType: "Member", entityId: m.id, data: { businessName: d.businessName, kvkkConsent: true }, ip });
}

export async function submitSupplierApplication(input: unknown, ip: string | null) {
  const c = consent.parse(input);
  if (c.website) return;
  const d = supplierSchema.parse(input);
  await assertRateLimit(ip);
  const chamberId = await activeChamberId();
  const dup = await db.supplier.findUnique({ where: { taxNumber: d.taxNumber } });
  if (dup) throw new UserError("Bu vergi numarasıyla daha önce başvuru yapılmış. Lütfen Oda ile iletişime geçin.", "taxNumber");
  const slug = await uniqueSlug(d.tradeName, async (s) => !!(await db.supplier.findUnique({ where: { slug: s } })));
  const s = await db.supplier.create({
    data: { ...d, slug, status: "PENDING", chambers: { create: { chamberId } } },
  });
  await audit({ action: "application.supplier", entityType: "Supplier", entityId: s.id, data: { tradeName: d.tradeName, kvkkConsent: true }, ip });
}
