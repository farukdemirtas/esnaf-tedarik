/**
 * Arka plan işçisi: bekleyen e-posta bildirimlerini gönderir ve süresi dolan kayıtları günceller.
 *   npm run worker          → sürekli çalışır (30 sn aralıkla)
 *   npm run worker -- --once → bir tur çalışıp çıkar (cron ile kullanım için)
 * Canlıda tek kopya çalıştırılmalıdır (docker-compose'daki "worker" servisi).
 */
import { db } from "@/lib/db";
import { isEmailEnabled } from "@/lib/mailer";
import { dispatchPendingEmails } from "@/modules/notifications/dispatch";

const INTERVAL_MS = 30_000;

async function housekeeping() {
  const now = new Date();
  // Süresi biten paket abonelikleri ve kampanyalar
  const subs = await db.supplierSubscription.updateMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, data: { status: "EXPIRED" } });
  const camps = await db.campaign.updateMany({ where: { status: "APPROVED", endsAt: { lte: now } }, data: { status: "ENDED", featured: false } });
  const ads = await db.advertisement.updateMany({ where: { status: "APPROVED", endsAt: { lte: now } }, data: { status: "ENDED" } });
  // Süresi dolmuş oturumlar ve şifre sıfırlama bağlantıları
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } });
  return { subs: subs.count, camps: camps.count, ads: ads.count, sessions: sessions.count, tokens: tokens.count };
}

async function tick() {
  const mail = await dispatchPendingEmails();
  const hk = await housekeeping();
  const changed = mail.sent + mail.failed + mail.skipped + hk.subs + hk.camps + hk.ads;
  if (changed) console.log(new Date().toISOString(), "e-posta", mail, "bakım", hk);
}

async function main() {
  console.log(`İşçi başladı. E-posta: ${isEmailEnabled() ? "açık" : "kapalı (SMTP_URL tanımlı değil)"}`);
  if (process.argv.includes("--once")) {
    await tick();
    return;
  }
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[işçi]", e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().finally(() => db.$disconnect());
