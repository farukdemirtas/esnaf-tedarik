import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { homePanel, PANEL_PATHS } from "@/lib/permissions";

/** Kök adres: giriş yapmış kullanıcıyı kendi paneline, diğerlerini giriş sayfasına yönlendirir. */
export default async function Home() {
  const auth = await getAuth();
  if (!auth) redirect("/giris");
  const panel = homePanel(auth.permissions);
  redirect(panel ? PANEL_PATHS[panel] : "/yetkisiz");
}
