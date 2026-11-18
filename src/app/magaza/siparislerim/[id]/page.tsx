import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelMySupplierOrderAction, reorderAction } from "@/actions/member";
import { Alert } from "@/components/brand";
import { ActionForm, SubmitButton, TextareaField } from "@/components/form";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireMemberPage } from "@/lib/auth/member-page";
import { NotFoundError } from "@/lib/errors";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, ORDER_STATUS, PACK_TYPE } from "@/lib/format";
import { getMyOrder } from "@/modules/orders/member";

export const metadata: Metadata = { title: "Sipariş" };

const INVOICE_TYPE: Record<string, string> = { INVOICE: "Fatura", WAYBILL: "İrsaliye" };

type Money = { toString(): string };

/** Sipariş anındaki adres kopyası; eksik/bozuk alanlara karşı korumalı okunur */
function readAddress(snapshot: unknown) {
  const raw = (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {}) as Record<string, unknown>;
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    title: get("title"),
    neighborhood: get("neighborhood"),
    line: get("line"),
    district: get("district"),
    city: get("city"),
    contactName: get("contactName"),
    phone: get("phone"),
  };
}

function TotalsList({ t }: { t: { subtotal: Money; discountTotal: Money; vatTotal: Money; grandTotal: Money } }) {
  const discount = Number(t.discountTotal.toString());
  return (
    <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-slate-600">Ara toplam (KDV hariç)</dt>
        <dd className="tabular-nums">{fmtMoney(t.subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-600">İndirim</dt>
        <dd className="tabular-nums text-emerald-700">{discount > 0 ? `−${fmtMoney(t.discountTotal)}` : fmtMoney(0)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-600">KDV</dt>
        <dd className="tabular-nums">{fmtMoney(t.vatTotal)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold">
        <dt>Genel toplam</dt>
        <dd className="tabular-nums">{fmtMoney(t.grandTotal)}</dd>
      </div>
    </dl>
  );
}

export default async function MyOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ yeni?: string; kalan?: string }>;
}) {
  const { auth, can } = await requireMemberPage("memberSelf.orders.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const order = await getMyOrder(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const addr = readAddress(order.addressSnapshot);
  const canOrder = can("memberSelf.order");
  const canCart = can("memberSelf.cart");
  const kalan = Number.parseInt(sp.kalan ?? "", 10);

  return (
    <>
      <PageHeader
        title={`Sipariş ${order.orderNumber}`}
        description={`${fmtDateTime(order.createdAt)} · ${order.supplierOrders.length} tedarikçi`}
        back={{ href: "/magaza/siparislerim", label: "Siparişlerim" }}
        actions={
          canCart ? (
            <ActionForm action={reorderAction} compact className="text-right">
              <input type="hidden" name="id" value={order.id} />
              <SubmitButton variant="secondary">Tümünü tekrar sipariş et</SubmitButton>
              <div className="mt-1">
                <Link href="/magaza/sepet" className="text-xs font-semibold text-brand-600 hover:underline">
                  Sepete git →
                </Link>
              </div>
            </ActionForm>
          ) : undefined
        }
      />

      {sp.yeni === "1" && (
        <div className="mb-6">
          <Alert tone="success">
            <span className="font-semibold">Siparişiniz alındı.</span> Tedarikçilere iletildi; onayladıklarında bildirim alacaksınız.
            {kalan > 0 && (
              <>
                {" "}
                Asgari tutarı karşılanmayan {kalan} tedarikçinin ürünleri{" "}
                <Link href="/magaza/sepet" className="font-semibold underline">
                  sepetinizde
                </Link>{" "}
                bekliyor.
              </>
            )}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Teslimat ve not" className="lg:col-span-2">
          <DL
            items={[
              [
                "Teslimat adresi",
                <div key="adres" className="space-y-0.5">
                  {addr.title && <div className="font-medium">{addr.title}</div>}
                  {(addr.neighborhood || addr.line) && <div>{[addr.neighborhood, addr.line].filter(Boolean).join(", ")}</div>}
                  {(addr.district || addr.city) && <div>{[addr.district, addr.city].filter(Boolean).join(" / ")}</div>}
                  {(addr.contactName || addr.phone) && (
                    <div className="text-sm text-slate-600">
                      Teslim alacak kişi: {addr.contactName ?? "—"}
                      {addr.phone ? ` · ${addr.phone}` : ""}
                    </div>
                  )}
                  {!addr.title && !addr.line && !addr.district && <span className="text-slate-500">Adres bilgisi yok.</span>}
                </div>,
              ],
              ["Sipariş tarihi", fmtDateTime(order.createdAt)],
              ["Siparişi veren", order.createdBy.fullName],
              ["Sipariş notu", order.note ? <span className="whitespace-pre-line">{order.note}</span> : null],
            ]}
          />
        </Section>
        <Section title="Sipariş toplamı">
          <TotalsList t={order} />
          <p className="mt-3 text-xs text-slate-500">Fiyatlar sipariş anındaki fiyatlardır. Ödeme platform dışında, tedarikçiyle aranızda yapılır.</p>
        </Section>
      </div>

      <div className="mt-8 space-y-10">
        {order.supplierOrders.map((so) => (
          <section key={so.id} aria-labelledby={`so-${so.id}`} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="min-w-0">
                <h2 id={`so-${so.id}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
                  <span className="font-mono">{so.subNumber}</span>
                  <StatusBadge map={ORDER_STATUS} value={so.status} />
                </h2>
                <div className="mt-1 text-sm text-slate-700">
                  <Link href={`/magaza/tedarikciler/${so.supplier.slug}`} className="font-medium text-brand-700 hover:underline">
                    {so.supplier.tradeName}
                  </Link>
                  {so.supplier.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${so.supplier.phone}`} className="hover:underline">
                        {so.supplier.phone}
                      </a>
                    </>
                  )}
                  {so.supplier.email && (
                    <>
                      {" · "}
                      <a href={`mailto:${so.supplier.email}`} className="hover:underline">
                        {so.supplier.email}
                      </a>
                    </>
                  )}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Planlanan teslimat: {so.plannedDate ? fmtDate(so.plannedDate) : "henüz belirlenmedi"}
                </div>
              </div>
              {canCart && (
                <ActionForm action={reorderAction} compact className="text-right">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="supplierOrderId" value={so.id} />
                  <SubmitButton variant="small">Bu tedarikçiden tekrar sipariş</SubmitButton>
                </ActionForm>
              )}
            </div>

            {so.rejectReason && (
              <Alert tone={so.status === "REJECTED" ? "error" : "warning"}>
                <span className="font-semibold">{so.status === "REJECTED" ? "Ret gerekçesi" : "İptal gerekçesi"}:</span>{" "}
                <span className="whitespace-pre-line">{so.rejectReason}</span>
              </Alert>
            )}
            {so.supplierNote && (
              <Alert tone="info">
                <span className="font-semibold">Tedarikçi notu:</span> <span className="whitespace-pre-line">{so.supplierNote}</span>
              </Alert>
            )}

            <Table head={["Ürün", "Paket", "Miktar", "Liste fiyatı", "Uygulanan fiyat", "KDV", "Tutar (KDV dahil)"]}>
              {so.items.map((it) => {
                const discounted = !it.listPackPrice.eq(it.finalPackPrice);
                return (
                  <tr key={it.id}>
                    <Td>
                      <div className="font-medium">{it.productName}</div>
                      <div className="text-xs text-slate-500">{it.brandName}</div>
                      {it.campaignId && (
                        <div className="mt-1">
                          <Badge tone="green">{it.campaign?.title ?? "Kampanya"}</Badge>
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {PACK_TYPE[it.packType] ?? it.packType}
                      {it.unitsPerPack > 1 ? ` × ${it.unitsPerPack}` : ""}
                    </Td>
                    <Td className="font-semibold tabular-nums">{fmtNumber(it.quantity)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">
                      {discounted ? <span className="text-slate-400 line-through">{fmtMoney(it.listPackPrice)}</span> : fmtMoney(it.listPackPrice)}
                    </Td>
                    <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(it.finalPackPrice)}</Td>
                    <Td>%{it.vatRate}</Td>
                    <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(it.lineTotal)}</Td>
                  </tr>
                );
              })}
            </Table>
            <TotalsList t={so} />

            <div className="grid gap-6 md:grid-cols-2">
              <Section title="Durum geçmişi">
                {so.statusHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">Kayıt yok.</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                    {so.statusHistory.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" aria-hidden />
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge map={ORDER_STATUS} value={h.toStatus} />
                          <span className="text-xs text-slate-500">{fmtDateTime(h.createdAt)}</span>
                        </div>
                        {h.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{h.note}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              <div className="space-y-6">
                <Section title="Fatura ve irsaliyeler">
                  {so.invoices.length === 0 ? (
                    <p className="text-sm text-slate-500">Tedarikçi henüz belge bilgisi girmedi.</p>
                  ) : (
                    <ul className="space-y-2">
                      {so.invoices.map((inv) => (
                        <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                          <span>
                            <span className="font-medium">{INVOICE_TYPE[inv.type] ?? inv.type}</span>{" "}
                            <span className="font-mono text-xs">{inv.documentNumber}</span>
                          </span>
                          <span className="text-xs text-slate-500">
                            {fmtDate(inv.documentDate)}
                            {inv.amount ? ` · ${fmtMoney(inv.amount)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {so.status === "PENDING" && canOrder && (
                  <Section title="Siparişi iptal et">
                    <ActionForm
                      action={cancelMySupplierOrderAction}
                      confirm={`${so.subNumber} numaralı sipariş iptal edilsin mi? Bu işlem geri alınamaz.`}
                      className="space-y-3"
                    >
                      <input type="hidden" name="id" value={so.id} />
                      <TextareaField
                        name="note"
                        label="İptal nedeni"
                        maxLength={500}
                        rows={2}
                        hint="İsteğe bağlı; tedarikçiye iletilir. Tedarikçi siparişi onayladıktan sonra iptal edilemez."
                      />
                      <SubmitButton variant="danger">İptal et</SubmitButton>
                    </ActionForm>
                  </Section>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
