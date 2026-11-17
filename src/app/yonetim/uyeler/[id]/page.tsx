import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from "@/components/form";
import { MemberFields } from "@/components/oda/member-fields";
import { DueRowActions } from "@/components/oda/due-actions";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import {
  addAddressAction, addDueAction, approveMemberAction, deleteAddressAction, memberResetLinkAction, rejectMemberAction,
  resetMemberPasswordAction, setDefaultAddressAction, setMemberActiveAction, updateMemberAction,
} from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { NotFoundError } from "@/lib/errors";
import { currentPeriod, dateInput, DUE_STATUS, fmtDate, fmtDateTime, fmtMoney, MEMBER_STATUS, USER_STATUS } from "@/lib/format";
import { getMember, listDistricts } from "@/modules/members/service";

export const metadata: Metadata = { title: "Üye" };

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base, can } = await requireOdaPage("member.view");
  const { id } = await params;
  const data = await getMember(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { member: m, dues, taxIdMasked } = data;
  const districts = can("member.update") ? await listDistricts(m.chamberId) : [];
  const overdue = dues?.filter((d) => d.status === "UNPAID" && d.dueDate < new Date()).length ?? 0;

  return (
    <>
      <PageHeader
        title={m.businessName}
        description={`${m.ownerName} · Sicil no ${m.registryNumber}`}
        back={{ href: `${base}/uyeler`, label: "Üyeler" }}
        actions={<StatusBadge map={MEMBER_STATUS} value={m.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Başvuru kararı */}
          {(m.status === "PENDING" || m.status === "REJECTED") && can("member.approve") && (
            <Section title="Başvuru kararı">
              {m.statusNote && <p className="mb-4 text-sm text-slate-600">Önceki not: {m.statusNote}</p>}
              <div className="grid gap-6 md:grid-cols-2">
                <ActionForm action={approveMemberAction} className="space-y-3">
                  <input type="hidden" name="id" value={m.id} />
                  <Field name="username" label="Kullanıcı adı (isteğe bağlı)" hint="Boş bırakılırsa sicil numarası kullanılır." maxLength={50} />
                  <SubmitButton>Onayla ve hesap oluştur</SubmitButton>
                </ActionForm>
                {m.status === "PENDING" && (
                  <ActionForm action={rejectMemberAction} className="space-y-3" confirm="Başvuru reddedilsin mi?">
                    <input type="hidden" name="id" value={m.id} />
                    <Field name="note" label="Ret gerekçesi" required maxLength={500} />
                    <SubmitButton variant="danger">Reddet</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Section>
          )}

          <Section title="İşletme bilgileri">
            {can("member.update") ? (
              <ActionForm action={updateMemberAction} className="space-y-5">
                <input type="hidden" name="id" value={m.id} />
                <MemberFields m={m} taxIdHint={taxIdMasked ? `Kayıtlı: ${taxIdMasked}. Değiştirmek için yeni değeri girin.` : "Şifreli olarak saklanır."} />
                <SubmitButton>Kaydet</SubmitButton>
              </ActionForm>
            ) : (
              <DL
                items={[
                  ["İşletme türü", m.businessType],
                  ["Telefon", m.phone],
                  ["E-posta", m.email],
                  ["Vergi dairesi", m.taxOffice],
                  ["Vergi / TC no", taxIdMasked],
                  ["Kayıt tarihi", fmtDate(m.createdAt)],
                ]}
              />
            )}
          </Section>

          <Section title="Teslimat adresleri">
            {m.addresses.length === 0 ? (
              <p className="text-sm text-slate-500">Adres eklenmemiş. Sipariş verebilmesi için en az bir adres gerekir.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {m.addresses.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="text-sm">
                      <div className="font-semibold">
                        {a.title} {a.isDefault && <Badge tone="blue">Varsayılan</Badge>}
                      </div>
                      <div className="text-slate-600">
                        {a.line}
                        {a.neighborhood ? `, ${a.neighborhood}` : ""} — {a.district.name}/{a.district.city}
                      </div>
                    </div>
                    {can("member.update") && (
                      <div className="flex gap-2">
                        {!a.isDefault && (
                          <ActionForm action={setDefaultAddressAction} compact>
                            <input type="hidden" name="id" value={a.id} />
                            <SubmitButton variant="small">Varsayılan yap</SubmitButton>
                          </ActionForm>
                        )}
                        <ActionForm action={deleteAddressAction} compact confirm="Adres silinsin mi?">
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton variant="small-danger">Sil</SubmitButton>
                        </ActionForm>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {can("member.update") && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Adres ekle</summary>
                <ActionForm action={addAddressAction} resetOnSuccess className="mt-3 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={m.id} />
                  <Field name="title" label="Adres başlığı" required placeholder="Dükkan" maxLength={60} />
                  <SelectField name="districtId" label="İlçe" required placeholder="Seçin" options={districts.map((d) => ({ value: d.id, label: d.name }))} />
                  <Field name="neighborhood" label="Mahalle" maxLength={80} />
                  <Field name="line" label="Açık adres" required maxLength={300} />
                  <div className="sm:col-span-2">
                    <CheckboxField name="isDefault" label="Varsayılan teslimat adresi olsun" />
                  </div>
                  <div>
                    <SubmitButton>Adresi ekle</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            )}
          </Section>

          {dues && (
            <Section title={`Aidat kayıtları${overdue ? ` — ${overdue} gecikmiş` : ""}`}>
              {dues.length === 0 ? (
                <p className="text-sm text-slate-500">Aidat kaydı yok.</p>
              ) : (
                <Table head={["Dönem", "Tutar", "Vade", "Durum", "Ödeme", ""]}>
                  {dues.map((d) => (
                    <tr key={d.id}>
                      <Td>{d.period}</Td>
                      <Td>{fmtMoney(d.amount)}</Td>
                      <Td>{fmtDate(d.dueDate)}</Td>
                      <Td>
                        <StatusBadge map={DUE_STATUS} value={d.status} />
                        {d.status === "UNPAID" && d.dueDate < new Date() && <span className="ml-1 text-xs text-red-700">gecikmiş</span>}
                      </Td>
                      <Td className="text-xs">{d.paidAt ? fmtDate(d.paidAt) : d.note ?? "—"}</Td>
                      <Td>{can("dues.manage") && <DueRowActions due={{ id: d.id, status: d.status }} />}</Td>
                    </tr>
                  ))}
                </Table>
              )}
              {can("dues.manage") && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-600">+ Aidat kaydı ekle</summary>
                  <ActionForm action={addDueAction} resetOnSuccess className="mt-3 grid gap-4 sm:grid-cols-4">
                    <input type="hidden" name="id" value={m.id} />
                    <Field name="period" label="Dönem (YYYY-AA)" required defaultValue={currentPeriod()} pattern="\d{4}-\d{2}" />
                    <Field name="amount" label="Tutar (₺)" required inputMode="decimal" />
                    <Field name="dueDate" label="Son ödeme" type="date" required defaultValue={dateInput(new Date())} />
                    <div className="flex items-end">
                      <SubmitButton>Ekle</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-6">
          {can("member.setStatus") && (m.status === "ACTIVE" || m.status === "PASSIVE") && (
            <Section title="Üyelik durumu">
              <ActionForm action={setMemberActiveAction} className="space-y-3" confirm={m.status === "ACTIVE" ? "Üye pasife alınsın mı? Sisteme giriş yapamayacak." : undefined}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="active" value={m.status === "ACTIVE" ? "0" : "1"} />
                <Field name="note" label="Not" maxLength={500} defaultValue={m.statusNote ?? ""} />
                <SubmitButton variant={m.status === "ACTIVE" ? "danger" : "primary"}>{m.status === "ACTIVE" ? "Pasife al" : "Aktifleştir"}</SubmitButton>
              </ActionForm>
            </Section>
          )}

          <Section title="Kullanıcı hesapları">
            {m.users.length === 0 ? (
              <p className="text-sm text-slate-500">Hesap yok. Başvuru onaylandığında oluşturulur.</p>
            ) : (
              <ul className="space-y-4">
                {m.users.map(({ user: u }) => (
                  <li key={u.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono font-semibold">{u.username}</code>
                      <StatusBadge map={USER_STATUS} value={u.lockedUntil && u.lockedUntil > new Date() ? "LOCKED" : u.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Son giriş: {fmtDateTime(u.lastLoginAt)} {u.mustChangePassword && "· İlk giriş bekleniyor"}
                    </div>
                    {can("member.resetPassword") && (
                      <div className="mt-3 space-y-2">
                        <ActionForm action={resetMemberPasswordAction} compact confirm="Yeni geçici şifre oluşturulsun mu? Mevcut şifre geçersiz olur.">
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton variant="small">Geçici şifre ver</SubmitButton>
                        </ActionForm>
                        <ActionForm action={memberResetLinkAction} compact>
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton variant="small">Şifre yenileme bağlantısı</SubmitButton>
                        </ActionForm>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Özet">
            <DL items={[["Sipariş sayısı", m._count.orders], ["Kayıt", fmtDate(m.createdAt)], ["Son güncelleme", fmtDateTime(m.updatedAt)]]} />
          </Section>
        </div>
      </div>
    </>
  );
}
