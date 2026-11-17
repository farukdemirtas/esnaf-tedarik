import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { SupplierFields } from "@/components/oda/supplier-fields";
import { DL, PageHeader, Section, StatusBadge } from "@/components/panel/ui";
import {
  addSupplierUserAction, approveSupplierAction, rejectSupplierAction, resetSupplierUserPasswordAction,
  setSupplierSuspendedAction, setSupplierUserActiveAction, updateSupplierAction,
} from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { NotFoundError } from "@/lib/errors";
import { fmtDate, fmtDateTime, fmtMoney, SUPPLIER_STATUS, USER_STATUS } from "@/lib/format";
import { getSupplier } from "@/modules/suppliers/service";

export const metadata: Metadata = { title: "Tedarikçi" };

const DAYS = ["", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base, can } = await requireOdaPage("supplier.view");
  const { id } = await params;
  const s = await getSupplier(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  return (
    <>
      <PageHeader
        title={s.tradeName}
        description={s.legalName}
        back={{ href: `${base}/tedarikciler`, label: "Tedarikçiler" }}
        actions={<StatusBadge map={SUPPLIER_STATUS} value={s.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {(s.status === "PENDING" || s.status === "REJECTED") && can("supplier.approve") && (
            <Section title="Başvuru kararı">
              {s.statusNote && <p className="mb-4 text-sm text-slate-600">Önceki not: {s.statusNote}</p>}
              <div className="grid gap-6 md:grid-cols-2">
                <ActionForm action={approveSupplierAction} className="space-y-3">
                  <input type="hidden" name="id" value={s.id} />
                  <Field name="username" label="Kullanıcı adı (isteğe bağlı)" hint="Boş bırakılırsa firma e-postası kullanılır." maxLength={50} />
                  <SubmitButton>Onayla ve hesap oluştur</SubmitButton>
                </ActionForm>
                {s.status === "PENDING" && (
                  <ActionForm action={rejectSupplierAction} className="space-y-3" confirm="Başvuru reddedilsin mi?">
                    <input type="hidden" name="id" value={s.id} />
                    <Field name="note" label="Ret gerekçesi" required maxLength={500} />
                    <SubmitButton variant="danger">Reddet</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Section>
          )}

          <Section title="Firma bilgileri">
            {can("supplier.update") ? (
              <ActionForm action={updateSupplierAction} className="space-y-5">
                <input type="hidden" name="id" value={s.id} />
                <SupplierFields s={s} />
                <SubmitButton>Kaydet</SubmitButton>
              </ActionForm>
            ) : (
              <DL
                items={[
                  ["Vergi dairesi / no", `${s.taxOffice} / ${s.taxNumber}`],
                  ["MERSİS", s.mersisNumber],
                  ["Telefon", s.phone],
                  ["E-posta", s.email],
                  ["Yetkili", `${s.contactName}${s.contactPhone ? ` (${s.contactPhone})` : ""}`],
                  ["Min. sipariş", fmtMoney(s.minOrderAmount)],
                  ["Adres", s.address],
                  ["Tanıtım", s.description],
                ]}
              />
            )}
          </Section>

          <Section title="Hizmet bölgeleri ve teslimat günleri">
            {s.deliveryAreas.length === 0 ? (
              <p className="text-sm text-slate-500">Firma henüz hizmet bölgesi tanımlamamış (tedarikçi panelinden girilir).</p>
            ) : (
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {s.deliveryAreas.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <span className="font-medium">{a.district.name}</span>
                    <span className="ml-2 text-slate-600">{a.deliveryDays.map((d) => DAYS[d]).join(", ") || "Gün belirtilmemiş"}</span>
                    {a.minOrderAmount && <span className="ml-2 text-xs text-slate-500">min. {fmtMoney(a.minOrderAmount)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          {can("supplier.setStatus") && (s.status === "APPROVED" || s.status === "SUSPENDED") && (
            <Section title="Firma durumu">
              <ActionForm
                action={setSupplierSuspendedAction}
                className="space-y-3"
                confirm={s.status === "APPROVED" ? "Firma askıya alınsın mı? Ürünleri yayından çıkar ve kullanıcıları giriş yapamaz." : undefined}
              >
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="suspended" value={s.status === "APPROVED" ? "1" : "0"} />
                <Field name="note" label={s.status === "APPROVED" ? "Askıya alma gerekçesi" : "Not"} required={s.status === "APPROVED"} maxLength={500} />
                <SubmitButton variant={s.status === "APPROVED" ? "danger" : "primary"}>{s.status === "APPROVED" ? "Askıya al" : "Yeniden aktifleştir"}</SubmitButton>
              </ActionForm>
              {s.statusNote && <p className="mt-3 text-xs text-slate-500">Mevcut not: {s.statusNote}</p>}
            </Section>
          )}

          <Section title="Panel kullanıcıları">
            {s.users.length === 0 ? (
              <p className="text-sm text-slate-500">Kullanıcı yok. Başvuru onaylandığında oluşturulur.</p>
            ) : (
              <ul className="space-y-3">
                {s.users.map(({ user: u }) => (
                  <li key={u.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{u.fullName}</div>
                        <code className="text-xs">{u.username}</code>
                      </div>
                      <StatusBadge map={USER_STATUS} value={u.lockedUntil && u.lockedUntil > new Date() ? "LOCKED" : u.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {u.roles.map((r) => r.role.name).join(", ")} · Son giriş: {fmtDateTime(u.lastLoginAt)}
                    </div>
                    {can("supplier.update") && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ActionForm action={resetSupplierUserPasswordAction} compact confirm="Yeni geçici şifre oluşturulsun mu?">
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton variant="small">Geçici şifre ver</SubmitButton>
                        </ActionForm>
                        <ActionForm action={setSupplierUserActiveAction} compact>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="active" value={u.status === "ACTIVE" ? "0" : "1"} />
                          <SubmitButton variant={u.status === "ACTIVE" ? "small-danger" : "small"}>{u.status === "ACTIVE" ? "Pasife al" : "Aktifleştir"}</SubmitButton>
                        </ActionForm>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {can("supplier.update") && s.status === "APPROVED" && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Kullanıcı ekle</summary>
                <ActionForm action={addSupplierUserAction} resetOnSuccess className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={s.id} />
                  <Field name="fullName" label="Ad soyad" required maxLength={100} />
                  <Field name="username" label="Kullanıcı adı" required maxLength={50} autoComplete="off" />
                  <Field name="email" label="E-posta" type="email" />
                  <SelectField
                    name="role"
                    label="Rol"
                    options={[
                      { value: "SUPPLIER_STAFF", label: "Çalışan (sipariş hazırlar, fiyat değiştiremez)" },
                      { value: "SUPPLIER_OWNER", label: "Yetkili (tam yetki)" },
                    ]}
                  />
                  <SubmitButton>Ekle</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Section>

          <Section title="Özet">
            <DL
              items={[
                ["Ürün (teklif)", s._count.products],
                ["Sipariş", s._count.supplierOrders],
                ["Kampanya", s._count.campaigns],
                ["Başvuru / kayıt", fmtDate(s.createdAt)],
                ["Onay tarihi", fmtDate(s.approvedAt)],
              ]}
            />
          </Section>
        </div>
      </div>
    </>
  );
}
