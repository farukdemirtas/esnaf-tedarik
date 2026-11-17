import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import {
  resetUserPasswordAction, setUserActiveAction, setUserPermissionsAction, unlockUserAction, updateUserProfileAction,
} from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { NotFoundError } from "@/lib/errors";
import { fmtDateTime, USER_STATUS } from "@/lib/format";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";
import { getUser, OVERRIDABLE_PERMISSIONS } from "@/modules/users/service";

export const metadata: Metadata = { title: "Kullanıcı" };

const ADMIN_ROLES = ["CHAMBER_ADMIN", "SUPER_ADMIN"];

const CHOICES = [
  { value: "inherit", label: "Rolden gelsin" },
  { value: "grant", label: "Ver" },
  { value: "deny", label: "Kaldır" },
] as const;

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base, can } = await requireOdaPage("user.manage");
  const { id } = await params;
  const { user: u, recentLogins } = await getUser(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  const isSelf = u.id === auth.userId;
  const locked = u.status === "LOCKED" || (!!u.lockedUntil && u.lockedUntil > new Date());
  const isChamberUser = u.roles.some((r) => r.role.scope === "CHAMBER" || r.role.scope === "PLATFORM");
  const targetIsAdmin = u.roles.some((r) => ADMIN_ROLES.includes(r.role.code));
  const iAmAdmin = auth.roles.some((r) => ADMIN_ROLES.includes(r));
  // Kendi hesabı buradan değiştirilemez; yönetici hesaplarına yalnızca yöneticiler dokunabilir
  const canManage = !isSelf && (!targetIsAdmin || iAmAdmin);
  const canEditProfile = isSelf || canManage;

  const rolePerms = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)));
  const overrides = new Map(u.permissions.map((p) => [p.permission.code, p.granted]));
  const groups = new Map<string, PermissionCode[]>();
  for (const code of OVERRIDABLE_PERMISSIONS) {
    const g = PERMISSIONS[code].group;
    groups.set(g, [...(groups.get(g) ?? []), code]);
  }

  const supplier = u.supplierUser?.supplier;
  const member = u.memberUser?.member;

  return (
    <>
      <PageHeader
        title={u.fullName}
        description={u.username}
        back={{ href: `${base}/kullanicilar`, label: "Kullanıcılar" }}
        actions={<StatusBadge map={USER_STATUS} value={locked ? "LOCKED" : u.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Section title="Profil bilgileri">
            {canEditProfile ? (
              <ActionForm action={updateUserProfileAction} className="space-y-4">
                <input type="hidden" name="id" value={u.id} />
                <Field name="fullName" label="Ad soyad" required maxLength={100} defaultValue={u.fullName} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="email" label="E-posta" type="email" defaultValue={u.email ?? ""} />
                  <Field name="phone" label="Telefon" type="tel" defaultValue={u.phone ?? ""} />
                </div>
                <SubmitButton>Kaydet</SubmitButton>
              </ActionForm>
            ) : (
              <DL
                items={[
                  ["Ad soyad", u.fullName],
                  ["E-posta", u.email],
                  ["Telefon", u.phone],
                ]}
              />
            )}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <DL
                items={[
                  ["Kullanıcı adı", <code key="u" className="font-mono">{u.username}</code>],
                  ["Son giriş", fmtDateTime(u.lastLoginAt)],
                  ["Oluşturulma", fmtDateTime(u.createdAt)],
                  ["Şifre", u.mustChangePassword ? "İlk girişte değiştirilecek (geçici şifre)" : `Son değişiklik: ${fmtDateTime(u.passwordChangedAt)}`],
                ]}
              />
            </div>
          </Section>

          {isChamberUser && !isSelf && (
            <Section title="Kişiye özel izinler">
              {!canManage ? (
                <p className="text-sm text-slate-500">Yönetici hesaplarının izinlerini yalnızca yöneticiler değiştirebilir.</p>
              ) : (
                <ActionForm action={setUserPermissionsAction} className="space-y-6">
                  <input type="hidden" name="id" value={u.id} />
                  <p className="text-sm text-slate-600">
                    Her izin için rolün belirlediği değeri kullanabilir, kişiye özel olarak verebilir ya da kaldırabilirsiniz. Sahip olmadığınız bir izni başkasına veremezsiniz.
                  </p>
                  {[...groups.entries()].map(([group, codes]) => (
                    <fieldset key={group}>
                      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</legend>
                      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {codes.map((code) => {
                          const o = overrides.get(code);
                          const current = o === true ? "grant" : o === false ? "deny" : "inherit";
                          const fromRole = rolePerms.has(code);
                          const cannotGrant = !auth.permissions.has(code);
                          return (
                            <div key={code} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="text-sm text-slate-900">{PERMISSIONS[code].description}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                                  <code className="text-slate-500">{code}</code>
                                  {fromRole ? <Badge tone="green">✓ Rolden</Badge> : <span className="text-slate-400">Rolde yok</span>}
                                </div>
                                {cannotGrant && current === "grant" && (
                                  <p className="mt-1 text-xs text-amber-700">Bu izin sizde olmadığı için kayıtta kişiye özel verme kaldırılır.</p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1" role="radiogroup" aria-label={PERMISSIONS[code].description}>
                                {CHOICES.map((c) => {
                                  const disabled = c.value === "grant" && cannotGrant;
                                  return (
                                    <label
                                      key={c.value}
                                      className={`flex items-center gap-1.5 text-sm ${disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`}
                                      title={disabled ? "Sahip olmadığınız bir izni veremezsiniz." : undefined}
                                    >
                                      <input
                                        type="radio"
                                        name={`perm.${code}`}
                                        value={c.value}
                                        defaultChecked={current === c.value}
                                        disabled={disabled}
                                        className="h-4 w-4 accent-brand-600"
                                      />
                                      {c.label}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
                  <div>
                    <SubmitButton>İzinleri kaydet</SubmitButton>
                    <p className="mt-2 text-xs text-slate-500">Kaydettiğinizde kullanıcının açık oturumları kapatılır; yeniden giriş yapması gerekir.</p>
                  </div>
                </ActionForm>
              )}
            </Section>
          )}

          <Section title="Son giriş denemeleri">
            {recentLogins.length === 0 ? (
              <p className="text-sm text-slate-500">Kayıt yok.</p>
            ) : (
              <Table head={["Zaman", "IP", "Sonuç"]}>
                {recentLogins.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
                    <Td className="font-mono text-xs">{l.ip ?? "—"}</Td>
                    <Td>{l.success ? <Badge tone="green">Başarılı</Badge> : <Badge tone="red">Başarısız</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Hesap işlemleri">
            {isSelf ? (
              <p className="text-sm text-slate-600">
                Bu sizin hesabınız. Şifrenizi{" "}
                <a href="/sifre-degistir" className="font-semibold text-brand-600 hover:underline">
                  Şifre değiştir
                </a>{" "}
                sayfasından değiştirebilirsiniz. Kendi hesap durumunuzu ve izinlerinizi buradan değiştiremezsiniz.
              </p>
            ) : !canManage ? (
              <p className="text-sm text-slate-600">Yönetici hesapları yalnızca yöneticiler tarafından değiştirilebilir.</p>
            ) : (
              <div className="space-y-4">
                <ActionForm
                  action={setUserActiveAction}
                  className="space-y-2"
                  confirm={u.status !== "PASSIVE" ? "Hesap pasife alınsın mı? Kullanıcının açık oturumları kapatılır ve giriş yapamaz." : undefined}
                >
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="active" value={u.status !== "PASSIVE" ? "0" : "1"} />
                  <SubmitButton variant={u.status !== "PASSIVE" ? "danger" : "primary"} className="w-full">
                    {u.status !== "PASSIVE" ? "Pasife al" : "Aktifleştir"}
                  </SubmitButton>
                </ActionForm>
                {locked && (
                  <ActionForm action={unlockUserAction} className="space-y-2">
                    <input type="hidden" name="id" value={u.id} />
                    <p className="text-xs text-slate-500">
                      Hesap hatalı giriş denemeleri nedeniyle kilitli{u.lockedUntil ? ` (${fmtDateTime(u.lockedUntil)} tarihine kadar)` : ""}.
                    </p>
                    <SubmitButton variant="secondary" className="w-full">
                      Kilidi aç
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={resetUserPasswordAction} className="space-y-2" confirm="Yeni geçici şifre oluşturulsun mu? Mevcut şifre geçersiz olur.">
                  <input type="hidden" name="id" value={u.id} />
                  <SubmitButton variant="secondary" className="w-full">
                    Yeni geçici şifre ver
                  </SubmitButton>
                </ActionForm>
              </div>
            )}
          </Section>

          <Section title="Roller ve kurum">
            {u.roles.length === 0 ? (
              <p className="text-sm text-slate-500">Rol atanmamış.</p>
            ) : (
              <ul className="space-y-2">
                {u.roles.map(({ role }) => (
                  <li key={role.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="font-medium text-slate-900">{role.name}</div>
                    {role.description && <div className="text-xs text-slate-500">{role.description}</div>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-sm">
              {supplier ? (
                <>
                  <span className="text-slate-500">Tedarikçi: </span>
                  {can("supplier.view") ? (
                    <Link href={`${base}/tedarikciler/${supplier.id}`} className="font-semibold text-brand-600 hover:underline">
                      {supplier.tradeName}
                    </Link>
                  ) : (
                    supplier.tradeName
                  )}
                </>
              ) : member ? (
                <>
                  <span className="text-slate-500">Üye işletme: </span>
                  {can("member.view") ? (
                    <Link href={`${base}/uyeler/${member.id}`} className="font-semibold text-brand-600 hover:underline">
                      {member.businessName}
                    </Link>
                  ) : (
                    member.businessName
                  )}
                </>
              ) : (
                <span className="text-slate-500">Oda kullanıcısı</span>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
