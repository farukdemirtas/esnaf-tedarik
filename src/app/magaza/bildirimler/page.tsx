import type { Metadata } from "next";
import { NotificationsList } from "@/components/notifications-list";
import { PageHeader } from "@/components/panel/ui";
import { requireMemberPage } from "@/lib/auth/member-page";

export const metadata: Metadata = { title: "Bildirimler" };

export default async function MemberNotificationsPage({ searchParams }: { searchParams: Promise<{ sayfa?: string; okunmamis?: string }> }) {
  const { auth } = await requireMemberPage();
  const sp = await searchParams;

  return (
    <>
      <PageHeader title="Bildirimler" description="Siparişlerinizin durumu, tedarikçi notları ve Oda duyurularıyla ilgili size gelen bildirimler." />
      <NotificationsList auth={auth} page={sp.sayfa} unreadOnly={sp.okunmamis === "1"} />
    </>
  );
}
