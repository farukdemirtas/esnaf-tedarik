/**
 * Demo ürün ve banner görsellerini, ürüne uyan çizimlerle değiştirir.
 * Mevcut dosya yollarının üzerine yazar; sipariş ve sepet verisine dokunmaz.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { DEMO_PRODUCTS } from "./data";
import { renderBanner, renderCatalogCover, renderProductArt } from "./art";

const ROOTS = [
  path.resolve("storage/uploads"),
  "C:\\Users\\omerf\\Downloads\\esnaf-tedarik\\storage\\uploads",
];

function newKey(folder: string) {
  return `${folder}/${randomBytes(12).toString("base64url")}.png`;
}

async function put(key: string, buf: Buffer) {
  for (const root of ROOTS) {
    const full = path.join(root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
  }
}

async function main() {
  let products = 0;
  for (const p of DEMO_PRODUCTS) {
    const row = await db.product.findUnique({ where: { chamberId_slug: { chamberId: "chamber-samsun", slug: p.slug } }, include: { images: true } });
    if (!row) continue;
    const png = renderProductArt(p);
    for (const image of row.images) {
      const key = newKey("products");
      await put(key, png);
      await db.productImage.update({ where: { id: image.id }, data: { path: key } });
    }
    products++;
  }

  const ads = await db.advertisement.findMany({ where: { title: { startsWith: "DEMO" } } });
  for (const ad of ads) {
    const kind = ad.title.toLocaleLowerCase("tr").includes("temizlik") ? "cleaning" : "drinks";
    const key = newKey("ads");
    await put(key, renderBanner(kind));
    await db.advertisement.update({ where: { id: ad.id }, data: { imagePath: key } });
  }

  const catalogs = await db.catalog.findMany({ where: { coverPath: { not: null } } });
  for (const catalog of catalogs) {
    const key = newKey("catalogs");
    await put(key, renderCatalogCover());
    await db.catalog.update({ where: { id: catalog.id }, data: { coverPath: key } });
  }

  console.log(`Görseller güncellendi: ${products} ürün, ${ads.length} banner, ${catalogs.length} katalog kapağı.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
