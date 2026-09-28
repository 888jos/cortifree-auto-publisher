import { accountSchema, personaConfigSchema, type Account, type PersonaConfig } from "../domain";
import { backendConfigured, dataBackend } from "../lib/data-backend";
import { loadAccounts as loadJsonAccounts } from "../config/accounts";
import { loadEditorialSnapshot } from "../editorial/snapshot";
import fallbackPersonas from "../../config/personas.json" with { type: "json" };
import type { EditorialTopic, EditorialHook, EditorialCta } from "../autonomy/selection";

type AnyRow = Record<string, unknown>;

export async function loadRuntimeRows(table: string, limit = 5000): Promise<AnyRow[]> {
  const response = await dataBackend(`${table}?limit=${limit}`);
  if (!response.ok) throw new Error(`Backend runtime read failed for ${table}: ${await response.text()}`);
  return await response.json() as AnyRow[];
}

async function loadEditorialRecordData(kind: string, limit = 5000): Promise<AnyRow[]> {
  if (!backendConfigured()) return [];
  const response = await dataBackend(
    `editorial_records?kind=eq.${encodeURIComponent(kind)}&active=eq.true&select=data&limit=${limit}`,
  );
  if (!response.ok) return [];
  const records = await response.json() as Array<{ data?: AnyRow }>;
  return records.map((record) => record.data ?? {}).filter((row) => Object.keys(row).length > 0);
}

function mergeByKey(base: AnyRow[], metadata: AnyRow[], key: string) {
  const metadataByKey = new Map(
    metadata
      .map((row) => [String(row[key] ?? "").trim(), row] as const)
      .filter(([value]) => value.length > 0),
  );
  return base.map((row) => {
    const id = String(row[key] ?? "").trim();
    return id && metadataByKey.has(id) ? { ...row, ...metadataByKey.get(id)! } : row;
  });
}

export async function loadRuntimeFormats(limit = 200): Promise<AnyRow[]> {
  const [formats, metadata] = await Promise.all([
    loadRuntimeRows("content_formats", limit),
    loadEditorialRecordData("formats", limit),
  ]);
  return mergeByKey(formats, metadata, "format_id");
}

export function normalizeBackendDatetime(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return parsed.toISOString();
}

function allowJsonFallback() {
  return process.env.ALLOW_RUNTIME_JSON_FALLBACK === "true";
}

export async function loadRuntimeAccounts(): Promise<Account[]> {
  if (backendConfigured()) {
    const live = await loadRuntimeRows("accounts", 100);
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
          created_at: normalizeBackendDatetime(row.created_at),
        };
        const result = accountSchema.safeParse(candidate);
        if (!result.success) throw new Error(`Invalid runtime account at index ${index}: ${result.error.message}`);
        return result.data;
      });
    if (parsed.length) return parsed;
  }
  if (!allowJsonFallback()) throw new Error("Runtime accounts are empty/unavailable and JSON fallback is disabled");
  return loadJsonAccounts();
}

export type RuntimeEditorial = {
  topics: EditorialTopic[];
  hooks: EditorialHook[];
  ctas: EditorialCta[];
  autonomyRules: AnyRow[];
};

export async function loadRuntimeAutonomyRules(limit = 200): Promise<AnyRow[]> {
  if (!backendConfigured()) return [];
  try {
    const direct = await loadRuntimeRows("autonomy_rules", limit);
    if (direct.length) return direct;
  } catch {
    // Older Supabase schemas keep secondary editorial config in editorial_records.
  }
  const response = await dataBackend(
    `editorial_records?kind=eq.autonomy_rules&active=eq.true&select=data&limit=${limit}`,
  );
  if (!response.ok) return [];
  const records = await response.json() as Array<{ data?: AnyRow }>;
  return records.map((row) => row.data ?? {}).filter((row) => Object.keys(row).length > 0);
}

