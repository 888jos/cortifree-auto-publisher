type Filter = { field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "in" | "not_null" | "is_null" | "raw"; value: unknown };

const SUPABASE_TABLE_ALIASES: Record<string, string> = {
  personas: "content_personas",
  accounts: "content_accounts",
  content_sources: "content_health_sources",
  template_specs: "content_template_specs",
};
const SUPABASE_TABLES_WITHOUT_WORKSPACE_FILTER = new Set([
  "content_personas", "content_accounts", "content_topics", "content_hooks", "content_ctas",
  "content_formats", "content_pillars", "content_claim_rules", "content_health_sources", "content_template_specs", "system_logs",
  "editorial_records", "editorial_golden_examples", "editorial_copy_bank",
]);

export function supabaseTableName(table: string) {
  return SUPABASE_TABLE_ALIASES[table] ?? table;
}

// Supabase is the only runtime. Kept as a function because its value is
// persisted in rows (storage_bucket, "supabase://" paths, health payloads).
export function backendMode(): "supabase" {
  return "supabase";
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured for CortiFree");
  return { url: url.replace(/\/$/, ""), key };
}


export function parseResource(resource: string) {
  const [table, query = ""] = resource.split("?", 2);
  const params = new URLSearchParams(query);
  const filters: Filter[] = [];
  for (const [field, raw] of params.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(field)) continue;
    if (field === "workspace_id") continue;
    // PostgREST logical groups are passed through verbatim (Supabase only).
    if (field === "or" || field === "and") { filters.push({ field, op: "raw", value: raw }); continue; }
    if (raw === "not.is.null") filters.push({ field, op: "not_null", value: true });
    else if (raw === "is.null") filters.push({ field, op: "is_null", value: true });
    else if (raw.startsWith("not.eq.")) filters.push({ field, op: "neq", value: raw.slice(7) });
    else if (raw.startsWith("neq.")) filters.push({ field, op: "neq", value: raw.slice(4) });
    else if (raw.startsWith("eq.")) filters.push({ field, op: "eq", value: raw.slice(3) });
    else if (raw.startsWith("gte.")) filters.push({ field, op: "gte", value: raw.slice(4) });
    else if (raw.startsWith("gt.")) filters.push({ field, op: "gt", value: raw.slice(3) });
    else if (raw.startsWith("lte.")) filters.push({ field, op: "lte", value: raw.slice(4) });
    else if (raw.startsWith("lt.")) filters.push({ field, op: "lt", value: raw.slice(3) });
    else if (raw.startsWith("like.")) filters.push({ field, op: "like", value: raw.slice(5) });
    else if (raw.startsWith("in.(") && raw.endsWith(")")) filters.push({ field, op: "in", value: raw.slice(4, -1).split(",") });
    // Any other PostgREST operator (ilike, is.true, not.in, ...) used to be dropped
    // silently, widening the query; pass it through instead.
    else filters.push({ field, op: "raw", value: raw });
  }
  filters.push({ field: "workspace_id", op: "eq", value: "cortifree" });
  const [orderField, orderDirection] = (params.get("order") ?? "").split(".");
  return {
    table: table as any,
    filters,
    select: params.get("select")?.split(",").filter(Boolean) ?? [],
    orderField: orderField || undefined,
    orderDirection: orderDirection === "desc" ? "desc" as const : "asc" as const,
    limit: Math.min(5000, Math.max(1, Number(params.get("limit") ?? 1000))),
    offset: Math.max(0, Number(params.get("offset") ?? 0)) || 0,
    conflictFields: params.get("on_conflict")?.split(",").filter(Boolean) ?? [],
  };
}


function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": backendMode() } });
}

function supabaseQuery(parsed: ReturnType<typeof parseResource>) {
  const { url, key } = supabase();
  const table = supabaseTableName(parsed.table);
  const query = new URLSearchParams();
  query.set("select", parsed.select.length ? parsed.select.join(",") : "*");
  for (const filter of parsed.filters) {
    if (filter.field === "workspace_id" && SUPABASE_TABLES_WITHOUT_WORKSPACE_FILTER.has(table)) continue;
    if (filter.op === "not_null") query.set(filter.field, "not.is.null");
    else if (filter.op === "is_null") query.set(filter.field, "is.null");
    else if (filter.op === "in") query.set(filter.field, `in.(${(filter.value as string[]).join(",")})`);
    else if (filter.op === "raw") query.set(filter.field, String(filter.value));
    else query.set(filter.field, `${filter.op}.${String(filter.value)}`);
  }
  if (parsed.orderField) query.set("order", `${parsed.orderField}.${parsed.orderDirection}`);
  query.set("limit", String(parsed.limit));
  if (parsed.offset) query.set("offset", String(parsed.offset));
  return { url: `${url}/rest/v1/${table}?${query}`, key };
}

// Small PostgREST-shaped boundary: every query is forced into the CortiFree workspace.
export async function dataBackend(resource: string, init: RequestInit = {}) {
  try {
    const parsed = parseResource(resource);
    const { url, key } = supabaseQuery(parsed);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Accept", "application/json");
    if (method === "POST" || method === "PATCH") headers.set("Content-Type", "application/json");
    if (method === "POST") {
      if (parsed.conflictFields.length) {
        const target = new URL(url);
        target.searchParams.set("on_conflict", parsed.conflictFields.join(","));
        // Respect a caller's resolution (ignore-duplicates is how atomic claims work).
        const prefer = headers.get("Prefer") ?? "";
        const resolution = prefer.match(/resolution=[a-z-]+/)?.[0] ?? "resolution=merge-duplicates";
        headers.set("Prefer", `${resolution},return=representation`);
        const response = await fetch(target, { ...init, method, headers });
        const body = await response.text();
        return new Response(response.status === 204 ? null : body, { status: response.status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": "supabase" } });
      }
      headers.set("Prefer", headers.get("Prefer") ?? "return=minimal");
    }
    const response = await fetch(url, { ...init, method, headers });
    const body = await response.text();
    return new Response(response.status === 204 ? null : body, { status: response.status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": "supabase" } });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export function backendConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}


export async function getBackendPing() {
  const response = await dataBackend("personas?select=*&limit=1");
  if (!response.ok) throw new Error(await response.text());
  return { ok: true, workspace: "cortifree" as const, schemaVersion: 1, checkedAt: Date.now() };
}

export async function getBackendCounts() {
  const tables = ["personas", "accounts", "content_topics", "content_hooks", "content_ctas", "assets", "visual_references"];
  const counts = await Promise.all(tables.map(async (table) => {
    const { url, key } = supabase();
    const actualTable = supabaseTableName(table);
    const workspace = SUPABASE_TABLES_WITHOUT_WORKSPACE_FILTER.has(actualTable) ? "" : "workspace_id=eq.cortifree&";
    const response = await fetch(`${url}/rest/v1/${actualTable}?${workspace}select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
    });
    if (response.status === 404) return [table, 0] as const;
    if (!response.ok) throw new Error(`${table}: ${await response.text()}`);
    const range = response.headers.get("content-range") ?? "*/0";
    return [table, Number(range.split("/")[1] ?? 0)] as const;
  }));
  return Object.fromEntries(counts);
}
