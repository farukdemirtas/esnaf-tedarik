import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { AnnouncementFields } from "@/components/oda/announcement-fields";
import { DL, PageHeader, Section } from "@/components/panel/ui";
import { updateAnnouncementAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { NotFoundError } from "@/lib/errors";
import { AUDIENCE, fmtDateTime } from "@/lib/format";
import { getAnnouncement } from "@/modules/announcements/service";

export const metadata: Metadata = { title: "Duyuru" };

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { auth, base } = await requireOdaPage("announcement.manage");
  const { id } = await params;
  const a = await getAnnouncement(auth, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  return (
    <>
      <PageHeader title={a.title} description="Duyuruyu düzenleyin. Silmek için duyuru listesini kullanın." back={{ href: `${base}/duyurular`, label: "Duyurular" }} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Duyuru bilgileri" className="xl:col-span-2">
          <ActionForm action={updateAnnouncementAction} className="space-y-5">
            <input type="hidden" name="id" value={a.id} />
            <AnnouncementFields a={a} />
            <SubmitButton>Kaydet</SubmitButton>
          </ActionForm>
        </Section>
        <Section title="Özet">
          <DL
            items={[
              ["Hedef kitle", AUDIENCE[a.audience] ?? a.audience],
              ["Oluşturulma", fmtDateTime(a.createdAt)],
              ["Yayın", fmtDateTime(a.publishedAt)],
              ["Bitiş", a.expiresAt ? fmtDateTime(a.expiresAt) : "Süresiz"],
            ]}
          />
        </Section>
      </div>
    </>
  );
}
