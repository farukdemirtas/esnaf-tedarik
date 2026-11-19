/** Demo ürün görsellerini markasız stüdyo fotoğraflarıyla değiştirir. */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { DEMO_PRODUCTS } from "./data";
import { photoForSlug } from "./photo-for";

const ROOTS = [
  path.resolve("storage/uploads"),
  "C:\\Users\\omerf\\Downloads\\esnaf-tedarik\\storage\\uploads",
];
const PHOTOS = path.join(__dirname, "assets", "photos");

function newKey() {
  return `products/${randomBytes(12).toString("base64url")}.jpg`;
}

async function put(key: string, buf: Buffer) {
  for (const root of ROOTS) {
    const full = path.join(root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
  }
}

async function main() {
  let n = 0;
  for (const p of DEMO_PRODUCTS) {
    const row = await db.product.findUnique({
      where: { chamberId_slug: { chamberId: "chamber-samsun", slug: p.slug } },
      include: { images: true },
    });
    if (!row) continue;
    const buf = await readFile(path.join(PHOTOS, photoForSlug(p.slug)));
    for (const image of row.images) {
      const key = newKey();
      await put(key, buf);
      await db.productImage.update({ where: { id: image.id }, data: { path: key } });
    }
    n++;
  }
  console.log(`Fotoğraflar bağlandı: ${n} ürün.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
