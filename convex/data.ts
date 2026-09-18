import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";

export const tableNames = [
  "personas", "accounts", "assets", "content_formats",
  "content_config", "content_pillars", "content_topics", "content_hooks", "content_ctas",
  "content_claim_rules", "content_health_sources", "content_template_specs", "content_sync_runs",
  "content_generation_qa", "content_asset_usage", "carousel_ideas", "carousels", "carousel_slides",
  "image_generation_jobs", "render_jobs", "publish_jobs", "platform_posts", "analytics_snapshots", "content_performance",
  "template_performance", "topic_performance", "persona_performance", "system_logs", "ai_usage_logs",
  "asset_usage_history", "visual_references", "persona_scene_templates", "image_generation_usage",
] as const;

const tableName = v.union(...tableNames.map((name) => v.literal(name)));
const filterValidator = v.object({
  field: v.string(),
  op: v.union(v.literal("eq"), v.literal("gte"), v.literal("like"), v.literal("in"), v.literal("not_null")),
  value: v.any(),
});
type TableName = (typeof tableNames)[number];
type Filter = { field: string; op: "eq" | "gte" | "like" | "in" | "not_null"; value: unknown };
type StoredDoc = { _id: unknown; legacyId: string; data: Record<string, unknown>; storageId?: unknown; storageField?: string };

function assertSecret(secret: string) {
  const expected = process.env.CORTIFREE_BACKEND_SECRET;
  if (!expected || secret !== expected) throw new Error("Unauthorized CortiFree backend request");
}

function matches(data: Record<string, unknown>, filters: Filter[]) {
  return filters.every((filter) => {
    const actual = data[filter.field];
    if (filter.op === "eq") return String(actual) === String(filter.value);
    if (filter.op === "gte") return String(actual ?? "") >= String(filter.value ?? "");
    if (filter.op === "in") return Array.isArray(filter.value) && filter.value.map(String).includes(String(actual));
    if (filter.op === "not_null") return actual !== null && actual !== undefined;
    if (filter.op === "like") {
      const expression = String(filter.value)
        .split(/[*%]/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${expression}$`).test(String(actual ?? ""));
    }
    return false;
  });
}

function legacyId(table: TableName, row: Record<string, unknown>, conflictFields: string[]) {
  if (row.id !== undefined && row.id !== null) return String(row.id);
  const preferredKeys = ["persona_id", "account_id", "format_id", "pillar_id", "topic_id", "hook_id", "cta_id", "rule_id", "source_id", "template_id", "key"];
  for (const key of preferredKeys) if (row[key] !== undefined && row[key] !== null) return `${table}:${key}=${String(row[key])}`;
  const fields = conflictFields.length ? conflictFields : Object.keys(row).sort();
  return `${table}:${fields.map((field) => `${field}=${String(row[field] ?? "")}`).join("|")}`;
}

async function tableDocs(ctx: { db: any }, table: TableName): Promise<StoredDoc[]> {
  return await ctx.db.query(table as keyof DataModel).collect() as StoredDoc[];
}

export const list = query({
  args: {
    secret: v.string(), table: tableName, filters: v.array(filterValidator),
    orderField: v.optional(v.string()), orderDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    let docs = (await tableDocs(ctx, args.table)).filter((doc) => matches(doc.data, args.filters));
    if (args.orderField) {
      const field = args.orderField;
      const direction = args.orderDirection === "desc" ? -1 : 1;
      docs = docs.sort((a, b) => String(a.data[field] ?? "").localeCompare(String(b.data[field] ?? "")) * direction);
    }
    docs = docs.slice(0, Math.min(args.limit ?? 1000, 5000));
    return await Promise.all(docs.map(async (doc) => {
      if (!doc.storageId || !doc.storageField) return doc.data;
      const url = await ctx.storage.getUrl(doc.storageId as any);
      return url ? { ...doc.data, [doc.storageField]: url, convex_storage_id: String(doc.storageId) } : doc.data;
    }));
  },
});

export const write = mutation({
  args: {
    secret: v.string(), table: tableName, mode: v.union(v.literal("insert"), v.literal("upsert"), v.literal("patch")),
    rows: v.array(v.any()), filters: v.array(filterValidator), conflictFields: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await tableDocs(ctx, args.table);
    if (args.mode === "patch") {
      const patch = (args.rows[0] ?? {}) as Record<string, unknown>;
      const updated: Record<string, unknown>[] = [];
      for (const doc of existing.filter((item) => matches(item.data, args.filters))) {
        const data = { ...doc.data, ...patch, workspace_id: "cortifree" };
        await ctx.db.patch(doc._id as any, { data });
        updated.push(data);
      }
      return updated;
    }
    const output: Record<string, unknown>[] = [];
    for (const raw of args.rows) {
      const row: Record<string, unknown> = { ...(raw as Record<string, unknown>), workspace_id: "cortifree" };
      const id = legacyId(args.table, row, args.conflictFields);
      const found = existing.find((doc) => doc.legacyId === id || (args.conflictFields.length > 0 && args.conflictFields.every((field) => String(doc.data[field]) === String(row[field]))));
      if (found && args.mode === "upsert") {
        const data = { ...found.data, ...row };
        await ctx.db.patch(found._id as any, { data, migratedAt: Date.now() });
        output.push(data);
      } else if (!found) {
        await ctx.db.insert(args.table as keyof DataModel, { legacyId: id, workspaceId: "cortifree", data: row, migratedAt: Date.now() } as any);
        output.push(row);
      } else {
        throw new Error(`Duplicate ${args.table} document ${id}`);
      }
    }
    return output;
  },
});

export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => { assertSecret(args.secret); return await ctx.storage.generateUploadUrl(); },
});

export const storageUrl = query({
  args: { secret: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => { assertSecret(args.secret); return await ctx.storage.getUrl(args.storageId); },
});

export const attachStorage = mutation({
  args: { secret: v.string(), table: tableName, legacyId: v.string(), storageId: v.id("_storage"), storageField: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const doc = await ctx.db.query(args.table as keyof DataModel).withIndex("by_legacy_id" as any, (q: any) => q.eq("legacyId", args.legacyId)).unique();
    if (!doc) throw new Error(`Missing ${args.table} document ${args.legacyId}`);
    await ctx.db.patch(doc._id, { storageId: args.storageId, storageField: args.storageField });
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const counts = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    return Object.fromEntries(await Promise.all(tableNames.map(async (table) => [table, (await tableDocs(ctx, table)).length])));
  },
});
