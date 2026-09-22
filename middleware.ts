import { NextResponse, type NextRequest } from "next/server";
import { adminAuthConfigured, isAdminRequest, isCronRequest } from "./app/lib/admin-auth";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  if (isAdminRequest(request) || isCronRequest(request)) return NextResponse.next();

  const apiRequest = request.nextUrl.pathname.startsWith("/api/");
  if (!adminAuthConfigured()) {
    const body = apiRequest
      ? JSON.stringify({ error: "Admin authentication is not configured" })
      : "CortiFree admin authentication is not configured.";
    return new NextResponse(body, {
      status: 503,
      headers: { "Content-Type": apiRequest ? "application/json" : "text/plain; charset=utf-8" },
    });
  }

  const body = apiRequest ? JSON.stringify({ error: "Unauthorized" }) : "Authentication required.";
  return new NextResponse(body, {
    status: 401,
    headers: {
      "Content-Type": apiRequest ? "application/json" : "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Basic realm="CortiFree Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)"],
};
