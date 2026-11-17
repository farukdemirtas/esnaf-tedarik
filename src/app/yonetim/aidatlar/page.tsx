import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { DueRowActions } from "@/components/oda/due-actions";
import { Badge, EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, Section, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { createDuesPeriodAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { currentPeriod, dateInput, DUE_STATUS, fmtDate, fmtMoney } from "@/lib/format";
import { listDues, overdueMembers } from "@/modules/members/dues-admin";

export const metadata: Metadata = { title: "Aidatlar" };

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; durum?: string; geciken?: string; q?: string; sayfa?: string }>;
}) {
  const { auth, base, can } = await requireOdaPage("dues.view");
  const sp = await searchParams;
  const [r, od] = await Promise.all([
    listDues(auth, { period: sp.donem, status: sp.durum, overdue: sp.geciken, q: sp.q, page: sp.sayfa }),
    overdueMembers(auth),
  ]);
  const sum = (s: string) => r.sums.find((x) => x.status === s);

  return (
    <>
      <PageHeader title="Aidatlar" description="Aidat takibi. Tahsilat sistem dışında yapılır; burada yalnızca kayıt tutulur." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Gecikmiş aidatı olan üyeler (${od.rows.length})`}>
          <p className="mb-3 text-xs text-slate-500">
            Vadesi geçmiş {od.threshold} veya daha fazla ödenmemiş aidatı olan üyenin sipariş vermesi engellenir (giriş açık kalır).
          </p>
          {od.rows.length === 0 ? (
            <p className="text-sm text-slate-500">Gecikmiş aidat yok.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
              {od.rows.map((row) => (
                <li key={row.member.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`${base}/uyeler/${row.member.id}`} className="font-medium text-brand-700 hover:underline">
                    {row.member.businessName}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-600">
                      {row.count} dönem · {fmtMoney(row.amount)}
                    </span>
                    {row.blocked && <Badge tone="red">Sipariş kapalı</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {can("dues.manage") && (
          <Section title="Dönem aidatı oluştur">
            <p className="mb-3 text-xs text-slate-500">Tüm aktif üyelere seçilen dönem için aidat kaydı açılır. Bu dönemde kaydı olan üyeler atlanır.</p>
            <ActionForm action={createDuesPeriodAction} className="grid gap-4 sm:grid-cols-3" confirm="Tüm aktif üyelere bu dönem için aidat kaydı açılsın mı?">
              <Field name="period" label="Dönem (YYYY-AA)" required defaultValue={currentPeriod()} pattern="\d{4}-\d{2}" />
              <Field name="amount" label="Tutar (₺)" required inputMode="decimal" />
              <Field name="dueDate" label="Son ödeme tarihi" type="date" required defaultValue={dateInput(new Date())} />
              <div className="sm:col-span-3">
                <SubmitButton>Kayıtları oluştur</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        )}
      </div>

      <FilterBar>
        <FilterInput name="q" label="Üye" defaultValue={sp.q} placeholder="İşletme adı veya sicil no" />
        <FilterInput name="donem" label="Dönem" defaultValue={sp.donem} placeholder="2026-11" />
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(DUE_STATUS)} />
        <FilterSelect name="geciken" label="Gecikme" defaultValue={sp.geciken} options={[{ value: "1", label: "Yalnızca gecikmiş" }]} />
      </FilterBar>

      <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-600">
        {(["UNPAID", "PAID", "WAIVED"] as const).map((s) => (
          <span key={s}>
            {DUE_STATUS[s].label}: <strong>{sum(s)?._count ?? 0}</strong> kayıt · {fmtMoney(sum(s)?._sum.amount ?? 0)}
          </span>
        ))}
      </div>

      {r.items.length === 0 ? (
        <EmptyState title="Aidat kaydı bulunamadı." />
      ) : (
        <Table head={["Üye", "Dönem", "Tutar", "Vade", "Durum", "Ödeme / not", ""]}>
          {r.items.map((d) => (
            <tr key={d.id}>
              <Td>
                <Link href={`${base}/uyeler/${d.member.id}`} className="font-medium text-brand-700 hover:underline">
                  {d.member.businessName}
                </Link>
                <div className="text-xs text-slate-500">{d.member.registryNumber}</div>
              </Td>
              <Td>{d.period}</Td>
              <Td>{fmtMoney(d.amount)}</Td>
              <Td>{fmtDate(d.dueDate)}</Td>
              <Td>
                <StatusBadge map={DUE_STATUS} value={d.status} />
                {d.status === "UNPAID" && d.dueDate < new Date() && <div className="text-xs text-red-700">gecikmiş</div>}
              </Td>
              <Td className="text-xs">{d.paidAt ? fmtDate(d.paidAt) : d.note ?? "—"}</Td>
              <Td>{can("dues.manage") && <DueRowActions due={{ id: d.id, status: d.status }} />}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ donem: sp.donem, durum: sp.durum, geciken: sp.geciken, q: sp.q }} />
    </>
  );
}
