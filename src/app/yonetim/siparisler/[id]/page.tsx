import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { NotFoundError } from "@/lib/errors";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, ORDER_STATUS, PACK_TYPE } from "@/lib/format";
import { getSupplierOrderForAdmin } from "@/modules/admin/service";

export const metadata: Metadata = { title: "Sipariş" };

const INVOICE_TYPE: Record<string, string> = { INVOICE: "Fatura", WAYBILL: "İrsaliye" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base, can } = await requireOdaPage("order.viewAll");
  const { id } = await params;
  const so = await getSupplierOrderForAdmin(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { order, supplier } = so;
  const member = order.member;
  const addr = (order.addressSnapshot ?? {}) as Record<string, string>;
  // Adres anlık kopyası: { title, district, city, neighborhood?, line, contactName, phone }
  const address = [
    [addr.line, addr.neighborhood].filter(Boolean).join(", "),
    [addr.district, addr.city].filter(Boolean).join("/"),
    addr.contactName && `Teslim alacak: ${addr.contactName}${addr.phone ? ` (${addr.phone})` : ""}`,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <>
      <PageHeader
        title={`Sipariş ${so.subNumber}`}
        description={`${member.businessName} → ${supplier.tradeName}`}
        back={{ href: `${base}/siparisler`, label: "Siparişler" }}
        actions={<StatusBadge map={ORDER_STATUS} value={so.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Sipariş bilgileri">
            <DL
              items={[
                ["Ana sipariş no", <code key="no" className="font-mono">{order.orderNumber}</code>],
                ["Sipariş tarihi", fmtDateTime(so.createdAt)],
                ["Son güncelleme", fmtDateTime(so.updatedAt)],
                ["Planlanan teslimat", so.plannedDate ? fmtDate(so.plannedDate) : null],
                [
                  "Üye",
                  <>
                    {can("member.view") ? (
                      <Link href={`${base}/uyeler/${member.id}`} className="text-brand-700 hover:underline">
                        {member.businessName}
                      </Link>
                    ) : (
                      member.businessName
                    )}
                    {member.phone && <div className="text-sm text-slate-600">{member.phone}</div>}
                  </>,
                ],
                ["Siparişi veren kullanıcı", order.createdBy.username],
                [
                  "Tedarikçi",
                  <>
                    {can("supplier.view") ? (
                      <Link href={`${base}/tedarikciler/${supplier.id}`} className="text-brand-700 hover:underline">
                        {supplier.tradeName}
                      </Link>
                    ) : (
                      supplier.tradeName
                    )}
                    {supplier.phone && <div className="text-sm text-slate-600">{supplier.phone}</div>}
                  </>,
                ],
                ["Teslimat adresi", address || null],
                ["Üye notu", order.note ? <span className="whitespace-pre-line">{order.note}</span> : null],
                ["Tedarikçi notu", so.supplierNote ? <span className="whitespace-pre-line">{so.supplierNote}</span> : null],
                ...(so.rejectReason ? ([["Ret / iptal gerekçesi", <span key="ret" className="text-red-700">{so.rejectReason}</span>]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </Section>

          <Section title={`Ürünler (${so.items.length})`}>
            <Table head={["Ürün", "Paket", "Miktar", "Paket fiyatı", "İndirim", "KDV", "Tutar"]}>
              {so.items.map((it) => (
                <tr key={it.id}>
                  <Td>
                    <div className="font-medium">{it.productName}</div>
                    <div className="text-xs text-slate-500">
                      {it.brandName}
                      {it.barcode ? ` · ${it.barcode}` : ""}
                    </div>
                    {it.campaignId && (
                      <div className="mt-1">
                        <Badge tone="green">Kampanyalı</Badge>
                      </div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {PACK_TYPE[it.packType] ?? it.packType}
                    {it.unitsPerPack > 1 ? ` × ${it.unitsPerPack}` : ""}
                  </Td>
                  <Td className="tabular-nums">{fmtNumber(it.quantity)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {fmtMoney(it.finalPackPrice)}
                    {Number(it.listPackPrice.toString()) !== Number(it.finalPackPrice.toString()) && (
                      <div className="text-xs text-slate-400 line-through">{fmtMoney(it.listPackPrice)}</div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{Number(it.lineDiscount.toString()) > 0 ? fmtMoney(it.lineDiscount) : "—"}</Td>
                  <Td>%{it.vatRate}</Td>
                  <Td className="whitespace-nowrap font-medium tabular-nums">{fmtMoney(it.lineTotal)}</Td>
                </tr>
              ))}
            </Table>

            <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Ara toplam (KDV hariç)</dt>
                <dd className="tabular-nums">{fmtMoney(so.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">İndirim</dt>
                <dd className="tabular-nums text-emerald-700">{Number(so.discountTotal.toString()) > 0 ? `−${fmtMoney(so.discountTotal)}` : fmtMoney(0)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">KDV</dt>
                <dd className="tabular-nums">{fmtMoney(so.vatTotal)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Genel toplam</dt>
                <dd className="tabular-nums">{fmtMoney(so.grandTotal)}</dd>
              </div>
            </dl>
          </Section>
        </div>

        <div className="space-y-6">
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
                    <div className="mt-1 text-xs text-slate-500">{h.changedBy ? h.changedBy.username : "Sistem"}</div>
                    {h.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Fatura ve irsaliyeler">
            {so.invoices.length === 0 ? (
              <p className="text-sm text-slate-500">Tedarikçi henüz belge kaydı girmemiş.</p>
            ) : (
              <ul className="space-y-3">
                {so.invoices.map((inv) => (
                  <li key={inv.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{INVOICE_TYPE[inv.type] ?? inv.type}</span>
                      <span className="text-xs text-slate-500">{fmtDate(inv.documentDate)}</span>
                    </div>
                    <div className="mt-1 font-mono text-xs">{inv.documentNumber}</div>
                    {inv.amount && <div className="mt-1 tabular-nums">{fmtMoney(inv.amount)}</div>}
                    {inv.filePath && (
                      <a href={withBase(`/api/files/${inv.filePath}`)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
                        Belgeyi aç
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
