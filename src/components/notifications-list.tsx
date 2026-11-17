import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { EmptyState, Pagination } from "@/components/panel/ui";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/supplier";
import { fmtDateTime } from "@/lib/format";
import type { AuthContext } from "@/modules/auth/context";
import { listMyNotifications, unreadCount } from "@/modules/notifications/inbox";

/**
 * Oturumdaki kullanıcının bildirim listesi (tüm paneller ortak kullanabilir).
 * Filtre ve sayfa bağlantıları göreli (?okunmamis=1&sayfa=2) olduğundan bulunulan sayfada çalışır.
 */
export async function NotificationsList({ auth, page, unreadOnly = false }: { auth: AuthContext; page?: string; unreadOnly?: boolean }) {
  const [r, unread] = await Promise.all([
    listMyNotifications(auth, { page, unread: unreadOnly ? "1" : undefined }),
    unreadCount(auth.userId),
  ]);

  const tab = (active: boolean) =>
    `inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium ${
      active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Bildirim filtresi" className="flex flex-wrap gap-2">
          <Link href="?sayfa=1" className={tab(!unreadOnly)} aria-current={!unreadOnly ? "page" : undefined}>
            Tümü
          </Link>
          <Link href="?okunmamis=1" className={tab(unreadOnly)} aria-current={unreadOnly ? "page" : undefined}>
            Okunmamış{unread > 0 ? ` (${unread})` : ""}
          </Link>
        </nav>
        {unread > 0 && (
          <ActionForm action={markAllNotificationsReadAction} compact className="text-right">
            <SubmitButton variant="secondary">Tümünü okundu işaretle</SubmitButton>
          </ActionForm>
        )}
      </div>

      {r.items.length === 0 ? (
        <EmptyState title={unreadOnly ? "Okunmamış bildiriminiz yok." : "Henüz bildiriminiz yok."}>
          {unreadOnly ? "Tüm bildirimleri görmek için “Tümü”ne dokunun." : "Siparişler ve onaylarla ilgili gelişmeler burada görünür."}
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {r.items.map((n) => {
            const isUnread = !n.readAt;
            return (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${isUnread ? "bg-brand-50/60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isUnread && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />}
                    <span className={isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}>{n.title}</span>
                    {isUnread && <span className="sr-only">(okunmadı)</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{n.message}</p>
                  <div className="mt-1 text-xs text-slate-500">{fmtDateTime(n.createdAt)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Yalnızca site içi bağlantılar */}
                  {n.link?.startsWith("/") && !n.link.startsWith("//") && (
                    <Link
                      href={n.link}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-slate-50"
                    >
                      Görüntüle
                    </Link>
                  )}
                  {isUnread && (
                    <ActionForm action={markNotificationReadAction} compact>
                      <input type="hidden" name="id" value={n.id} />
                      <SubmitButton variant="small">Okundu</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={r.page} size={r.size} total={r.total} params={{ okunmamis: unreadOnly ? "1" : undefined }} />
    </>
  );
}
