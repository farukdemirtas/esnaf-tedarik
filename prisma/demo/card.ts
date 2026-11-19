/**
 * Demo ürün kartı: hazır görsel yoksa marka renginde, ürün adını taşıyan bir PNG üretir.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const body = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 5×7 bit eşlem. Eksik harf kutu olarak çizilir. */
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  İ: ["00100", "00000", "00100", "00100", "00100", "00100", "00100"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  Ö: ["01010", "00000", "01110", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  Ş: ["00100", "01111", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Ü: ["01010", "00000", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  Ç: ["01110", "10001", "10000", "10000", "10001", "01110", "00100"],
  Ğ: ["01110", "00000", "01111", "10001", "10001", "10001", "01111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function glyph(ch: string) {
  return FONT[ch] ?? FONT[ch.toLocaleUpperCase("tr")] ?? ["11111", "10001", "10001", "10001", "10001", "10001", "11111"];
}

export function renderLabeledCard(opts: { title: string; subtitle?: string; color: string; width?: number; height?: number }): Buffer {
  const width = opts.width ?? 640;
  const height = opts.height ?? 640;
  const rgb = new Uint8Array(width * height * 3);
  const [cr, cg, cb] = parseHex(opts.color);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  };
  const fillRect = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, r, g, b);
  };

  fillRect(0, 0, width, height, 244, 247, 248);
  const pad = Math.round(width * 0.06);
  fillRect(pad, pad, width - pad * 2, height - pad * 2, 255, 255, 255);
  const band = Math.round(height * 0.22);
  fillRect(pad, pad, width - pad * 2, band, cr, cg, cb);

  const lum = (cr * 299 + cg * 587 + cb * 114) / 1000;
  const onBand: [number, number, number] = lum > 160 ? [15, 23, 42] : [255, 255, 255];
  const ink: [number, number, number] = [15, 23, 42];

  const drawLine = (text: string, y: number, scale: number, color: [number, number, number], maxWidth: number) => {
    const gap = Math.max(1, Math.round(scale * 0.45));
    const cw = 5 * scale + gap;
    let chars = [...text];
    while (chars.length > 1 && chars.length * cw > maxWidth) chars = chars.slice(0, -1);
    const lineW = chars.length * cw - gap;
    let x = Math.round((width - lineW) / 2);
    for (const ch of chars) {
      const rows = glyph(ch);
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (rows[row][col] !== "1") continue;
          fillRect(x + col * scale, y + row * scale, scale, scale, color[0], color[1], color[2]);
        }
      }
      x += cw;
    }
  };

  const wrap = (text: string, scale: number, maxWidth: number) => {
    const gap = Math.max(1, Math.round(scale * 0.45));
    const cw = 5 * scale + gap;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length * cw <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 5);
  };

  const inner = width - pad * 4;
  const brand = (opts.subtitle ?? "DEMO").toLocaleUpperCase("tr");
  drawLine(brand, pad + Math.round(band * 0.34), Math.max(2, Math.round(width / 160)), onBand, inner);

  const title = opts.title.toLocaleUpperCase("tr");
  const scale = Math.max(3, Math.round(width / 90));
  const lines = wrap(title, scale, inner);
  const lineH = 7 * scale + scale * 2;
  let y = pad + band + Math.round((height - pad * 2 - band - lines.length * lineH) / 2);
  for (const line of lines) {
    drawLine(line, y, scale, ink, inner);
    y += lineH;
  }
  drawLine("DEMO", height - pad - 8 * Math.max(2, Math.round(width / 180)) - 8, Math.max(2, Math.round(width / 180)), [100, 116, 139], inner);

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y0 = 0; y0 < height; y0++) {
    const dest = y0 * (width * 3 + 1);
    raw[dest] = 0;
    rgb.subarray(y0 * width * 3, (y0 + 1) * width * 3).forEach((v, i) => {
      raw[dest + 1 + i] = v;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Katalog dosyası yoksa geçerli, tek sayfalık bir PDF. */
export function minimalPdf(): Buffer {
  const content = "BT /F1 24 Tf 72 760 Td (DEMO Katalog) Tj ET";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body + xref, "latin1");
}
