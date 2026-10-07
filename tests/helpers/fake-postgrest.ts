// In-memory stand-in for Supabase PostgREST, installed as globalThis.fetch.
// It honours the subset of PostgREST the runtime uses: eq/neq/gt/gte/lt/lte/
// like/ilike/in/is.null/not.is.null/or filters, order, limit/offset (capped at
// max-rows like the real server), return=representation, on_conflict with
// resolution=ignore-duplicates|merge-duplicates, unique indexes and count=exact.
// Non-Supabase URLs go to `external` so tests can fake Upload-Post or a CDN.

export type Row = Record<string, unknown>;
type Handler = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;

export const FAKE_SUPABASE_URL = "https://fake.supabase.test";

export type FakeRequest = { method: string; table: string; url: URL; body: unknown };

function compareValues(left: unknown, right: string) {
  if (typeof left === "number") return left - Number(right);
  if (typeof left === "boolean") return Number(left) - Number(right === "true");
  const a = String(left);
  // Timestamps arrive in several shapes (Z vs +00:00); compare them as instants.
  if (/^\d{4}-\d{2}-\d{2}T/.test(a) && /^\d{4}-\d{2}-\d{2}T/.test(right)) return Date.parse(a) - Date.parse(right);
  return a < right ? -1 : a > right ? 1 : 0;
}

function likeToRegExp(pattern: string, flags = "") {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*");
  return new RegExp(`^${escaped}$`, flags);
}

function unquote(value: string) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

