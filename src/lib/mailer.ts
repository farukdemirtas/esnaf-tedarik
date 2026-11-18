import nodemailer, { type Transporter } from "nodemailer";

/**
 * E-posta gönderimi (SMTP). Türkiye'deki kurumsal e-posta ve toplu gönderim sağlayıcılarının hepsi SMTP destekler.
 * SMTP_URL tanımlı değilse e-posta kanalı kapalıdır; sistem panel içi bildirimlerle çalışmaya devam eder.
 *   SMTP_URL="smtps://kullanici:sifre@smtp.saglayici.com:465"
 *   MAIL_FROM="ESNAF TEDARİK <bildirim@alanadi.com>"
 * Geliştirme/test: SMTP_URL="log" → e-postalar gönderilmez, sunucu günlüğüne yazılır.
 */

let transport: Transporter | null = null;

export function isEmailEnabled(): boolean {
  return !!process.env.SMTP_URL && !!process.env.MAIL_FROM;
}

function getTransport(): Transporter {
  transport ??= process.env.SMTP_URL === "log" ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(process.env.SMTP_URL!);
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Bağlantı (tam adres) — e-postada düğme olarak gösterilir */
  link?: string;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderMail(m: Mail) {
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="font-weight:700;font-size:18px;color:#12395c;margin-bottom:16px">ESNAF TEDARİK</div>
<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(m.subject)}</h1>
<p style="font-size:15px;line-height:1.5;white-space:pre-line;margin:0">${escapeHtml(m.text)}</p>
${m.link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(m.link)}" style="background:#1d5d91;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;display:inline-block">Görüntüle</a></p>` : ""}
</div>
<p style="font-size:12px;color:#64748b;margin-top:16px">Bu e-posta otomatik gönderilmiştir; lütfen yanıtlamayın.</p>
</div></body></html>`;
  const text = m.link ? `${m.text}\n\n${m.link}` : m.text;
  return { html, text };
}

export async function sendMail(m: Mail): Promise<void> {
  if (!isEmailEnabled()) throw new Error("E-posta gönderimi yapılandırılmamış (SMTP_URL / MAIL_FROM).");
  const { html, text } = renderMail(m);
  await getTransport().sendMail({ from: process.env.MAIL_FROM, to: m.to, subject: `${m.subject} — ESNAF TEDARİK`, text, html });
  if (process.env.SMTP_URL === "log") console.log(`[e-posta:log] → ${m.to}: ${m.subject}${m.link ? ` (${m.link})` : ""}`);
}
