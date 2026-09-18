import { accountSchema, type Account } from "../domain";
import { dataBackend, convexConfigured } from "../lib/data-backend";
import { loadAccounts as loadJsonAccounts } from "../config/accounts";
import { loadEditorialSnapshot } from "../editorial/snapshot";
import type { EditorialTopic, EditorialHook, EditorialCta } from "../autonomy/selection";

type AnyRow = Record<string, unknown>;

async function rows(table: string, limit = 5000): Promise<AnyRow[]> {
  const response = await dataBackend(`${table}?limit=${limit}`);
  if (!response.ok) throw new Error(`Convex runtime read failed for ${table}: ${await response.text()}`);
  return await response.json() as AnyRow[];
}

function allowJsonFallback() {
  return process.env.ALLOW_RUNTIME_JSON_FALLBACK === "true";
}

export async function loadRuntimeAccounts(): Promise<Account[]> {
  if (convexConfigured()) {
    const live = await rows("accounts", 100);
    const parsed = live
      .filter((row) => row.active !== false)
      .map((row, index) => {
        const candidate = {
          id: row.id ?? row.account_id,
          name: row.name ?? row.display_name ?? row.display_name_candidate ?? row.username ?? row.username_candidate ?? row.id ?? row.account_id,
          persona_id: row.persona_id,
          language: row.language ?? "en",
          market: row.market ?? "US",
          timezone: row.timezone ?? "America/New_York",
          platforms: Array.isArray(row.platforms) ? row.platforms : [row.platform ?? "tiktok"],
          upload_post_profile: row.upload_post_profile ?? "",
          daily_target: Number(row.daily_target ?? 1),
          posting_slots: Array.isArray(row.posting_slots) ? row.posting_slots : [],
          enabled: row.enabled ?? row.active ?? false,
          posting_enabled: row.posting_enabled ?? false,
          primary_pillar_id: row.primary_pillar_id,
          secondary_pillar_ids: Array.isArray(row.secondary_pillar_ids) ? row.secondary_pillar_ids : [],
          pillar_mix: row.pillar_mix ?? {},
          format_mix: row.format_mix ?? {},
          promo_ratio: Number(row.promo_ratio ?? 0.08),
          ready_buffer_days: Number(row.ready_buffer_days ?? 3),
          warmup_status: row.warmup_status ?? "CREATED",
          created_at: row.created_at,
        };
        const result = accountSchema.safeParse(candidate);
        if (!result.success) throw new Error(`Invalid Convex account at index ${index}: ${result.error.message}`);
        return result.data;
      });
    if (parsed.length) return parsed;
  }
  if (!allowJsonFallback()) throw new Error("Convex accounts are empty/unavailable and JSON fallback is disabled");
  return loadJsonAccounts();
}

export type RuntimeEditorial = {
  topics: EditorialTopic[];
  hooks: EditorialHook[];
  ctas: EditorialCta[];
  autonomyRules: AnyRow[];
};

export async function loadRuntimeEditorial(): Promise<RuntimeEditorial> {
  if (convexConfigured()) {
    const [topics, hooks, ctas, autonomyRules] = await Promise.all([
      rows("content_topics"),
      rows("content_hooks"),
      rows("content_ctas"),
      rows("autonomy_rules", 200),
    ]);
    if (topics.length && hooks.length && ctas.length) {
      return {
        topics: topics as unknown as EditorialTopic[],
        hooks: hooks as unknown as EditorialHook[],
        ctas: ctas as unknown as EditorialCta[],
        autonomyRules,
      };
    }
  }
  if (!allowJsonFallback()) throw new Error("Convex editorial banks are empty/unavailable and JSON fallback is disabled");
  const snapshot = loadEditorialSnapshot();
  return {
    topics: snapshot.tables.content_topics as unknown as EditorialTopic[],
    hooks: snapshot.tables.content_hooks as unknown as EditorialHook[],
    ctas: snapshot.tables.content_ctas as unknown as EditorialCta[],
    autonomyRules: snapshot.tables.autonomy_rules ?? [],
  };
}

export function autonomyRuleValue(rules: AnyRow[], key: string, fallback: number): number {
  const row = rules.find((item) => String(item.key) === key && item.active !== false);
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : fallback;
}
