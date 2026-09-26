import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (url && anonKey) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    });
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
