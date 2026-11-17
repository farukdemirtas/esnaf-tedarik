import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { AnnouncementFields } from "@/components/oda/announcement-fields";
import { Badge, EmptyState, PageHeader, Section } from "@/components/panel/ui";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/actions/oda";
import { requireOdaPage } from "@/lib/auth/oda";
import { AUDIENCE, fmtDateTime } from "@/lib/format";
import { listAnnouncements } from "@/modules/announcements/service";

export const metadata: Metadata = { title: "Duyurular" };

export default async function AnnouncementsPage() {
  const { auth, base } = await requireOdaPage("announcement.manage");
  const items = await listAnnouncements(auth);
  const now = new Date();

  return (
    <>
      <PageHeader title="Duyurular" description="Üyelere, tedarikçilere ve oda personeline panel duyuruları." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {items.length === 0 ? (
            <EmptyState title="Henüz duyuru yok.">Sağdaki formdan ilk duyuruyu ekleyebilirsiniz.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {items.map((a) => {
                const scheduled = a.publishedAt > now;
                const expired = !!a.expiresAt && a.expiresAt <= now;
                return (
                  <li key={a.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`${base}/duyurular/${a.id}`} className="break-words font-semibold text-brand-700 hover:underline">
                          {a.title}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {a.pinned && <Badge tone="blue">Sabit</Badge>}
                          <Badge>{AUDIENCE[a.audience] ?? a.audience}</Badge>
                          {scheduled ? (
                            <Badge tone="amber">Zamanlandı</Badge>
                          ) : expired ? (
                            <Badge tone="slate">Süresi doldu</Badge>
                          ) : (
                            <Badge tone="green">Yayında</Badge>
                          )}
                        </div>
                      </div>
                      <ActionForm action={deleteAnnouncementAction} compact confirm={`"${a.title}" duyurusu silinsin mi?`}>
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton variant="small-danger">Sil</SubmitButton>
                      </ActionForm>
                    </div>
                    <p className="mt-2 line-clamp-2 whitespace-pre-line break-words text-sm text-slate-600">{a.body}</p>
                    <div className="mt-2 text-xs text-slate-500">
                      Yayın: {fmtDateTime(a.publishedAt)} · Bitiş: {a.expiresAt ? fmtDateTime(a.expiresAt) : "Süresiz"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Section title="Yeni duyuru">
          <ActionForm action={createAnnouncementAction} resetOnSuccess className="space-y-4">
            <AnnouncementFields narrow />
            <SubmitButton>Yayınla</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
