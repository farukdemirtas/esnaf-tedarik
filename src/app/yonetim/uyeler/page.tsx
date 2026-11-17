import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, FilterBar, FilterInput, FilterSelect, LinkButton, PageHeader, Pagination, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { MEMBER_STATUS } from "@/lib/format";
import { listMembers } from "@/modules/members/service";

export const metadata: Metadata = { title: "Üyeler" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; durum?: string; sayfa?: string }> }) {
  const { auth, base, can } = await requireOdaPage("member.view");
  const sp = await searchParams;
  const r = await listMembers(auth, { q: sp.q, status: sp.durum, page: sp.sayfa });

  return (
    <>
      <PageHeader
        title="Üyeler"
        description="Bakkal, market ve diğer üye işletmeler."
        actions={can("member.create") && <LinkButton href={`${base}/uyeler/yeni`}>+ Yeni üye</LinkButton>}
      />
      <FilterBar>
        <FilterInput name="q" label="Ara" defaultValue={sp.q} placeholder="İşletme, yetkili, sicil no, telefon" />
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(MEMBER_STATUS)} />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Kayıt bulunamadı.">{sp.q || sp.durum ? "Filtreleri değiştirmeyi deneyin." : "Henüz üye eklenmemiş."}</EmptyState>
      ) : (
        <Table head={["İşletme", "Sicil no", "Telefon", "Kullanıcı", "Aidat", "Durum"]}>
          {r.items.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`${base}/uyeler/${m.id}`} className="font-semibold text-brand-700 hover:underline">
                  {m.businessName}
                </Link>
                <div className="text-xs text-slate-500">{m.ownerName}</div>
              </Td>
              <Td>{m.registryNumber}</Td>
              <Td>{m.phone}</Td>
              <Td className="text-xs">{m.users.map((u) => u.user.username).join(", ") || <span className="text-slate-400">Yok</span>}</Td>
              <Td>{m.dues.length > 0 ? <Badge tone="amber">{m.dues.length} gecikmiş</Badge> : <span className="text-slate-400">—</span>}</Td>
              <Td>
                <StatusBadge map={MEMBER_STATUS} value={m.status} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ q: sp.q, durum: sp.durum }} />
    </>
  );
}
