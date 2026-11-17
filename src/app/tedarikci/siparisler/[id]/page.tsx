import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupplierOrderStatus } from "@prisma/client";
import { changeOrderStatusAction, addInvoiceAction, deleteInvoiceAction, updateSupplierNoteAction } from "@/actions/supplier";
import { Alert } from "@/components/brand";
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { NotFoundError } from "@/lib/errors";
import { dateInput, fmtDate, fmtDateTime, fmtMoney, fmtNumber, ORDER_STATUS, PACK_TYPE } from "@/lib/format";
import { getMySupplierOrder, TRANSITIONS } from "@/modules/orders/supplier";

export const metadata: Metadata = { title: "Sipariş" };

const INVOICE_TYPE: Record<string, string> = { INVOICE: "Fatura", WAYBILL: "İrsaliye" };
const INVOICE_ALLOWED: SupplierOrderStatus[] = ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"];

const STEP: Record<string, { label: string; confirm?: string }> = {
  CONFIRMED: { label: "Siparişi onayla" },
  PREPARING: { label: "Hazırlanıyor" },
  SHIPPED: { label: "Dağıtıma çıktı" },
  DELIVERED: { label: "Teslim edildi", confirm: "Sipariş teslim edildi olarak işaretlensin mi? Bu işlemden sonra durum değiştirilemez." },
  REJECTED: { label: "Reddet", confirm: "Sipariş reddedilsin mi? Ürünler stoğunuza geri eklenir ve üyeye bildirilir." },
  CANCELLED: { label: "İptal et", confirm: "Sipariş iptal edilsin mi? Ürünler stoğunuza geri eklenir ve üyeye bildirilir." },
};

/** Sipariş anındaki adres kopyası; eksik/bozuk alanlara karşı korumalı okunur */
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

