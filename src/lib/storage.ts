import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";

/**
 * Dosya depolama soyutlaması. Geliştirmede yerel disk; canlıda aynı arayüzle
 * S3 uyumlu bir sürücü eklenecek (Aşama 7). Dosyalar web kökünün DIŞINDA saklanır
 * ve yalnızca /api/files/... üzerinden, yetki kontrolüyle sunulur.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type FileKind = "image" | "document";

const SIGNATURES: { mime: string; ext: string; kind: FileKind; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", kind: "image", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: "png",
    kind: "image",
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    ext: "webp",
    kind: "image",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { mime: "application/pdf", ext: "pdf", kind: "document", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
];

export class UploadError extends Error {}

/** Dosya türünü uzantıya/istemcinin söylediğine göre değil, içeriğin ilk baytlarına göre belirler. */
export function detectFileType(buf: Buffer) {
  return SIGNATURES.find((s) => buf.length >= 12 && s.test(buf)) ?? null;
}

export function validateUpload(buf: Buffer, allowed: FileKind[]) {
  const type = detectFileType(buf);
  if (!type || !allowed.includes(type.kind)) throw new UploadError("Desteklenmeyen dosya türü.");
  const max = type.kind === "image" ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (buf.length > max) throw new UploadError(`Dosya en fazla ${Math.round(max / 1024 / 1024)} MB olabilir.`);
  return type;
}

const SAFE_FOLDER = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const SAFE_KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)*\/[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/;

function root() {
  return path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");
}

function resolveKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new UploadError("Geçersiz dosya yolu.");
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new UploadError("Geçersiz dosya yolu.");
  return full;
}

/** Dosyayı doğrular ve rastgele isimle kaydeder. Dönen anahtar veritabanına yazılır. */
export async function saveFile(folder: string, buf: Buffer, allowed: FileKind[]) {
  if (!SAFE_FOLDER.test(folder)) throw new UploadError("Geçersiz klasör.");
  const type = validateUpload(buf, allowed);
  const key = `${folder}/${randomToken(16)}.${type.ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { flag: "wx" });
  return { key, mime: type.mime, size: buf.length };
}

export async function readStoredFile(key: string) {
  const full = resolveKey(key);
  const buf = await readFile(full);
  const type = detectFileType(buf);
  return { buf, mime: type?.mime ?? "application/octet-stream" };
}

export async function deleteFile(key: string) {
  await unlink(resolveKey(key)).catch(() => {});
}
