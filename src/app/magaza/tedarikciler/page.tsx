import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/panel/ui";
import { DeliveryNotice, fmtDeliveryDays } from "@/components/shop/product-card";
import { requireMemberPage } from "@/lib/auth/member-page";
import { fmtMoney } from "@/lib/format";
import { listShopSuppliers } from "@/modules/shop/catalog";

export const metadata: Metadata = { title: "Tedarikçiler" };

export default async function ShopSuppliersPage() {
  const { auth } = await requireMemberPage("memberSelf.shop");
  const { ctx, suppliers } = await listShopSuppliers(auth);

  return (
    <>
      <PageHeader title="Tedarikçiler" description="Teslimat ilçenize hizmet veren onaylı tedarikçiler." />
      <DeliveryNotice ctx={ctx} />
      {suppliers.length === 0 ? (
        ctx.address ? <EmptyState title="Bölgenize hizmet veren tedarikçi bulunmuyor." /> : null
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => {
            const minAmount = s.area?.minOrderAmount ?? s.minOrderAmount;
            return (
              <li key={s.id} className="flex">
                <Link
                  href={`/magaza/tedarikciler/${s.slug}`}
                  className="card flex w-full flex-col p-4 transition hover:border-brand-200 hover:shadow"
                >
                  <div className="flex items-center gap-3">
                    {s.logoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={withBase(`/api/files/${s.logoPath}`)} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
                    ) : (
                      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-brand-50 text-lg font-bold text-brand-700">
                        {s.tradeName.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900">{s.tradeName}</h2>
                      <div className="text-xs text-slate-500">{s.offerCount} ürün</div>
                    </div>
                  </div>
                  {s.description && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{s.description}</p>}
                  <dl className="mt-auto grid grid-cols-2 gap-2 pt-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Teslimat günleri</dt>
                      <dd className="font-medium text-slate-800">{fmtDeliveryDays(s.area?.deliveryDays)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Min. sipariş tutarı</dt>
                      <dd className="font-medium text-slate-800">{minAmount ? fmtMoney(minAmount) : "Yok"}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