export default async function SupplierOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, can } = await requireSupplierPage("supplierSelf.orders.view");
  const { id } = await params;
  const so = await getMySupplierOrder(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { order } = so;
  const member = order.member;
  const addr = readAddress(order.addressSnapshot);
  const canProcess = can("supplierSelf.orders.process");
  const next = canProcess ? TRANSITIONS[so.status] : [];
  const forward = next.filter((s) => s !== "REJECTED" && s !== "CANCELLED");
  const stop = next.filter((s) => s === "REJECTED" || s === "CANCELLED");
  const today = dateInput(new Date());

  return (
    <>
      <PageHeader
        title={`Sipariş ${so.subNumber}`}
        description={member.businessName}
        back={{ href: "/tedarikci/siparisler", label: "Siparişler" }}
        actions={
          <>
            <StatusBadge map={ORDER_STATUS} value={so.status} />
            <Link href={`/yazdir/sevk-fisi/${so.id}`} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 py-1.5 text-sm">
              Sevk fişini yazdır
            </Link>
          </>
        }
      />

      {so.status === "PENDING" && canProcess && (
        <div className="mb-6">
          <Alert tone="warning">
            Bu sipariş onayınızı bekliyor. Ürünleri kontrol edin, ardından{" "}
            <a href="#islemler" className="font-semibold underline">
              Sipariş işlemleri
            </a>{" "}
            bölümünden onaylayın veya reddedin.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Üye ve teslimat">
            <DL
              items={[
                ["İşletme", member.businessName],
                ["Yetkili", member.ownerName],
                [
                  "Telefon",
                  member.phone ? (
                    <a href={`tel:${member.phone}`} className="text-brand-700 hover:underline">
                      {member.phone}
                    </a>
                  ) : null,
                ],
                ["Oda sicil no", member.registryNumber],
                [
                  "Teslimat adresi",
                  <div key="adres" className="space-y-0.5">
                    {addr.title && <div className="font-medium">{addr.title}</div>}
                    {(addr.neighborhood || addr.line) && <div>{[addr.neighborhood, addr.line].filter(Boolean).join(", ")}</div>}
                    {(addr.district || addr.city) && <div>{[addr.district, addr.city].filter(Boolean).join(" / ")}</div>}
                    {(addr.contactName || addr.phone) && (
                      <div className="text-sm text-slate-600">
                        Teslim alacak kişi: {addr.contactName ?? "—"}
                        {addr.phone && (
                          <>
                            {" · "}
                            <a href={`tel:${addr.phone}`} className="text-brand-700 hover:underline">
                              {addr.phone}
                            </a>
                          </>
                        )}
                      </div>
                    )}
                    {!addr.title && !addr.line && !addr.district && <span className="text-slate-500">Adres bilgisi yok.</span>}
                  </div>,
                ],
                ["Sipariş tarihi", fmtDateTime(so.createdAt)],
                ["Planlanan teslimat", so.plannedDate ? fmtDate(so.plannedDate) : null],
                ["Üye notu", order.note ? <span className="whitespace-pre-line">{order.note}</span> : null],
                ...(so.rejectReason
                  ? ([["Ret / iptal gerekçesi", <span key="ret" className="whitespace-pre-line text-red-700">{so.rejectReason}</span>]] as [string, React.ReactNode][])
                  : []),
              ]}
            />
          </Section>

          <Section title={`Ürünler (${so.items.length})`}>
            <Table head={["Ürün", "Paket", "Miktar", "Paket fiyatı", "KDV", "Tutar"]}>
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
                  <Td className="font-semibold tabular-nums">{fmtNumber(it.quantity)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {fmtMoney(it.finalPackPrice)}
                    {Number(it.listPackPrice.toString()) !== Number(it.finalPackPrice.toString()) && (
                      <div className="text-xs text-slate-400 line-through">{fmtMoney(it.listPackPrice)}</div>
                    )}
                  </Td>
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
            <p className="mt-3 text-right text-xs text-slate-500">Ödeme platform dışında, üye ile aranızda yapılır.</p>
          </Section>
        </div>

        <div className="space-y-6">
          {next.length > 0 && (
            <Section title="Sipariş işlemleri">
              <div id="islemler" className="scroll-mt-24 space-y-4">
                {forward.map((to) => (
                  <ActionForm key={to} action={changeOrderStatusAction} confirm={STEP[to]?.confirm} compact className="space-y-3">
                    <input type="hidden" name="id" value={so.id} />
                    <input type="hidden" name="to" value={to} />
                    {to === "CONFIRMED" && (
                      <label className="block">
                        <span className="label">Planlanan teslim tarihi</span>
                        <input type="date" name="plannedDate" min={today} defaultValue={dateInput(so.plannedDate)} className="input" />
                        <span className="mt-1 block text-xs text-slate-500">İsteğe bağlı; sonradan da değiştirebilirsiniz.</span>
                      </label>
                    )}
                    <SubmitButton className="w-full">{STEP[to]?.label ?? ORDER_STATUS[to]?.label ?? to}</SubmitButton>
                  </ActionForm>
                ))}

                {stop.map((to) => (
                  <ActionForm
                    key={to}
                    action={changeOrderStatusAction}
                    confirm={STEP[to]?.confirm}
                    compact
                    className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-3"
                  >
                    <input type="hidden" name="id" value={so.id} />
                    <input type="hidden" name="to" value={to} />
                    <TextareaField
                      name="note"
                      label="Gerekçe"
                      required
                      minLength={3}
                      maxLength={500}
                      rows={2}
                      placeholder={to === "REJECTED" ? "Örn. ürün stokta kalmadı" : "Örn. üye iptal istedi"}
                      hint="Üyeye bildirilir. Siparişteki ürünler stoğunuza otomatik olarak geri eklenir."
                    />
                    <SubmitButton variant="danger" className="w-full">
                      {STEP[to]?.label ?? ORDER_STATUS[to]?.label ?? to}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </div>
            </Section>
          )}

          {canProcess && (
            <Section title="Notunuz ve teslim tarihi">
              <ActionForm action={updateSupplierNoteAction} className="space-y-4">
                <input type="hidden" name="id" value={so.id} />
                <TextareaField
                  name="supplierNote"
                  label="Tedarikçi notu"
                  defaultValue={so.supplierNote ?? ""}
                  maxLength={1000}
                  rows={3}
                  hint="Teslimat veya ödeme ile ilgili notunuz."
                />
                <Field name="plannedDate" label="Planlanan teslim tarihi" type="date" defaultValue={dateInput(so.plannedDate)} />
                <SubmitButton variant="secondary">Kaydet</SubmitButton>
              </ActionForm>
            </Section>
          )}
          {!canProcess && so.supplierNote && (
            <Section title="Tedarikçi notu">
              <p className="whitespace-pre-line text-sm text-slate-700">{so.supplierNote}</p>
            </Section>
          )}

          <Section title="Fatura ve irsaliyeler">
            <p className="mb-4 text-xs text-slate-500">Platform fatura düzenlemez; kestiğiniz belgenin bilgisini kaydedersiniz.</p>
            {so.invoices.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz belge kaydı yok.</p>
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
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {inv.filePath ? (
                        <a href={`/api/files/${inv.filePath}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-600 hover:underline">
                          Belgeyi aç
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Dosya eklenmemiş</span>
                      )}
                      {canProcess && (
                        <ActionForm action={deleteInvoiceAction} confirm={`${inv.documentNumber} numaralı belge kaydı silinsin mi?`} compact>
                          <input type="hidden" name="id" value={inv.id} />
                          <SubmitButton variant="small-danger">Sil</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canProcess &&
              (INVOICE_ALLOWED.includes(so.status) ? (
                <div className="mt-5 border-t border-slate-200 pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">Belge ekle</h3>
                  <ActionForm action={addInvoiceAction} resetOnSuccess className="space-y-3">
                    <input type="hidden" name="id" value={so.id} />
                    <SelectField
                      name="type"
                      label="Belge türü"
                      required
                      options={[
                        { value: "INVOICE", label: "Fatura" },
                        { value: "WAYBILL", label: "İrsaliye" },
                      ]}
                    />
                    <Field name="documentNumber" label="Belge no" required maxLength={50} />
                    <Field name="documentDate" label="Belge tarihi" type="date" required max={today} defaultValue={today} />
                    <Field name="amount" label="Tutar (₺)" inputMode="decimal" placeholder="Örn. 1250,50" hint="İsteğe bağlı." />
                    <Field name="file" label="Belge dosyası" type="file" accept="application/pdf,image/jpeg,image/png" hint="İsteğe bağlı. PDF, JPG veya PNG; en fazla 5 MB." />
                    <SubmitButton variant="secondary">Belgeyi kaydet</SubmitButton>
                  </ActionForm>
                </div>
              ) : (
                so.status === "PENDING" && <p className="mt-4 text-xs text-slate-500">Belge, sipariş onaylandıktan sonra eklenebilir.</p>
              ))}
          </Section>

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
                    <div className="mt-1 text-xs text-slate-500">{h.changedBy ? h.changedBy.fullName || h.changedBy.username : "Sistem"}</div>
                    {h.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
