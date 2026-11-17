import { readCookie } from "@/lib/http";
import { readStoredFile, UploadError } from "@/lib/storage";
import { buildAuthContext } from "@/modules/auth/context";
import { SESSION_COOKIE } from "@/modules/auth/session";

/** Yüklenen dosyalar yalnızca giriş yapmış kullanıcılara sunulur. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const token = readCookie(req, SESSION_COOKIE);
  const auth = token ? await buildAuthContext(token) : null;
  if (!auth) return new Response("Yetkisiz", { status: 401 });
  const { key } = await params;
  try {
    const file = await readStoredFile(key.join("/"));
    return new Response(new Uint8Array(file.buf), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    if (e instanceof UploadError) return new Response("Geçersiz istek", { status: 400 });
    return new Response("Bulunamadı", { status: 404 });
  }
}
