import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { CRON_PATHS, SESSION_HEADER, isCronRequest, isEmailAllowed } from "./app/lib/admin-auth";

const publicPaths = new Set([
  "/login",
  "/auth/callback",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  // These server-to-server routes perform their own secret verification.
  "/api/admin/recover-modelark-orphans",
  "/api/admin/integrations-status",
  "/api/telegram/webhook",
  "/api/integrations/telegram/webhook",
  "/api/telegram/setup",
]);

async function hasSupabaseSession(request: NextRequest, response: NextResponse) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { configured: false, authenticated: false, allowed: false };
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return { configured: true, authenticated: Boolean(user), allowed: Boolean(user) && isEmailAllowed(user?.email) };
}


export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Never trust an inbound copy of the internal session marker.
  const headers = new Headers(request.headers);
  headers.delete(SESSION_HEADER);
  if (pathname === "/api/health") {
    const probe = NextResponse.next();
    const session = await hasSupabaseSession(request, probe).catch(() => ({ allowed: false }));
    if (session.allowed) headers.set(SESSION_HEADER, "allowed");
    return NextResponse.next({ request: { headers } });
  }
  if (publicPaths.has(pathname)) return NextResponse.next({ request: { headers } });

  if (CRON_PATHS.has(pathname) && isCronRequest(request)) return NextResponse.next({ request: { headers } });

  const response = NextResponse.next({ request: { headers } });
  const session = await hasSupabaseSession(request, response);
  if (!session.configured) {
    const apiRequest = pathname.startsWith("/api/");
    return new NextResponse(apiRequest ? JSON.stringify({ error: "Supabase Auth is not configured" }) : "Supabase Auth is not configured.", {
      status: 503,
      headers: { "Content-Type": apiRequest ? "application/json" : "text/plain; charset=utf-8" },
    });
  }
  if (session.allowed && pathname === "/" && !request.nextUrl.searchParams.has("studio")) {
    // Daily work starts from the review queue; the Studio stays at /?studio=1.
    const review = request.nextUrl.clone();
    review.pathname = "/review";
    review.search = "";
    const redirect = NextResponse.redirect(review);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  if (session.allowed) {
    // Tell route handlers this is an allowlisted operator session; keep any
    // refreshed Supabase auth cookies set on the first response.
    headers.set(SESSION_HEADER, "allowed");
    const allowed = NextResponse.next({ request: { headers } });
    response.cookies.getAll().forEach((cookie) => allowed.cookies.set(cookie));
    return allowed;
  }
  if (session.authenticated) {
    // Signed in, but not on CORTIFREE_ALLOWED_EMAILS.
    return new NextResponse(JSON.stringify({ error: "Forbidden", code: "EMAIL_NOT_ALLOWED" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized", code: "SUPABASE_AUTH_REQUIRED" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)"],
};
