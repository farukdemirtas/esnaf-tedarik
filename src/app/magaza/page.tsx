import type { Metadata } from "next";
import { Alert } from "@/components/brand";
import { EmptyState, PageHeader, StatCard } from "@/components/panel/ui";
import { requirePanel } from "@/lib/auth/server";
import { chamberIdOf, memberScope } from "@/lib/auth/scope";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Mağaza" };

export default async function MemberHome({ searchParams }: { searchParams: Promise<{ sifre?: string }> }) {
  const auth = await requirePanel("member");
  const scope = memberScope(auth); // yalnızca kendi işletmesinin verisi
  const chamberId = chamberIdOf(auth);
  const sp = await searchParams;
  const now = new Date();

  const [openOrders, totalOrders, announcements] = await Promise.all([
    db.supplierOrder.count({ where: { order: scope, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED"] } } }),
    db.order.count({ where: scope }),
    db.announcement.findMany({
      where: {
        chamberId,
        audience: { in: ["ALL", "MEMBERS"] },
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
    }),
  ]);
  const dues = auth.member!.dues;

  return (
    <>
      <PageHeader title={`Hoş geldiniz, ${auth.member!.name}`} />
      <div className="mb-6 space-y-3">
        {sp.sifre && <Alert tone="success">Şifreniz değiştirildi.</Alert>}
        {dues.orderingBlocked ? (
          <Alert tone="warning">
            Vadesi geçmiş {dues.overdueCount} aidat kaydınız bulunduğu için sipariş verme geçici olarak kapalıdır. Lütfen Oda ile
            iletişime geçin.
          </Alert>
        ) : (
          dues.overdueCount > 0 && <Alert tone="info">Vadesi geçmiş {dues.overdueCount} aidat kaydınız bulunuyor.</Alert>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Devam eden siparişlerim" value={openOrders} />
        <StatCard label="Toplam siparişim" value={totalOrders} />
      </div>
      <h2 className="mt-8 mb-3 text-lg font-semibold text-slate-900">Duyurular</h2>
      {announcements.length === 0 ? (
        <EmptyState title="Şu an yayında duyuru yok." />
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{a.title}</h3>
                <time className="shrink-0 text-xs text-slate-500">{a.publishedAt.toLocaleDateString("tr-TR")}</time>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
