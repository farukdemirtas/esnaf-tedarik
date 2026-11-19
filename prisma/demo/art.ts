/**
 * Demo görselleri: her ürün kendi türünde bir ambalaj çizimi alır.
 * Bannerlar stok fotoğraf yerine kampanya afişidir.
 */
import { deflateSync } from "node:zlib";
import { glyph, parseHex } from "./card";

type RGB = [number, number, number];

const INK: RGB = [15, 23, 42];
const WHITE: RGB = [255, 255, 255];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
const light = (c: RGB, t: number) => mix(c, WHITE, t);
const dark = (c: RGB, t: number) => mix(c, [8, 18, 28], t);

class Canvas {
  readonly rgb: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.rgb = new Uint8Array(width * height * 3);
  }
  set(x: number, y: number, c: RGB) {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const i = (yi * this.width + xi) * 3;
    this.rgb[i] = c[0];
    this.rgb[i + 1] = c[1];
    this.rgb[i + 2] = c[2];
  }
  fill(c: RGB) {
    for (let i = 0; i < this.rgb.length; i += 3) {
      this.rgb[i] = c[0];
      this.rgb[i + 1] = c[1];
      this.rgb[i + 2] = c[2];
    }
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.width, (x + w) | 0);
    const y1 = Math.min(this.height, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * this.width + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.rgb[i++] = c[0];
        this.rgb[i++] = c[1];
        this.rgb[i++] = c[2];
      }
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
    }
  }
  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
  }
  fillRoundRect(x: number, y: number, w: number, h: number, r: number, c: RGB) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    this.fillRect(x + rad, y, w - rad * 2, h, c);
    this.fillRect(x, y + rad, w, h - rad * 2, c);
    this.fillCircle(x + rad, y + rad, rad, c);
    this.fillCircle(x + w - rad, y + rad, rad, c);
    this.fillCircle(x + rad, y + h - rad, rad, c);
    this.fillCircle(x + w - rad, y + h - rad, rad, c);
  }
  vgrad(c0: RGB, c1: RGB) {
    for (let y = 0; y < this.height; y++) {
      this.fillRect(0, y, this.width, 1, mix(c0, c1, y / this.height));
    }
  }
  text(text: string, x: number, y: number, scale: number, color: RGB, align: "left" | "center" = "left") {
    const gap = Math.max(1, Math.round(scale * 0.4));
    const cw = 5 * scale + gap;
    const chars = [...text];
    let left = x;
    if (align === "center") left = Math.round(x - (chars.length * cw - gap) / 2);
    for (const ch of chars) {
      const rows = glyph(ch);
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (rows[row]?.[col] !== "1") continue;
          this.fillRect(left + col * scale, y + row * scale, scale, scale, color);
        }
      }
      left += cw;
    }
  }
  png() {
    const raw = Buffer.alloc((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      const dest = y * (this.width * 3 + 1);
      raw[dest] = 0;
      raw.set(this.rgb.subarray(y * this.width * 3, (y + 1) * this.width * 3), dest + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  }
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

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

type Kind =
  | "water"
  | "soda"
  | "carton"
  | "cup"
  | "tub"
  | "cheese"
  | "jar"
  | "box"
  | "sack"
  | "can"
  | "bag"
  | "bar"
  | "wafer"
  | "biscuit"
  | "jug"
  | "pump"
  | "rolls"
  | "pack";

function kindOf(slug: string): Kind {
  if (slug.includes("marlboro")) return "pack";
  if (slug.includes("tuvalet")) return "rolls";
  if (slug.includes("camasir")) return "jug";
  if (slug.includes("sabun") || slug.includes("bulasik")) return "pump";
  if (slug.includes("cips") || slug.includes("lays")) return "bag";
  if (slug.includes("findik-ezmesi") || slug.includes("recel") || slug.includes("kahve") || slug.includes("nescafe")) return "jar";
  if (slug.includes("gofret") || slug.includes("halley") || slug.includes("metro") || slug.includes("cin") || slug.includes("wanted")) return "wafer";
  if (slug.includes("cikolata")) return "bar";
  if (slug.includes("biskuvi") || slug.includes("burcak") || slug.includes("tutku")) return "biscuit";
  if (slug.includes("findik")) return "sack";
  if (slug.includes("peynir")) return "cheese";
  if (slug.includes("yogurt")) return "tub";
  if (slug.includes("ayran")) return "cup";
  if (slug.includes("sut")) return "carton";
  if (slug.includes("kola") || slug.includes("fanta") || slug.includes("sprite") || slug.includes("gazoz") || slug.includes("coca")) return "soda";
  if (slug.includes("maden") || slug.includes("su")) return "water";
  if (slug.includes("cay")) return "box";
  if (slug.includes("mercimek") || slug.includes("pirinc")) return "sack";
  if (slug.includes("salca")) return "can";
  return "box";
}

function bottle(c: Canvas, x: number, y: number, h: number, liquid: RGB, cap: RGB) {
  const w = h * 0.42;
  c.fillRoundRect(x + w * 0.32, y, w * 0.36, h * 0.1, 4, cap);
  c.fillRect(x + w * 0.38, y + h * 0.09, w * 0.24, h * 0.12, light(liquid, 0.35));
  c.fillRoundRect(x, y + h * 0.18, w, h * 0.8, w * 0.28, liquid);
  c.fillRect(x + w * 0.12, y + h * 0.34, w * 0.08, h * 0.48, light(liquid, 0.45));
}

function drawKind(c: Canvas, kind: Kind, accent: RGB) {
  const cx = 320;
  c.fillEllipse(cx, 470, 150, 22, [226, 232, 240]);
  if (kind === "water") {
    bottle(c, 230, 70, 380, light(accent, 0.25), accent);
  } else if (kind === "soda") {
    bottle(c, 220, 60, 400, dark(accent, 0.55), WHITE);
    c.fillRoundRect(248, 210, 150, 110, 8, accent);
  } else if (kind === "carton") {
    c.fillRect(230, 150, 180, 280, WHITE);
    c.fillRect(250, 110, 140, 50, accent);
    c.fillRect(230, 150, 180, 36, accent);
    c.fillRect(255, 230, 130, 150, light(accent, 0.75));
  } else if (kind === "cup") {
    c.fillRoundRect(210, 160, 220, 260, 28, WHITE);
    c.fillRect(210, 210, 220, 28, accent);
    c.fillEllipse(320, 168, 100, 22, light(accent, 0.7));
  } else if (kind === "tub") {
    c.fillRoundRect(190, 180, 260, 230, 24, WHITE);
    c.fillRoundRect(175, 150, 290, 56, 16, accent);
  } else if (kind === "cheese") {
    c.fillEllipse(320, 360, 170, 36, [226, 232, 240]);
    c.fillEllipse(320, 250, 150, 40, [255, 252, 245]);
    c.fillRect(170, 250, 300, 110, [255, 252, 245]);
    c.fillEllipse(320, 360, 150, 40, [244, 236, 214]);
  } else if (kind === "jar") {
    c.fillRoundRect(210, 150, 220, 280, 36, light(accent, 0.15));
    c.fillRoundRect(190, 110, 260, 48, 10, [203, 213, 225]);
    c.fillRect(250, 210, 28, 160, light(accent, 0.45));
  } else if (kind === "sack") {
    c.fillRoundRect(180, 160, 280, 280, 70, accent);
    c.fillCircle(320, 150, 46, dark(accent, 0.15));
    c.fillRect(292, 90, 56, 70, dark(accent, 0.25));
  } else if (kind === "can") {
    c.fillRect(210, 140, 220, 280, accent);
    c.fillEllipse(320, 140, 110, 28, light(accent, 0.25));
    c.fillEllipse(320, 420, 110, 28, dark(accent, 0.2));
    c.fillRect(245, 230, 150, 90, WHITE);
  } else if (kind === "bag") {
    c.fillRoundRect(190, 120, 260, 320, 36, accent);
    c.fillRect(230, 90, 180, 40, light(accent, 0.2));
    c.fillCircle(320, 280, 48, light(accent, 0.35));
  } else if (kind === "bar") {
    c.fillRoundRect(150, 180, 340, 220, 16, accent);
    for (let i = 1; i < 4; i++) c.fillRect(150 + i * 85, 190, 6, 200, dark(accent, 0.25));
    c.fillRect(160, 284, 320, 8, dark(accent, 0.25));
  } else if (kind === "wafer") {
    c.fillRoundRect(160, 200, 320, 180, 18, [253, 230, 138]);
    c.fillRect(160, 248, 320, 28, accent);
    c.fillRect(160, 308, 320, 28, accent);
  } else if (kind === "biscuit") {
    c.fillRoundRect(170, 150, 300, 280, 18, [254, 243, 199]);
    c.fillCircle(270, 250, 42, accent);
    c.fillCircle(370, 250, 42, accent);
    c.fillCircle(320, 330, 42, accent);
  } else if (kind === "jug") {
    c.fillRoundRect(190, 150, 220, 290, 40, accent);
    c.fillRoundRect(250, 90, 80, 70, 12, WHITE);
    c.fillCircle(390, 270, 48, [248, 250, 252]);
    c.fillCircle(390, 270, 28, accent);
  } else if (kind === "pump") {
    bottle(c, 220, 110, 340, light(accent, 0.2), accent);
    c.fillRect(292, 60, 56, 58, dark(accent, 0.1));
  } else if (kind === "rolls") {
    c.fillCircle(250, 280, 90, WHITE);
    c.fillCircle(250, 280, 36, [226, 232, 240]);
    c.fillCircle(390, 280, 90, WHITE);
    c.fillCircle(390, 280, 36, [226, 232, 240]);
  } else if (kind === "pack") {
    c.fillRoundRect(210, 80, 220, 360, 12, accent);
    c.fillRect(210, 200, 220, 70, WHITE);
    c.fillRect(210, 80, 220, 16, dark(accent, 0.35));
  } else {
    c.fillRoundRect(180, 120, 280, 320, 16, accent);
    c.fillRect(210, 200, 220, 140, WHITE);
  }
}

function wrap(text: string, scale: number, maxWidth: number) {
  const cw = 5 * scale + Math.max(1, Math.round(scale * 0.4));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if ([...next].length * cw <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export function renderProductArt(p: { slug: string; name: string; brand: string; color: string }) {
  const c = new Canvas(640, 640);
  const accent = parseHex(p.color);
  c.fill(light(accent, 0.9));
  c.fillCircle(320, 250, 230, light(accent, 0.78));
  drawKind(c, kindOf(p.slug), accent);
  c.fillRoundRect(36, 508, 568, 100, 18, WHITE);
  c.text(p.brand.toLocaleUpperCase("tr"), 320, 522, 3, accent, "center");
  const lines = wrap(p.name.toLocaleUpperCase("tr"), 4, 520);
  lines.forEach((line, i) => c.text(line, 320, 552 + i * 32, 4, INK, "center"));
  return c.png();
}

function bannerBottles(c: Canvas) {
  bottle(c, 760, 40, 230, [125, 211, 252], [14, 116, 144]);
  bottle(c, 900, 28, 250, [69, 10, 10], WHITE);
  c.fillRoundRect(928, 118, 90, 62, 6, [220, 38, 38]);
  bottle(c, 1040, 55, 210, [254, 215, 170], [249, 115, 22]);
}

export function renderBanner(kind: "drinks" | "cleaning") {
  if (kind === "cleaning") {
    const c = new Canvas(1200, 200);
    c.vgrad([6, 48, 28], [22, 163, 74]);
    c.fillCircle(1080, 20, 120, [255, 255, 255]);
    c.text("ESNAF TEDARİK", 48, 28, 3, [187, 247, 208]);
    c.text("TEMİZLİK HAFTASI", 48, 62, 8, WHITE);
    c.text("TOPLU ALIMDA İNDİRİM", 48, 132, 4, [254, 240, 138]);
    bottle(c, 860, 18, 160, [134, 239, 172], WHITE);
    c.fillRoundRect(980, 36, 140, 140, 24, [125, 211, 252]);
    c.fillRoundRect(1040, 8, 40, 36, 6, WHITE);
    return c.png();
  }
  const c = new Canvas(1200, 300);
  c.vgrad([6, 28, 40], [14, 116, 144]);
  c.fillCircle(980, 40, 180, [232, 176, 74]);
  c.text("ESNAF TEDARİK", 56, 48, 4, [243, 201, 120]);
  c.text("YAZ SERİNLİĞİ", 56, 100, 10, WHITE);
  c.fillRect(56, 186, 280, 6, [232, 176, 74]);
  c.text("İÇECEKLERDE ÜYEYE ÖZEL FİYAT", 56, 214, 4, [224, 242, 254]);
  bannerBottles(c);
  return c.png();
}

export function renderCatalogCover() {
  const c = new Canvas(800, 1000);
  c.vgrad([10, 31, 41], [20, 80, 100]);
  c.fillCircle(640, 120, 160, [232, 176, 74]);
  c.text("ESNAF TEDARİK", 400, 80, 4, [243, 201, 120], "center");
  c.text("AYLIK", 400, 180, 8, WHITE, "center");
  c.text("FIRSAT", 400, 260, 10, [243, 201, 120], "center");
  c.text("KATALOĞU", 400, 360, 8, WHITE, "center");
  bottle(c, 120, 480, 360, [125, 211, 252], [14, 116, 144]);
  c.fillRoundRect(340, 560, 160, 220, 16, [253, 230, 138]);
  c.fillRect(340, 640, 160, 28, [180, 83, 9]);
  c.fillRoundRect(540, 540, 150, 260, 20, [254, 226, 226]);
  c.fillRoundRect(560, 500, 110, 48, 8, [203, 213, 225]);
  return c.png();
}
