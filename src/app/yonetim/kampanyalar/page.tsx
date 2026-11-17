import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, FilterBar, FilterSelect, PageHeader, Pagination, StatusBadge, Table, Td, toOptions } from "@/components/panel/ui";
import { requireOdaPage } from "@/lib/auth/oda";
import { CAMPAIGN_STATUS, CAMPAIGN_TYPE, fmtDate } from "@/lib/format";
import { listCampaigns } from "@/modules/campaigns/review";

export const metadata: Metadata = { title: "Kampanyalar" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ durum?: string; sayfa?: string }> }) {
  const { auth, base } = await requireOdaPage("campaign.review");
  const sp = await searchParams;
  const r = await listCampaigns(auth, { status: sp.durum, page: sp.sayfa });
  const now = new Date();

  return (
    <>
      <PageHeader title="Kampanyalar" description="Tedarikçilerin onaya gönderdiği kampanyalar. Onaylanan kampanyalar belirtilen tarihlerde üyelere gösterilir." />
      <FilterBar>
        <FilterSelect name="durum" label="Durum" defaultValue={sp.durum} options={toOptions(CAMPAIGN_STATUS).filter((o) => o.value !== "DRAFT")} />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Kampanya bulunamadı.">
          {sp.durum ? "Filtreleri değiştirmeyi deneyin." : "Tedarikçiler kampanyalarını kendi panellerinden oluşturup onaya gönderir."}
        </EmptyState>
      ) : (
        <Table head={["Kampanya", "Tedarikçi", "Tür", "Tarihler", "İndirim", "Durum"]}>
          {r.items.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`${base}/kampanyalar/${c.id}`} className="font-semibold text-brand-700 hover:underline">
                  {c.title}
                </Link>
                {c.featured && (
                  <span className="ml-2">
                    <Badge tone="blue">Öne çıkan</Badge>
                  </span>
                )}
              </Td>
              <Td>{c.supplier.tradeName}</Td>
              <Td>{CAMPAIGN_TYPE[c.type] ?? c.type}</Td>
              <Td className="whitespace-nowrap">
                {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}
                {c.status === "APPROVED" && c.endsAt < now && <div className="text-xs text-amber-700">süresi doldu</div>}
              </Td>
              <Td>{c._count.discounts} ürün</Td>
              <Td>
                <StatusBadge map={CAMPAIGN_STATUS} value={c.status} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ durum: sp.durum }} />
    </>
  );
}
