import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { EmptyState, FilterBar, FilterSelect, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/panel/ui";
import { reviewCatalogAction } from "@/actions/revenue";
import { requireOdaPage } from "@/lib/auth/oda";
import { fmtDate, fmtDateTime, type Tone } from "@/lib/format";
import { listCatalogsForReview } from "@/modules/revenue/catalogs";

export const metadata: Metadata = { title: "Dijital Kataloglar" };

const CATALOG_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  APPROVED: { label: "Yayında", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  ENDED: { label: "Sona erdi", tone: "slate" },
};

export default async function CatalogsReviewPage({ searchParams }: { searchParams: Promise<{ durum?: string; sayfa?: string }> }) {
  const { auth, base, can } = await requireOdaPage("catalog.review");
  const sp = await searchParams;
  const r = await listCatalogsForReview(auth, { status: sp.durum, page: sp.sayfa });
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Dijital Kataloglar"
        description="Tedarikçilerin hazırladığı aylık broşür ve kataloglar. Onaylanan kataloglar başlangıç tarihinden itibaren üyelere gösterilir."
      />
      <FilterBar>
        <FilterSelect
          name="durum"
          label="Durum"
          defaultValue={sp.durum}
          options={Object.entries(CATALOG_STATUS).map(([value, v]) => ({ value, label: v.label }))}
        />
      </FilterBar>
      {r.items.length === 0 ? (
        <EmptyState title="Katalog bulunamadı.">
          {sp.durum ? "Filtreyi değiştirmeyi deneyin." : "Tedarikçiler kataloglarını kendi panellerinden yükleyip onaya gönderir."}
        </EmptyState>
      ) : (
        <Table head={["Kapak", "Katalog", "Kategori", "Tarihler", "Ürün", "Dosya", "Durum", "İşlem"]}>
          {r.items.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td className="w-20">
                {c.coverPath ? (
                  <a href={withBase(`/api/files/${c.coverPath}`)} target="_blank" rel="noopener noreferrer" aria-label={`${c.title} kapağını aç`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={withBase(`/api/files/${c.coverPath}`)} alt="" className="h-20 w-16 rounded border border-slate-200 object-cover" />
                  </a>
                ) : (
                  <div className="flex h-20 w-16 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">Kapak yok</div>
                )}
              </Td>
              <Td>
                <div className="font-semibold text-slate-900">{c.title}</div>
                <div className="text-sm">
                  {can("supplier.view") ? (
                    <Link href={`${base}/tedarikciler/${c.supplierId}`} className="text-brand-700 hover:underline">
                      {c.supplier.tradeName}
                    </Link>
                  ) : (
                    c.supplier.tradeName
                  )}
                </div>
                <div className="text-xs text-slate-500">Gönderim: {fmtDateTime(c.createdAt)}</div>
              </Td>
              <Td>{c.category?.name ?? "—"}</Td>
              <Td className="whitespace-nowrap">
                {fmtDate(c.startsAt)} – {c.endsAt ? fmtDate(c.endsAt) : "süresiz"}
                {c.status === "APPROVED" && c.endsAt && c.endsAt <= now && <div className="text-xs text-amber-700">süresi doldu</div>}
                {c.status === "APPROVED" && c.startsAt > now && <div className="text-xs text-slate-500">başlamadı</div>}
              </Td>
              <Td className="tabular-nums">{c._count.items}</Td>
              <Td>
                {c.filePath ? (
                  <a href={withBase(`/api/files/${c.filePath}`)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-600 hover:underline">
                    PDF&apos;i aç
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </Td>
              <Td>
                <StatusBadge map={CATALOG_STATUS} value={c.status} />
              </Td>
              <Td>
                {c.status === "PENDING" && (
                  <div className="w-52 space-y-2">
                    <ActionForm action={reviewCatalogAction} compact>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <SubmitButton variant="small">Onayla</SubmitButton>
                    </ActionForm>
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-red-700">Reddet</summary>
                      <ActionForm action={reviewCatalogAction} compact className="mt-2 space-y-2" confirm="Katalog reddedilsin mi?">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <Field name="note" label="Ret gerekçesi" required minLength={3} maxLength={300} />
                        <SubmitButton variant="small-danger">Reddet</SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                )}
                {c.status === "APPROVED" && (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-red-700">Yayından kaldır</summary>
                    <ActionForm action={reviewCatalogAction} compact className="mt-2 w-52 space-y-2" confirm="Katalog yayından kaldırılsın mı?">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="decision" value="end" />
                      <Field name="note" label="Not (isteğe bağlı)" maxLength={300} />
                      <SubmitButton variant="small-danger">Yayından kaldır</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ durum: sp.durum }} />
    </>
  );
}
