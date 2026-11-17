import type { Metadata } from "next";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { Badge, PageHeader, Section, StatusBadge } from "@/components/panel/ui";
import { addMyUserAction, resetMyUserPasswordAction, setMyUserActiveAction } from "@/actions/supplier";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { fmtDateTime, USER_STATUS } from "@/lib/format";
import { listMyUsers } from "@/modules/suppliers/self";

export const metadata: Metadata = { title: "Kullanıcılar" };

export default async function SupplierUsersPage() {
  const { auth } = await requireSupplierPage("supplierSelf.users");
  const users = await listMyUsers(auth);
  const now = new Date();

  return (
    <>
      <PageHeader title="Kullanıcılar" description="Firmanız adına panele giriş yapabilen çalışanlar." />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ul className="grid gap-4 md:grid-cols-2">
            {users.map((u) => {
              const isMe = u.id === auth.userId;
              const status = u.lockedUntil && u.lockedUntil > now ? "LOCKED" : u.status;
              return (
                <li key={u.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {u.fullName} {isMe && <Badge tone="blue">Siz</Badge>}
                      </div>
                      <code className="text-sm text-slate-600">{u.username}</code>
                    </div>
                    <StatusBadge map={USER_STATUS} value={status} />
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-slate-600">
                    <div>
                      <dt className="inline text-slate-500">Rol: </dt>
                      <dd className="inline">{u.roles.map((r) => r.role.name).join(", ") || "—"}</dd>
                    </div>
                    {(u.email || u.phone) && (
                      <div>
                        <dt className="inline text-slate-500">İletişim: </dt>
                        <dd className="inline break-all">{[u.email, u.phone].filter(Boolean).join(" · ")}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline text-slate-500">Son giriş: </dt>
                      <dd className="inline">
                        {fmtDateTime(u.lastLoginAt)}
                        {u.mustChangePassword && " · İlk giriş bekleniyor"}
                      </dd>
                    </div>
                  </dl>
                  {!isMe && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <ActionForm
                        action={resetMyUserPasswordAction}
                        compact
                        confirm={`${u.fullName} için yeni geçici şifre oluşturulsun mu? Mevcut şifresi geçersiz olur.`}
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <SubmitButton variant="small">Yeni geçici şifre</SubmitButton>
                      </ActionForm>
                      {/* Kilitli hesapta "aktifleştir" kilidi de açar */}
                      <ActionForm
                        action={setMyUserActiveAction}
                        compact
                        confirm={status === "ACTIVE" ? `${u.fullName} pasife alınsın mı? Panele giriş yapamayacak.` : undefined}
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={status === "ACTIVE" ? "0" : "1"} />
                        <SubmitButton variant={status === "ACTIVE" ? "small-danger" : "small"}>
                          {status === "ACTIVE" ? "Pasife al" : status === "LOCKED" ? "Kilidi aç" : "Aktifleştir"}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <Section title="Yeni kullanıcı ekle">
            <ActionForm action={addMyUserAction} resetOnSuccess className="space-y-4">
              <Field name="fullName" label="Ad soyad" required maxLength={100} />
              <Field
                name="username"
                label="Kullanıcı adı"
                required
                minLength={3}
                maxLength={50}
                autoComplete="off"
                placeholder="ornek.kullanici"
                hint="Giriş için kullanılır. Harf, rakam, nokta, tire ve alt çizgi kullanabilirsiniz."
              />
              <Field name="email" label="E-posta (isteğe bağlı)" type="email" />
              <Field name="phone" label="Telefon (isteğe bağlı)" type="tel" placeholder="05321234567" />
              <SelectField
                name="role"
                label="Yetki"
                required
                options={[
                  { value: "SUPPLIER_STAFF", label: "Çalışan — siparişleri hazırlar, fiyat değiştiremez" },
                  { value: "SUPPLIER_OWNER", label: "Yetkili — tüm işlemler" },
                ]}
              />
              <p className="text-xs text-slate-500">
                Kaydettikten sonra geçici şifre bir kez gösterilir. Kişiye iletin; ilk girişte kendi şifresini belirler.
              </p>
              <SubmitButton>Kullanıcıyı ekle</SubmitButton>
            </ActionForm>
          </Section>
        </div>
      </div>
    </>
  );
}
