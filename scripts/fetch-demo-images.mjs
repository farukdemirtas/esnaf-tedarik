/**
 * Demo ürün/banner görsellerini Unsplash'tan indirir (gerçek fotoğraf).
 * Kullanım: node scripts/fetch-demo-images.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prisma", "demo", "assets");

/** Unsplash CDN — ürün tipi için gerçekçi stok fotoğraflar */
const PRODUCTS = {
  "demo-dogal-su-05.png": "https://images.unsplash.com/photo-1548830321-f346575bb1e8?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-dogal-su-15.png": "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-maden-suyu.png": "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-kola-1l.png": "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-gazoz-250.png": "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-ayran-200.png": "https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-sut-1l.png": "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-beyaz-peynir.png": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-findik-ezmesi.png": "https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-recel-cilek.png": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-siyah-cay-1kg.png": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-turk-kahvesi.png": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-kirmizi-mercimek.png": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-pirinc-baldo.png": "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-domates-salcasi.png": "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-patates-cipsi.png": "https://images.unsplash.com/photo-1566478989037-eec175614784?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-tuzlu-findik.png": "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-sutlu-cikolata.png": "https://images.unsplash.com/photo-1548907040-4baa42d10919?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-findikli-gofret.png": "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-kremali-biskuvi.png": "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-bulasik-deterjani.png": "https://images.unsplash.com/photo-1585421514298-4d0c0c8d8e8b?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-camasir-suyu.png": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-tuvalet-kagidi.png": "https://images.unsplash.com/photo-1584556812952-905ffd0b8614?auto=format&fit=crop&w=800&h=800&q=80",
  "demo-sivi-sabun.png": "https://images.unsplash.com/photo-1600857544200-b2f666a9c2ec?auto=format&fit=crop&w=800&h=800&q=80",
};

const BANNERS = {
  "banner-home.png": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&h=300&q=85",
  "banner-products.png": "https://images.unsplash.com/photo-1563453397536-e4a85acd9863?auto=format&fit=crop&w=1200&h=200&q=85",
  "catalog-cover.png": "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&h=1000&q=85",
};

async function download(url, dest) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "esnaf-tedarik-demo/1.0 (local asset fetch)",
      Accept: "image/*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error(`too small (${buf.length}) ${url}`);
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  await mkdir(ROOT, { recursive: true });
  const all = { ...PRODUCTS, ...BANNERS };
  let ok = 0;
  for (const [file, url] of Object.entries(all)) {
    const dest = path.join(ROOT, file);
    process.stdout.write(`• ${file} ... `);
    try {
      const n = await download(url, dest);
      console.log(`${(n / 1024).toFixed(0)} KB`);
      ok++;
    } catch (e) {
      console.log(`FAIL ${e.message}`);
    }
  }
  console.log(`Done: ${ok}/${Object.keys(all).length}`);
  if (ok < Object.keys(all).length) process.exitCode = 1;
}

main();
