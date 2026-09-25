import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const publicPaths = new Set([
  "/login",
  "/auth/callback",
  // These server-to-server routes perform their own secret verification.
  "/api/admin/recover-modelark-orphans",
  "/api/telegram/webhook",
  "/api/telegram/setup",
]);

async function hasSupabaseSession(request: NextRequest, response: NextResponse) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { configured: false, authenticated: false };
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
  return { configured: true, authenticated: Boolean(user) };
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (publicPaths.has(pathname)) return NextResponse.next();

  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return NextResponse.next();

  const response = NextResponse.next({ request });
  const session = await hasSupabaseSession(request, response);
  if (!session.configured) {
    const apiRequest = pathname.startsWith("/api/");
    return new NextResponse(apiRequest ? JSON.stringify({ error: "Supabase Auth is not configured" }) : "Supabase Auth is not configured.", {
      status: 503,
      headers: { "Content-Type": apiRequest ? "application/json" : "text/plain; charset=utf-8" },
    });
  }
  if (session.authenticated) return response;

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
