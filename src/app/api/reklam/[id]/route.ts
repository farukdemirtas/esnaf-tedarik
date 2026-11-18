import { readCookie, seeOther } from "@/lib/http";
import { buildAuthContext } from "@/modules/auth/context";
import { SESSION_COOKIE } from "@/modules/auth/session";
import { registerAdClick } from "@/modules/revenue/ads";

/** Banner tıklaması: sayılır ve yalnızca platform içi /magaza adresine yönlendirilir. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = readCookie(req, SESSION_COOKIE);
  const auth = token ? await buildAuthContext(token) : null;
  if (!auth?.member) return seeOther("/giris");
  const { id } = await params;
  return seeOther(await registerAdClick(auth, id));
}