export async function loadRuntimeEditorial(): Promise<RuntimeEditorial> {
  if (backendConfigured()) {
    const [topics, hooks, ctas, topicMetadata, hookMetadata, ctaMetadata] = await Promise.all([
      loadRuntimeRows("content_topics"),
      loadRuntimeRows("content_hooks"),
      loadRuntimeRows("content_ctas"),
      loadEditorialRecordData("topics"),
      loadEditorialRecordData("hooks"),
      loadEditorialRecordData("ctas"),
    ]);
    if (topics.length && hooks.length && ctas.length) {
      // Extended Sheet fields live in editorial_records so the stable core
      // tables do not need a schema migration for every editorial metadata key.
      const mergedTopics = mergeByKey(topics, topicMetadata, "topic_id");
      const mergedHooks = mergeByKey(hooks, hookMetadata, "hook_id");
      const mergedCtas = mergeByKey(ctas, ctaMetadata, "cta_id");
      const autonomyRules = await loadRuntimeAutonomyRules(200);
      return {
        topics: mergedTopics as unknown as EditorialTopic[],
        hooks: mergedHooks as unknown as EditorialHook[],
        ctas: mergedCtas as unknown as EditorialCta[],
        autonomyRules,
      };
    }
  }
  if (!allowJsonFallback()) throw new Error("Runtime editorial banks are empty/unavailable and JSON fallback is disabled");
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
  const raw = row?.value;
  const normalized = typeof raw === "string" ? raw.trim().replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : fallback;
}


const splitPipe = (value: unknown) => String(value ?? "").split("|").map((x) => x.trim()).filter(Boolean);

export function personaEditorialVoice(persona: PersonaConfig) {
  const editorial = persona.editorial;
  return [
    persona.content.voice,
    editorial ? `persona weight: ${editorial.copy_persona_weight}` : "",
    editorial ? `slang level: ${editorial.slang_level}/10` : "",
    editorial ? `punctuation: ${editorial.punctuation_profile}` : "",
    editorial ? `voice markers: ${editorial.voice_markers}` : "",
    editorial ? `may invent only: ${editorial.allowed_invented_details}` : "",
    editorial ? `avoid: ${editorial.avoid_voice}` : "",
  ].filter(Boolean).join(" | ");
}

export async function loadRuntimePersonaConfigs(): Promise<PersonaConfig[]> {
  if (backendConfigured()) {
    const [live, metadata] = await Promise.all([
      loadRuntimeRows("personas", 100),
      loadEditorialRecordData("personas", 100),
    ]);
    const merged = mergeByKey(live, metadata, "persona_id");
    const parsed = merged.map((row) => personaConfigSchema.safeParse({
      id: row.persona_id ?? row.id,
      name: row.name,
      age: Number(row.age),
      background: row.background,
      physical: { skin: row.skin, hair: row.hair, eyes: row.eyes, face: row.face, build: row.build },
      situation: row.situation,
      visual_style: row.visual_style,
      signature_scene: row.signature_scene,
      image_generation: {
        master_prompt: row.master_prompt,
        identity_reference_prompt: row.identity_reference_prompt,
        negative_prompt: row.negative_prompt,
      },
      content: {
        primary_topics: splitPipe(row.primary_topics),
        voice: row.voice,
        cta_style: row.cta_style,
        medical_guardrails: splitPipe(row.medical_guardrails),
      },
      editorial: {
        copy_persona_weight: String(row.copy_persona_weight ?? "MEDIUM"),
        slang_level: Number(row.slang_level ?? 7),
        punctuation_profile: String(row.punctuation_profile ?? "natural varied punctuation"),
        voice_markers: String(row.voice_markers ?? "specific, conversational, friend-to-friend"),
        allowed_invented_details: String(row.allowed_invented_details ?? "small plausible ephemeral lifestyle details"),
        avoid_voice: String(row.avoid_voice ?? "corporate, coachy, medical claims"),
      },
    })).flatMap((result) => result.success ? [result.data] : []);
    if (parsed.length) return parsed;
  }
  if (!allowJsonFallback()) throw new Error("Runtime personas are empty/unavailable and JSON fallback is disabled");
  return (fallbackPersonas as unknown[]).map((value) => personaConfigSchema.parse(value));
}
