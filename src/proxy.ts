import { NextRequest, NextResponse } from "next/server";
import { authCookieName, getAuthSecret, getSessionUserFromCookie } from "@/lib/auth";
import { isPublicPath } from "@/lib/public-paths";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname, process.env)) {
    return NextResponse.next();
  }

  const user = await getSessionUserFromCookie(
    request.cookies.get(authCookieName)?.value,
    getAuthSecret()
  );

  if (user) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"]
};
