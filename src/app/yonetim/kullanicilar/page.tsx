import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/form";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, Section, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { createChamberUserAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtDateTime, USER_STATUS } from "@/lib/format";
import { listUsers } from "@/modules/users/service";

export const metadata: Metadata = { title: "Kullanıcılar ve Yetkiler" };

const USER_TYPES = [
  { value: "chamber", label: "Oda" },
  { value: "supplier", label: "Tedarikçi" },
  { value: "member", label: "Üye" },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tur?: string; durum?: string; sayfa?: string }>;
}) {
  const { auth, base, can } = await requireOdaPage("user.manage");
  const sp = await searchParams;
  const r = await listUsers(auth, { q: sp.q, type: sp.tur, status: sp.durum, page: sp.sayfa });
  const now = new Date();

  return (
    <>
      <PageHeader title="Kullanıcılar ve Yetkiler" description="Oda, tedarikçi ve üye hesapları; kişiye özel izinler." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <FilterBar>
            <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="Kullanıcı adı, ad soyad, e-posta" />
            <FilterSelect name="tur" label="Tür" defaultValue={sp.tur} options={USER_TYPES} />
            <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(USER_STATUS)} />
          </FilterBar>
          {r.items.length === 0 ? (
            <EmptyState title="Kayıt bulunamadı.">{sp.q || sp.tur || sp.durum ? "Filtreleri değiştirmeyi deneyin." : "Henüz kullanıcı yok."}</EmptyState>
          ) : (
            <Table head={["Kullanıcı adı", "Ad soyad", "Rol", "Kurum", "Son giriş", "Durum"]}>
              {r.items.map((u) => {
                const supplier = u.supplierUser?.supplier;
                const member = u.memberUser?.member;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`${base}/kullanicilar/${u.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                        {u.username}
                      </Link>
                    </Td>
                    <Td>
                      {u.fullName}
                      {u.id === auth.userId && <div className="text-xs text-slate-500">(siz)</div>}
                    </Td>
                    <Td className="text-xs">{u.roles.map((x) => x.role.name).join(", ") || <span className="text-slate-400">Yok</span>}</Td>
                    <Td>
                      {supplier ? (
                        can("supplier.view") ? (
                          <Link href={`${base}/tedarikciler/${supplier.id}`} className="text-brand-700 hover:underline">
                            {supplier.tradeName}
                          </Link>
                        ) : (
                          supplier.tradeName
                        )
                      ) : member ? (
                        can("member.view") ? (
                          <Link href={`${base}/uyeler/${member.id}`} className="text-brand-700 hover:underline">
                            {member.businessName}
                          </Link>
                        ) : (
                          member.businessName
                        )
                      ) : (
                        <span className="text-slate-500">Oda</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDateTime(u.lastLoginAt)}</Td>
                    <Td>
                      <StatusBadge map={USER_STATUS} value={u.lockedUntil && u.lockedUntil > now ? "LOCKED" : u.status} />
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
          <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q, tur: sp.tur, durum: sp.durum }} />
        </div>

        <div className="space-y-6">
          <Section title="Yeni Oda kullanıcısı">
            <ActionForm action={createChamberUserAction} resetOnSuccess className="space-y-3">
              <Field name="fullName" label="Ad soyad" required maxLength={100} />
              <Field name="username" label="Kullanıcı adı" required minLength={3} maxLength={50} autoComplete="off" />
              <Field name="email" label="E-posta" type="email" />
              <Field name="phone" label="Telefon" type="tel" />
              <SelectField
                name="role"
                label="Rol"
                options={[
                  { value: "CHAMBER_STAFF", label: "Oda personeli (sınırlı yetki)" },
                  { value: "CHAMBER_ADMIN", label: "Oda yöneticisi (tam yetki)" },
                ]}
              />
              <SubmitButton>Oluştur</SubmitButton>
            </ActionForm>
            <p className="mt-4 text-xs text-slate-500">
              Geçici şifre oluşturulur ve yalnızca bir kez gösterilir. Tedarikçi ve üye hesapları kendi kayıt sayfalarından (Tedarikçiler / Üyeler) oluşturulur.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
