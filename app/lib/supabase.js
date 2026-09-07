const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.SUPABASE_SCHEMA || "public";

export async function supabase(table, init = {}) {
  if (!url || !key) throw new Error("Supabase is not configured");

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept-Profile", schema);
  headers.set("Content-Profile", schema);

  return fetch(`${url}/rest/v1/${table}`, { ...init, headers, cache: "no-store" });
}
