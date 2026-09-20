import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

type Filter = { field: string; op: "eq" | "gte" | "like" | "in" | "not_null"; value: unknown };

let client: ConvexHttpClient | null = null;

export function backendMode(): "convex" | "supabase" {
  return process.env.DATA_BACKEND?.trim().toLowerCase() === "supabase" ? "supabase" : "convex";
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured for CortiFree");
  return { url: url.replace(/\/$/, ""), key };
}

function backend() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.CORTIFREE_BACKEND_SECRET;
  if (!url || !secret) throw new Error("Convex is not configured for CortiFree");
  client ??= new ConvexHttpClient(url);
  return { client, secret };
}

export function parseConvexResource(resource: string) {
  const [table, query = ""] = resource.split("?", 2);
  const params = new URLSearchParams(query);
  const filters: Filter[] = [];
  for (const [field, raw] of params.entries()) {
    if (["select", "order", "limit", "on_conflict"].includes(field)) continue;
    if (field === "workspace_id") continue;
    if (raw === "not.is.null") filters.push({ field, op: "not_null", value: true });
    else if (raw.startsWith("eq.")) filters.push({ field, op: "eq", value: raw.slice(3) });
    else if (raw.startsWith("gte.")) filters.push({ field, op: "gte", value: raw.slice(4) });
    else if (raw.startsWith("like.")) filters.push({ field, op: "like", value: raw.slice(5) });
    else if (raw.startsWith("in.(") && raw.endsWith(")")) filters.push({ field, op: "in", value: raw.slice(4, -1).split(",") });
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
    conflictFields: params.get("on_conflict")?.split(",").filter(Boolean) ?? [],
  };
}

function projected(rows: Record<string, unknown>[], fields: string[]) {
  if (!fields.length || fields.includes("*")) return rows;
  return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": backendMode() } });
}

function supabaseQuery(parsed: ReturnType<typeof parseConvexResource>) {
  const { url, key } = supabase();
  const query = new URLSearchParams();
  query.set("select", parsed.select.length ? parsed.select.join(",") : "*");
  for (const filter of parsed.filters) {
    if (filter.op === "not_null") query.set(filter.field, "not.is.null");
    else if (filter.op === "in") query.set(filter.field, `in.(${(filter.value as string[]).join(",")})`);
    else query.set(filter.field, `${filter.op}.${String(filter.value)}`);
  }
  if (parsed.orderField) query.set("order", `${parsed.orderField}.${parsed.orderDirection}`);
  query.set("limit", String(parsed.limit));
  return { url: `${url}/rest/v1/${parsed.table}?${query}`, key };
}

// Small PostgREST-shaped boundary retained while route handlers are migrated.
// Every read and write is executed by Convex and scoped to CortiFree.
export async function dataBackend(resource: string, init: RequestInit = {}) {
  try {
    if (backendMode() === "supabase") {
      const parsed = parseConvexResource(resource);
      const { url, key } = supabaseQuery(parsed);
      const method = (init.method ?? "GET").toUpperCase();
      const headers = new Headers(init.headers);
      headers.set("apikey", key);
      headers.set("Authorization", `Bearer ${key}`);
      headers.set("Accept", "application/json");
      if (method === "POST") {
        if (parsed.conflictFields.length) {
          const target = new URL(url);
          target.searchParams.set("on_conflict", parsed.conflictFields.join(","));
          headers.set("Prefer", "resolution=merge-duplicates,return=representation");
          const response = await fetch(target, { ...init, method, headers });
          return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": "supabase" } });
        }
        headers.set("Prefer", headers.get("Prefer") ?? "return=minimal");
      }
      const response = await fetch(url, { ...init, method, headers });
      return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": "supabase" } });
    }
    const { client: convex, secret } = backend();
    const parsed = parseConvexResource(resource);
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET") {
      const rows = await convex.query(api.data.list, {
        secret, table: parsed.table, filters: parsed.filters,
        orderField: parsed.orderField, orderDirection: parsed.orderDirection, limit: parsed.limit,
      }) as Record<string, unknown>[];
      return jsonResponse(projected(rows, parsed.select));
    }
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const rows = Array.isArray(body) ? body : [body];
    if (method === "POST") {
      const result = await convex.mutation(api.data.write, {
        secret, table: parsed.table, mode: parsed.conflictFields.length ? "upsert" : "insert",
        rows, filters: parsed.filters, conflictFields: parsed.conflictFields,
      }) as Record<string, unknown>[];
      const prefer = new Headers(init.headers).get("Prefer") ?? "";
      return jsonResponse(prefer.includes("return=representation") ? projected(result, parsed.select) : [], 201);
    }
    if (method === "PATCH") {
      const result = await convex.mutation(api.data.write, {
        secret, table: parsed.table, mode: "patch", rows, filters: parsed.filters, conflictFields: [],
      }) as Record<string, unknown>[];
      return jsonResponse(projected(result, parsed.select));
    }
    return jsonResponse({ error: `Unsupported Convex adapter method ${method}` }, 405);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export function convexConfigured() {
  return backendMode() === "supabase"
    ? Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    : Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && process.env.CORTIFREE_BACKEND_SECRET);
}


export async function getConvexPing() {
  if (backendMode() === "supabase") {
    const response = await dataBackend("personas?workspace_id=eq.cortifree&select=id&limit=1");
    if (!response.ok) throw new Error(await response.text());
    return { ok: true, workspace: "cortifree" as const, schemaVersion: 1, checkedAt: Date.now() };
  }
  const { client: convex, secret } = backend();
  return await convex.query(api.data.ping, { secret }) as {
    ok: boolean;
    workspace: "cortifree";
    schemaVersion: number;
    checkedAt: number;
  };
}

export async function getConvexCounts() {
  if (backendMode() === "supabase") {
    const tables = ["personas", "accounts", "content_topics", "content_hooks", "content_ctas", "assets", "visual_references"];
    const counts = await Promise.all(tables.map(async (table) => {
      const { url, key } = supabase();
      const response = await fetch(`${url}/rest/v1/${table}?workspace_id=eq.cortifree&select=id`, {
        method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
      });
      if (response.status === 404) return [table, 0] as const;
      if (!response.ok) throw new Error(`${table}: ${await response.text()}`);
      const range = response.headers.get("content-range") ?? "*/0";
      return [table, Number(range.split("/")[1] ?? 0)] as const;
    }));
    return Object.fromEntries(counts);
  }
  const { client: convex, secret } = backend();
  return await convex.query(api.data.counts, { secret }) as Record<string, number>;
}
