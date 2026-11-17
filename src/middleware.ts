import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/yonetim", "/personel", "/tedarikci", "/magaza", "/sifre-degistir", "/yazdir"];
const SESSION_COOKIE = "et_session";

/**
 * İlk savunma hattı: oturum çerezi yoksa giriş sayfasına yönlendirir.
 * Gerçek yetki kontrolü her sayfada ve her işlemde sunucu tarafında yapılır.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/giris";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
