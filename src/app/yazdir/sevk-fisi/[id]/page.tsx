import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { NotFoundError } from "@/lib/errors";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, PACK_TYPE } from "@/lib/format";
import { getMySupplierOrder } from "@/modules/orders/supplier";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Sevk fişi" };

function readAddress(snapshot: unknown) {
  const raw = (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {}) as Record<string, string | undefined>;
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

export default async function DeliverySlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth } = await requireSupplierPage("supplierSelf.orders.view");
  const { id } = await params;
  const so = await getMySupplierOrder(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { supplier, order } = so;
  const member = order.member;
  const addr = readAddress(order.addressSnapshot);
  const hasDiscount = Number(so.discountTotal.toString()) > 0;

  return (
    <div className="min-h-dvh bg-white text-slate-900 print:min-h-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { body { background: #fff; } }`}</style>

      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-6 pt-6 print:hidden">
        <Link href={`/tedarikci/siparisler/${so.id}`} className="text-sm text-brand-600 hover:underline">
          ← Siparişe dön
        </Link>
        <PrintButton />
      </div>

      <main className="mx-auto max-w-[210mm] px-6 py-8 text-sm print:max-w-none print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div className="min-w-0">
            <div className="text-lg font-bold">{supplier.tradeName}</div>
            {supplier.legalName && supplier.legalName !== supplier.tradeName && <div className="text-slate-700">{supplier.legalName}</div>}
            {supplier.address && <div className="mt-1 whitespace-pre-line text-slate-700">{supplier.address}</div>}
            {supplier.phone && <div className="text-slate-700">Tel: {supplier.phone}</div>}
            {(supplier.taxOffice || supplier.taxNumber) && (
              <div className="text-slate-700">
                Vergi dairesi / No: {supplier.taxOffice || "—"} / {supplier.taxNumber || "—"}
              </div>
            )}
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-extrabold tracking-wide">SEVK FİŞİ</h1>
            <div className="mt-2">
              Fiş no: <span className="font-mono font-semibold">{so.subNumber}</span>
            </div>
            <div>Sipariş tarihi: {fmtDateTime(so.createdAt)}</div>
            {so.plannedDate && <div>Planlanan teslim: {fmtDate(so.plannedDate)}</div>}
            <div>Düzenleme tarihi: {fmtDate(new Date())}</div>
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div className="rounded border border-slate-300 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alıcı</div>
            <div className="mt-1 font-semibold">{member.businessName}</div>
            {member.ownerName && <div>{member.ownerName}</div>}
            {member.phone && <div>Tel: {member.phone}</div>}
            {member.registryNumber && <div>Oda sicil no: {member.registryNumber}</div>}
          </div>
          <div className="rounded border border-slate-300 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teslimat adresi</div>
            {addr.title && <div className="mt-1 font-semibold">{addr.title}</div>}
            {(addr.neighborhood || addr.line) && <div>{[addr.neighborhood, addr.line].filter(Boolean).join(", ")}</div>}
            {(addr.district || addr.city) && <div>{[addr.district, addr.city].filter(Boolean).join(" / ")}</div>}
            {(addr.contactName || addr.phone) && (
              <div>
                {addr.contactName}
                {addr.contactName && addr.phone ? " · " : ""}
                {addr.phone && `Tel: ${addr.phone}`}
              </div>
            )}
            {!addr.title && !addr.line && !addr.district && <div className="mt-1 text-slate-500">—</div>}
          </div>
        </section>

        <div className="mt-5 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs print:min-w-0">
            <thead>
              <tr className="border-y border-slate-900 bg-slate-100 print:bg-transparent">
                <th className="px-1.5 py-2">No</th>
                <th className="px-1.5 py-2">Ürün</th>
                <th className="px-1.5 py-2">Barkod</th>
                <th className="px-1.5 py-2">Paket</th>
                <th className="px-1.5 py-2 text-right">Miktar</th>
                <th className="px-1.5 py-2 text-right">Birim fiyat (KDV hariç)</th>
                <th className="px-1.5 py-2 text-right">KDV</th>
                <th className="px-1.5 py-2 text-right">Tutar (KDV dahil)</th>
              </tr>
            </thead>
            <tbody>
              {so.items.map((it, i) => (
                <tr key={it.id} className="break-inside-avoid border-b border-slate-300">
                  <td className="px-1.5 py-1.5 align-top tabular-nums">{i + 1}</td>
                  <td className="px-1.5 py-1.5 align-top">
                    <div className="font-medium">{it.productName}</div>
                    <div className="text-slate-600">{it.brandName}</div>
                  </td>
                  <td className="px-1.5 py-1.5 align-top font-mono">{it.barcode ?? "—"}</td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 align-top">
                    {PACK_TYPE[it.packType] ?? it.packType}
                    {it.unitsPerPack > 1 ? ` × ${it.unitsPerPack}` : ""}
                  </td>
                  <td className="px-1.5 py-1.5 text-right align-top font-semibold tabular-nums">{fmtNumber(it.quantity)}</td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right align-top tabular-nums">{fmtMoney(it.finalPackPrice)}</td>
                  <td className="px-1.5 py-1.5 text-right align-top tabular-nums">%{it.vatRate}</td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right align-top tabular-nums">{fmtMoney(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            {order.note && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Üye notu</div>
                <p className="mt-1 whitespace-pre-line">{order.note}</p>
              </div>
            )}
            {so.supplierNote && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tedarikçi notu</div>
                <p className="mt-1 whitespace-pre-line">{so.supplierNote}</p>
              </div>
            )}
          </div>
          <dl className="w-64 space-y-1">
            <div className="flex justify-between gap-4">
              <dt>Ara toplam (KDV hariç)</dt>
              <dd className="tabular-nums">{fmtMoney(so.subtotal)}</dd>
            </div>
            {hasDiscount && (
              <div className="flex justify-between gap-4">
                <dt>İndirim</dt>
                <dd className="tabular-nums">−{fmtMoney(so.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt>KDV</dt>
              <dd className="tabular-nums">{fmtMoney(so.vatTotal)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-900 pt-1.5 text-base font-bold">
              <dt>Genel toplam</dt>
              <dd className="tabular-nums">{fmtMoney(so.grandTotal)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-6 break-inside-avoid">
          {["Teslim eden", "Teslim alan"].map((t) => (
            <div key={t} className="rounded border border-slate-400 p-3">
              <div className="font-semibold">{t}</div>
              <div className="mt-3 text-xs text-slate-600">Ad soyad:</div>
              <div className="mt-3 text-xs text-slate-600">Tarih:</div>
              <div className="mt-3 h-14 text-xs text-slate-600">İmza:</div>
            </div>
          ))}
        </div>

        <p className="mt-8 border-t border-slate-300 pt-2 text-center text-xs text-slate-500">
          Bu belge bilgi amaçlıdır; resmi irsaliye/fatura yerine geçmez.
        </p>
      </main>
    </div>
  );
}
