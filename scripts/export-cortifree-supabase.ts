import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const TABLES = [
  "personas", "accounts", "assets", "content_formats", "carousel_ideas", "carousels", "carousel_slides",
  "image_generation_jobs", "render_jobs", "publish_jobs", "platform_posts", "analytics_snapshots",
  "template_performance", "topic_performance", "persona_performance", "system_logs", "ai_usage_logs",
  "asset_usage_history", "visual_references", "persona_scene_templates", "image_generation_usage",
] as const;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const output = path.resolve(".data/convex-migration");
if (!url || !key) throw new Error("Supabase export credentials are required");

function queryFor(table: string) {
  const params = new URLSearchParams({ workspace_id: "eq.cortifree", select: "*" });
  if (["accounts", "carousels", "publish_jobs", "platform_posts"].includes(table)) {
    params.set(table === "accounts" ? "id" : "account_id", "like.CF_*");
  }
  if (table === "assets") params.set("storage_bucket", "eq.cortifree-assets");
  return params;
}

async function availableTables() {
  const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key!, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" } });
  if (!response.ok) throw new Error(`Cannot inspect Supabase: ${response.status}`);
  const spec = await response.json() as { definitions?: Record<string, unknown> };
  return new Set(Object.keys(spec.definitions ?? {}));
}

async function readRows(table: string) {
  const all: Record<string, unknown>[] = [];
  for (let start = 0; ; start += 1000) {
    const response = await fetch(`${url}/rest/v1/${table}?${queryFor(table)}`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}`, Range: `${start}-${start + 999}` },
    });
    if (!response.ok) {
      const body = await response.text();
      if (/column .*account_id.* does not exist/i.test(body)) {
        const params = queryFor(table); params.delete("account_id");
        const retry = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
        if (!retry.ok) throw new Error(`${table}: ${await retry.text()}`);
        return await retry.json() as Record<string, unknown>[];
      }
      throw new Error(`${table}: ${body}`);
    }
    const page = await response.json() as Record<string, unknown>[];
    all.push(...page);
    if (page.length < 1000) return all;
  }
}

function assertCortiFree(table: string, row: Record<string, unknown>) {
  if (row.workspace_id !== "cortifree") throw new Error(`${table}: rejected non-CortiFree workspace`);
  if (table === "accounts" && !String(row.id).startsWith("CF_")) throw new Error(`${table}: rejected non-CF account`);
  if (["carousels", "publish_jobs", "platform_posts"].includes(table) && row.account_id && !String(row.account_id).startsWith("CF_")) throw new Error(`${table}: rejected non-CF account relation`);
  if (table === "assets" && row.storage_bucket !== "cortifree-assets") throw new Error(`${table}: rejected non-CortiFree bucket`);
}

function legacyId(table: string, row: Record<string, unknown>) {
  if (row.id !== undefined && row.id !== null) return String(row.id);
  const keys: Record<string, string[]> = {
    content_formats: ["id"], template_performance: ["account_id", "template_id"], topic_performance: ["account_id", "topic"],
    persona_performance: ["account_id", "persona_id"], asset_usage_history: ["carousel_id", "slide_position"],
  };
  const fields = keys[table] ?? Object.keys(row).sort();
  return `${table}:${fields.map((field) => `${field}=${String(row[field] ?? "")}`).join("|")}`;
}

await fs.mkdir(output, { recursive: true });
const available = await availableTables();
const report: Record<string, { rows: number; sha256: string }> = {};
for (const table of TABLES) {
  const rows = available.has(table) ? await readRows(table) : [];
  rows.forEach((row) => assertCortiFree(table, row));
  const documents = rows.map((row) => ({ legacyId: legacyId(table, row), workspaceId: "cortifree", data: row, migratedAt: Date.now() }));
  const serialized = `${documents.map((document) => JSON.stringify(document)).join("\n")}${documents.length ? "\n" : ""}`;
  await fs.writeFile(path.join(output, `${table}.jsonl`), serialized);
  report[table] = { rows: documents.length, sha256: crypto.createHash("sha256").update(serialized).digest("hex") };
}
await fs.writeFile(path.join(output, "manifest.json"), `${JSON.stringify({ workspace: "cortifree", exportedAt: new Date().toISOString(), tables: report }, null, 2)}\n`);
console.log(JSON.stringify({ output, tables: report }, null, 2));
