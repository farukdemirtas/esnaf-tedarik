import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth/assert";
import { chamberIdOf, memberIdOf } from "@/lib/auth/scope";
import { NotFoundError } from "@/lib/errors";
import type { AuthContext } from "@/modules/auth/context";
import { listShopProducts } from "./catalog";

/** Favori ekle/çıkar. Döner: işlemden sonra favoride mi */
export async function toggleFavorite(auth: AuthContext, productId: string): Promise<boolean> {
  assertPermission(auth, "memberSelf.shop");
  const memberId = memberIdOf(auth);
  const product = await db.product.findFirst({ where: { id: productId, chamberId: chamberIdOf(auth), status: "ACTIVE" }, select: { id: true } });
  if (!product) throw new NotFoundError("Ürün bulunamadı.");
  const key = { memberId_productId: { memberId, productId } };
  if (await db.favorite.findUnique({ where: key })) {
    await db.favorite.delete({ where: key });
    return false;
  }
  await db.favorite.create({ data: { memberId, productId } });
  return true;
}

/** Favoriler: görünürlük kuralı katalogla aynı (bölgeye hizmet vermeyen tedarikçinin ürünü listelenmez) */
export async function listFavorites(auth: AuthContext, page?: string) {
  assertPermission(auth, "memberSelf.shop");
  const favs = await db.favorite.findMany({ where: { memberId: memberIdOf(auth) }, select: { productId: true } });
  const list = await listShopProducts(auth, { sayfa: page, onlyIds: favs.map((f) => f.productId) });
  return { ...list, hiddenCount: favs.length - list.total };
}
