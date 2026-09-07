const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
export async function supabase(table: string, init: RequestInit = {}) { if (!url || !key) throw new Error("Supabase is not configured"); const headers = new Headers(init.headers); headers.set("apikey", key); headers.set("Authorization", `Bearer ${key}`); headers.set("Content-Type", "application/json"); return fetch(`${url}/rest/v1/${table}`, { ...init, headers, cache: "no-store" }); }
