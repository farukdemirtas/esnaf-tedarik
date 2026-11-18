import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/brand";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { addMyAddressAction, deleteMyAddressAction, setMyDefaultAddressAction, updateMyAddressAction, updateMyContactAction } from "@/actions/member";
import { requireMemberPage } from "@/lib/auth/member-page";
import { DUE_STATUS, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { getMyAccount } from "@/modules/members/self";

export const metadata: Metadata = { title: "Hesabım" };

/** "YYYY-MM" → "Kasım 2026" */
function periodLabel(p: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Aynı sayfada birden çok adres formu olduğu için etiket–alan bağlantısı adrese özgü kimlikle kurulur */
function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="label">
      {children}
      {required && <span className="text-red-600"> *</span>}
    </label>
  );
}

export default async function MyAccountPage() {
  const { auth } = await requireMemberPage("memberSelf.account");
  const { member: m, dues, districts } = await getMyAccount(auth);
  const districtOptions = districts.map((d) => ({ value: d.id, label: `${d.name} / ${d.city}` }));
  const now = new Date();

  return (
    <>
      <PageHeader title="Hesabım" description="İşletme bilgileriniz, teslimat adresleriniz ve aidat durumunuz." />

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="İşletme bilgileri">
            <DL
              items={[
                ["İşletme adı", m.businessName],
                ["İşletme sahibi / yetkili", m.ownerName],
                ["Oda sicil numarası", m.registryNumber],
                ["İşletme türü", m.businessType || "—"],
                ["Vergi dairesi", m.taxOffice || "—"],
              ]}
            />
            <p className="mt-4 text-sm text-slate-500">Bu bilgileri değiştirmek için Oda ile iletişime geçin.</p>
          </Section>

          <Section title="İletişim bilgileri">
            <ActionForm action={updateMyContactAction} className="space-y-4">
              <Field name="phone" label="Telefon" required type="tel" inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" defaultValue={m.phone} />
              <Field name="email" label="E-posta" type="email" autoComplete="email" defaultValue={m.email ?? ""} hint="İsteğe bağlı. Bildirimler için kullanılabilir." />
              <SubmitButton>Kaydet</SubmitButton>
            </ActionForm>
          </Section>
        </div>

        <Section title="Teslimat adresleri">
          <div className="mb-4">
            <Alert tone="info">Ürünler ve tedarikçiler varsayılan teslimat adresinizin ilçesine göre listelenir.</Alert>
          </div>
          {m.addresses.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz teslimat adresi eklenmemiş. Sipariş verebilmek için en az bir adres gerekir.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {m.addresses.map((a) => {
                const fid = (n: string) => `adr-${a.id}-${n}`;
                return (
                  <li key={a.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                          {a.title} {a.isDefault && <Badge tone="blue">Varsayılan</Badge>}
                        </div>
                        <div className="mt-0.5 break-words text-slate-600">
                          {a.line}
                          {a.neighborhood ? `, ${a.neighborhood}` : ""}
                        </div>
                        <div className="text-slate-600">
                          {a.district.name} / {a.district.city}
                          {!a.district.active && <span className="ml-2 text-xs text-amber-700">(bu ilçe artık hizmet dışı)</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!a.isDefault && (
                          <ActionForm action={setMyDefaultAddressAction} compact>
                            <input type="hidden" name="id" value={a.id} />
                            <SubmitButton variant="small">Varsayılan yap</SubmitButton>
                          </ActionForm>
                        )}
                        <ActionForm action={deleteMyAddressAction} compact confirm={`"${a.title}" adresi silinsin mi?`}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="small-danger">Sil</SubmitButton>
                        </ActionForm>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium text-brand-700 hover:underline">Düzenle</summary>
                      <ActionForm action={updateMyAddressAction} className="mt-3 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <div>
                          <FieldLabel htmlFor={fid("title")} required>
                            Adres başlığı
                          </FieldLabel>
                          <Field id={fid("title")} name="title" required defaultValue={a.title} maxLength={60} />
                        </div>
                        <div>
                          <FieldLabel htmlFor={fid("districtId")} required>
                            İlçe
                          </FieldLabel>
                          <SelectField
                            id={fid("districtId")}
                            name="districtId"
                            required
                            placeholder="Seçin"
                            defaultValue={a.district.active ? a.districtId : ""}
                            options={districtOptions}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={fid("neighborhood")}>Mahalle</FieldLabel>
                          <Field id={fid("neighborhood")} name="neighborhood" defaultValue={a.neighborhood ?? ""} maxLength={80} />
                        </div>
                        <div>
                          <FieldLabel htmlFor={fid("line")} required>
                            Açık adres
                          </FieldLabel>
                          <Field id={fid("line")} name="line" required defaultValue={a.line} maxLength={300} />
                        </div>
                        {!a.isDefault && (
                          <div className="sm:col-span-2">
                            <CheckboxField name="isDefault" label="Varsayılan teslimat adresi olsun" />
                          </div>
                        )}
                        <div>
                          <SubmitButton>Adresi kaydet</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}

          {m.addresses.length < 10 ? (
            <details className="mt-4 border-t border-slate-100 pt-4" open={m.addresses.length === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Yeni adres ekle</summary>
              <ActionForm action={addMyAddressAction} resetOnSuccess className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field name="title" label="Adres başlığı" required placeholder="Dükkan" maxLength={60} />
                <SelectField name="districtId" label="İlçe" required placeholder="Seçin" options={districtOptions} />
                <Field name="neighborhood" label="Mahalle" maxLength={80} />
                <Field name="line" label="Açık adres" required maxLength={300} placeholder="Cadde, sokak, bina no" />
                <div className="sm:col-span-2">
                  <CheckboxField name="isDefault" label="Varsayılan teslimat adresi olsun" hint="İlk eklediğiniz adres otomatik olarak varsayılan olur." />
                </div>
                <div>
                  <SubmitButton>Adresi ekle</SubmitButton>
                </div>
              </ActionForm>
            </details>
          ) : (
            <p className="mt-4 text-sm text-slate-500">En fazla 10 adres kaydedebilirsiniz. Yeni adres eklemek için önce birini silin.</p>
          )}
        </Section>

        <Section title="Aidat durumu">
          <div className="mb-4 space-y-3">
            {dues.orderingBlocked ? (
              <Alert tone="warning">
                Vadesi geçmiş {dues.overdueCount} aidat kaydınız bulunduğu için sipariş verme geçici olarak kapalıdır. Lütfen Oda ile iletişime geçin.
              </Alert>
            ) : (
              dues.overdueCount > 0 && (
                <Alert tone="info">
                  Vadesi geçmiş {dues.overdueCount} aidat kaydınız var. Vadesi geçmiş aidat sayısı {dues.threshold} olduğunda sipariş verme geçici olarak
                  kapanır.
                </Alert>
              )
            )}
          </div>
          {m.dues.length === 0 ? (
            <p className="text-sm text-slate-500">Aidat kaydı bulunmuyor.</p>
          ) : (
            <Table head={["Dönem", "Tutar", "Son ödeme", "Durum", "Ödeme tarihi"]}>
              {m.dues.map((d) => {
                const overdue = d.status === "UNPAID" && d.dueDate < now;
                return (
                  <tr key={d.id}>
                    <Td className="whitespace-nowrap font-medium">{periodLabel(d.period)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{fmtMoney(d.amount)}</Td>
                    <Td className="whitespace-nowrap">
                      {fmtDate(d.dueDate)}
                      {overdue && <span className="ml-2 text-xs font-medium text-red-700">Vadesi geçti</span>}
                    </Td>
                    <Td>
                      <StatusBadge map={DUE_STATUS} value={d.status} />
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(d.paidAt)}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
          <p className="mt-3 text-xs text-slate-500">Son 24 dönem gösterilir. Aidat ödemeleri Oda tarafından kaydedilir.</p>
        </Section>

        <Section title="Kullanıcı bilgileri" actions={<Link href="/sifre-degistir" className="btn-secondary px-3 py-1.5 text-sm">Şifre değiştir</Link>}>
          {m.users.length === 0 ? (
            <p className="text-sm text-slate-500">Kullanıcı bulunamadı.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {m.users.map(({ user: u }) => (
                <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div>
                    <div className="font-medium text-slate-900">
                      {u.fullName} {u.id === auth.userId && <Badge tone="blue">Siz</Badge>}
                    </div>
                    <div className="font-mono text-xs text-slate-600">{u.username}</div>
                  </div>
                  <div className="text-xs text-slate-500">Son giriş: {fmtDateTime(u.lastLoginAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
