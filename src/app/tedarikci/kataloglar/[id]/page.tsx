import { withBase } from "@/lib/base-path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/brand";
import { ActionForm, SelectField, SubmitButton } from "@/components/form";
import { Badge, DL, PageHeader, Section, StatusBadge, Table, Td } from "@/components/panel/ui";
import { addMyCatalogItemAction, deleteMyCatalogAction, endMyCatalogAction, removeMyCatalogItemAction } from "@/actions/revenue";
import { requireSupplierPage } from "@/lib/auth/supplier-page";
import { NotFoundError } from "@/lib/errors";
import { fmtDate, fmtDateTime, fmtMoney, PACK_TYPE, type Tone } from "@/lib/format";
import { getMyCatalog } from "@/modules/revenue/catalogs";

export const metadata: Metadata = { title: "Katalog" };

const CATALOG_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Onay bekliyor", tone: "amber" },
  APPROVED: { label: "Yayında", tone: "green" },
  REJECTED: { label: "Reddedildi", tone: "red" },
  ENDED: { label: "Sona erdi", tone: "slate" },
};

function packLabel(packType: string, unitsPerPack: number) {
  return `${PACK_TYPE[packType] ?? packType}${unitsPerPack > 1 ? ` × ${unitsPerPack}` : ""}`;
}

export default async function MyCatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth } = await requireSupplierPage("supplierSelf.marketing");
  const { id } = await params;
  const { catalog: c, offers } = await getMyCatalog(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const editable = c.status !== "ENDED";
  const now = new Date();
  const planned = c.status === "APPROVED" && c.startsAt > now;
  const expired = c.status === "APPROVED" && c.endsAt !== null && c.endsAt <= now;

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.category ? `Kategori: ${c.category.name}` : "Dijital katalog"}
        back={{ href: "/tedarikci/kataloglar", label: "Dijital Kataloglar" }}
        actions={<StatusBadge map={CATALOG_STATUS} value={c.status} />}
      />

      {(c.status !== "APPROVED" || planned || expired) && (
        <div className="mb-6">
          {c.status === "PENDING" && <Alert tone="warning">Oda onayı bekleniyor. Bu sürede ürün ekleyip çıkarabilirsiniz.</Alert>}
          {c.status === "REJECTED" && (
            <Alert tone="error">Oda kataloğu reddetti. Nedeni bildirimlerinizde yer alır. Kataloğu silip düzeltilmiş haliyle yeniden oluşturabilirsiniz.</Alert>
          )}
          {c.status === "ENDED" && <Alert tone="info">Katalog sona erdi; üyelere artık gösterilmiyor ve düzenlenemez.</Alert>}
          {planned && <Alert tone="info">Katalog onaylandı; {fmtDate(c.startsAt)} tarihinde üyelere gösterilmeye başlayacak.</Alert>}
          {expired && <Alert tone="warning">Kataloğun bitiş tarihi geçti; üyelere artık gösterilmiyor.</Alert>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title={`Katalogdaki ürünler (${c.items.length})`}>
            {c.items.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz ürün eklenmedi.{editable ? " Aşağıdaki formdan ürünlerinizi ekleyin." : ""}</p>
            ) : (
              <Table head={["Ürün", "Paket", "Paket fiyatı", "Durum", ...(editable ? [""] : [])]}>
                {c.items.map((i) => {
                  const sp = i.supplierProduct;
                  return (
                    <tr key={i.supplierProductId}>
                      <Td className="break-words font-medium">{sp.product.name}</Td>
                      <Td className="whitespace-nowrap">{packLabel(sp.packType, sp.unitsPerPack)}</Td>
                      <Td className="whitespace-nowrap">{fmtMoney(sp.packPrice)}</Td>
                      <Td>
                        {sp.removedByAdmin ? (
                          <Badge tone="red">Oda kaldırdı</Badge>
                        ) : sp.active ? (
                          <Badge tone="green">Satışta</Badge>
                        ) : (
                          <Badge tone="slate">Satışa kapalı</Badge>
                        )}
                      </Td>
                      {editable && (
                        <Td>
                          <ActionForm action={removeMyCatalogItemAction} compact confirm={`"${sp.product.name}" katalogdan çıkarılsın mı?`}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="supplierProductId" value={i.supplierProductId} />
                            <SubmitButton variant="small-danger">Çıkar</SubmitButton>
                          </ActionForm>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </Table>
            )}
            <p className="mt-3 text-xs text-slate-500">Fiyatlar KDV hariç paket fiyatıdır. Üyeler yalnızca satışta ve kendilerine görünür olan ürünleri görür.</p>
          </Section>

          {editable && (
            <Section title="Ürün ekle">
              {offers.length === 0 ? (
                <p className="text-sm text-slate-500">Eklenebilecek başka ürününüz yok.</p>
              ) : (
                <ActionForm action={addMyCatalogItemAction} resetOnSuccess className="space-y-4">
                  <input type="hidden" name="id" value={c.id} />
                  <SelectField
                    name="supplierProductId"
                    label="Ürün"
                    required
                    placeholder="Ürün seçin"
                    options={offers.map((o) => ({
                      value: o.id,
                      label: `${o.product.name} — ${packLabel(o.packType, o.unitsPerPack)} — ${fmtMoney(o.packPrice)}${o.active ? "" : " (satışa kapalı)"}`,
                    }))}
                  />
                  <SubmitButton>Ekle</SubmitButton>
                </ActionForm>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Kapak ve dosya">
            {c.coverPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={withBase(`/api/files/${c.coverPath}`)}
                alt={`${c.title} kapak görseli`}
                className="mx-auto max-h-80 w-auto rounded-lg border border-slate-200 bg-white object-contain"
              />
            ) : (
              <p className="text-sm text-slate-500">Kapak görseli yok.</p>
            )}
            {c.filePath ? (
              <a
                href={withBase(`/api/files/${c.filePath}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-4 w-full justify-center"
              >
                PDF kataloğu aç<span className="sr-only"> (yeni sekmede açılır)</span>
              </a>
            ) : (
              <p className="mt-4 text-sm text-slate-500">PDF dosyası yok.</p>
            )}
          </Section>

          <Section title="Bilgiler">
            <DL
              items={[
                ["Başlangıç", fmtDate(c.startsAt)],
                ["Bitiş", c.endsAt ? fmtDate(c.endsAt) : "Süresiz"],
                ["Kategori", c.category?.name ?? "Genel"],
                ["Oluşturulma", fmtDateTime(c.createdAt)],
              ]}
            />
          </Section>

          <Section title="İşlemler">
            {c.status === "APPROVED" ? (
              <ActionForm action={endMyCatalogAction} className="space-y-3" confirm="Katalog yayından kaldırılsın mı? Bu işlem geri alınamaz.">
                <input type="hidden" name="id" value={c.id} />
                <p className="text-sm text-slate-600">Kataloğu sonlandırdığınızda üyelere artık gösterilmez.</p>
                <SubmitButton variant="danger">Yayından kaldır</SubmitButton>
              </ActionForm>
            ) : (
              <ActionForm action={deleteMyCatalogAction} className="space-y-3" confirm="Katalog silinsin mi? Bu işlem geri alınamaz.">
                <input type="hidden" name="id" value={c.id} />
                <p className="text-sm text-slate-600">
                  {c.status === "PENDING" ? "Onay bekleyen kataloğu silerek talebinizi geri çekebilirsiniz." : "Kataloğu kalıcı olarak silebilirsiniz."}
                </p>
                <SubmitButton variant="danger">Kataloğu sil</SubmitButton>
              </ActionForm>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
