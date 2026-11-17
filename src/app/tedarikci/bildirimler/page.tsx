import type { Metadata } from "next";
import { NotificationsList } from "@/components/notifications-list";
import { PageHeader } from "@/components/panel/ui";
import { requireSupplierPage } from "@/lib/auth/supplier-page";

export const metadata: Metadata = { title: "Bildirimler" };

export default async function SupplierNotificationsPage({ searchParams }: { searchParams: Promise<{ sayfa?: string; okunmamis?: string }> }) {
  const { auth } = await requireSupplierPage();
  const sp = await searchParams;

  return (
    <>
      <PageHeader title="Bildirimler" description="Siparişler, ürünleriniz ve kampanyalarınızla ilgili size gelen bildirimler." />
      <NotificationsList auth={auth} page={sp.sayfa} unreadOnly={sp.okunmamis === "1"} />
    </>
  );
}
