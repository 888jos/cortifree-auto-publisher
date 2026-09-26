import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const origin = new URL(request.url).origin;

  if (!email || !password) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("Email and password are required.")}`, origin), 303);
  }

  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("Supabase Auth is not configured.")}`, origin), 303);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`, origin), 303);
  }

  return NextResponse.redirect(new URL(next, origin), 303);
}
