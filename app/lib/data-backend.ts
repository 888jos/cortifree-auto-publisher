import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

type Filter = { field: string; op: "eq" | "gte" | "like" | "in" | "not_null"; value: unknown };

let client: ConvexHttpClient | null = null;

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
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "X-CortiFree-Backend": "convex" } });
}

// Small PostgREST-shaped boundary retained while route handlers are migrated.
// Every read and write is executed by Convex and scoped to CortiFree.
export async function dataBackend(resource: string, init: RequestInit = {}) {
  try {
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
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && process.env.CORTIFREE_BACKEND_SECRET);
}


export async function getConvexCounts() {
  const { client: convex, secret } = backend();
  return await convex.query(api.data.counts, { secret }) as Record<string, number>;
}