// Splits "a.eq.1,b.in.(x,y)" on top-level commas only.
function splitTopLevel(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function matches(row: Row, field: string, expression: string): boolean {
  if (field === "or" || field === "and") {
    const inner = expression.replace(/^\(/, "").replace(/\)$/, "");
    const conditions = splitTopLevel(inner).map((part) => {
      const [name, ...rest] = part.split(".");
      return matches(row, name!, rest.join("."));
    });
    return field === "or" ? conditions.some(Boolean) : conditions.every(Boolean);
  }
  const value = row[field];
  if (expression.startsWith("not.")) return !matches(row, field, expression.slice(4));
  if (expression === "is.null") return value === null || value === undefined;
  if (expression === "is.true") return value === true;
  if (expression === "is.false") return value === false;
  const dot = expression.indexOf(".");
  const op = expression.slice(0, dot);
  const operand = expression.slice(dot + 1);
  if (op === "in") {
    const list = splitTopLevel(operand.replace(/^\(/, "").replace(/\)$/, "")).map(unquote);
    return value !== null && value !== undefined && list.some((item) => compareValues(value, item) === 0);
  }
  if (value === null || value === undefined) return false;
  switch (op) {
    case "eq": return compareValues(value, operand) === 0;
    case "neq": return compareValues(value, operand) !== 0;
    case "gt": return compareValues(value, operand) > 0;
    case "gte": return compareValues(value, operand) >= 0;
    case "lt": return compareValues(value, operand) < 0;
    case "lte": return compareValues(value, operand) <= 0;
    case "like": return likeToRegExp(operand).test(String(value));
    case "ilike": return likeToRegExp(operand, "i").test(String(value));
    default: throw new Error(`fake-postgrest: unsupported operator ${op} on ${field}`);
  }
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict"]);

export class FakePostgrest {
  readonly tables = new Map<string, Row[]>();
  readonly requests: FakeRequest[] = [];
  readonly external: Handler[] = [];
  maxRows = 1000;
  private nextId = 1;
  private readonly uniques = new Map<string, string[][]>();
  private readonly failures: Array<{ when: (request: FakeRequest) => boolean; status: number }> = [];
  private readonly barriers: Array<{ when: (request: FakeRequest) => boolean; count: number; waiting: Array<() => void> }> = [];
  private originalFetch: typeof fetch | null = null;

  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  // Rows default to the CortiFree workspace, as every scoped query filters on it.
  seed(name: string, rows: Row[]) {
    for (const row of rows) this.table(name).push({ workspace_id: "cortifree", ...row, id: row.id ?? this.nextId++ });
    return this;
  }

  unique(name: string, ...columnSets: string[][]) {
    this.uniques.set(name, columnSets);
    return this;
  }

  failWhen(when: (request: FakeRequest) => boolean, status = 500) {
    this.failures.push({ when, status });
    return this;
  }

  // Holds matching requests until `count` of them have arrived, so concurrent
  // callers are forced past the same point before any of them continues.
  barrier(when: (request: FakeRequest) => boolean, count: number) {
    this.barriers.push({ when, count, waiting: [] });
    return this;
  }

  requestsTo(table: string, method?: string) {
    return this.requests.filter((request) => request.table === table && (!method || request.method === method));
  }

  install() {
    process.env.SUPABASE_URL = FAKE_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== FAKE_SUPABASE_URL) {
        for (const handler of this.external) {
          const response = await handler(url, init);
          if (response) return response;
        }
        throw new Error(`fake-postgrest: unexpected external fetch ${url}`);
      }
      return this.handle(url, init);
    }) as typeof fetch;
    return this;
  }

  restore() {
    if (this.originalFetch) globalThis.fetch = this.originalFetch;
    this.originalFetch = null;
  }

  private async handle(url: URL, init: RequestInit): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const request: FakeRequest = { method, table, url, body };
    this.requests.push(request);
    // Yield like a real network hop so concurrent callers interleave.
    await new Promise((resolve) => setImmediate(resolve));
    for (const barrier of this.barriers) {
      if (!barrier.when(request)) continue;
      await new Promise<void>((resolve) => {
        barrier.waiting.push(resolve);
        if (barrier.waiting.length >= barrier.count) barrier.waiting.splice(0).forEach((release) => release());
      });
    }
    const failure = this.failures.find((item) => item.when(request));
    if (failure) return new Response(JSON.stringify({ message: "injected failure" }), { status: failure.status });

    const headers = new Headers(init.headers);
    const prefer = headers.get("Prefer") ?? "";
    const representation = prefer.includes("return=representation");
    const rows = this.table(table);
    const filters = [...url.searchParams.entries()].filter(([key]) => !RESERVED.has(key));
    const selected = () => rows.filter((row) => filters.every(([field, expression]) => matches(row, field, expression)));

    if (method === "GET") {
      let result = selected();
      const order = url.searchParams.get("order");
      if (order) {
        const [field, direction] = order.split(".");
        result = [...result].sort((a, b) => {
          const left = a[field!];
          const right = b[field!];
          if (left === right) return 0;
          if (left === undefined || left === null) return 1;
          if (right === undefined || right === null) return -1;
          const sign = compareValues(left, String(right)) < 0 ? -1 : 1;
          return direction === "desc" ? -sign : sign;
        });
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(this.maxRows, Number(url.searchParams.get("limit") ?? this.maxRows));
      const page = result.slice(offset, offset + limit);
      const select = url.searchParams.get("select");
      const projected = !select || select === "*" ? page : page.map((row) => Object.fromEntries(select.split(",").map((column) => [column, row[column] ?? null])));
      const responseHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (prefer.includes("count=exact")) responseHeaders["content-range"] = `${offset}-${offset + page.length - 1}/${result.length}`;
      return new Response(JSON.stringify(projected), { status: 200, headers: responseHeaders });
    }

    if (method === "PATCH") {
      const updated = selected();
      for (const row of updated) Object.assign(row, body);
      return representation ? json(updated.map((row) => ({ ...row }))) : new Response(null, { status: 204 });
    }

    if (method === "POST") {
      const incoming = (Array.isArray(body) ? body : [body]) as Row[];
      const conflictFields = url.searchParams.get("on_conflict")?.split(",") ?? [];
      const ignore = prefer.includes("resolution=ignore-duplicates");
      const merge = prefer.includes("resolution=merge-duplicates");
      // Work on a copy: a unique violation rejects the whole statement.
      const next = rows.map((row) => ({ ...row }));
      const written: Row[] = [];
      for (const raw of incoming) {
        const candidate = { ...raw };
        const existing = conflictFields.length
          ? next.find((row) => conflictFields.every((field) => row[field] !== undefined && row[field] === candidate[field]))
          : undefined;
        if (existing) {
          if (ignore) continue;
          if (merge) { Object.assign(existing, candidate); written.push(existing); continue; }
        }
        if (candidate.id === undefined) candidate.id = this.nextId++;
        next.push(candidate);
        written.push(candidate);
      }
      for (const columns of this.uniques.get(table) ?? []) {
        const seen = new Set<string>();
        for (const row of next) {
          if (columns.some((column) => row[column] === null || row[column] === undefined)) continue;
          const key = columns.map((column) => {
            const value = row[column];
            return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value).toISOString() : String(value);
          }).join("|");
          if (seen.has(key)) {
            return new Response(JSON.stringify({ code: "23505", message: `duplicate key value violates unique constraint on ${table}(${columns.join(",")})` }), { status: 409 });
          }
          seen.add(key);
        }
      }
      rows.splice(0, rows.length, ...next);
      return representation ? json(written.map((row) => ({ ...row })), 201) : new Response(null, { status: 201 });
    }

    if (method === "DELETE") {
      const doomed = new Set(selected());
      rows.splice(0, rows.length, ...rows.filter((row) => !doomed.has(row)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`fake-postgrest: unsupported method ${method}`);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
