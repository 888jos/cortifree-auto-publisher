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
    const [topics, hooks, ctas] = await Promise.all([
      loadRuntimeRows("content_topics"),
      loadRuntimeRows("content_hooks"),
      loadRuntimeRows("content_ctas"),
    ]);
    if (topics.length && ctas.length) {
      // Autonomy rules are optional in Supabase's editorial mirror. Selection
      // has safe defaults, so a missing optional table must not mask the real
      // canonical-context/account readiness error.
      const autonomyRules = await loadRuntimeAutonomyRules(200);
      return {
        topics: topics as unknown as EditorialTopic[],
        hooks: hooks as unknown as EditorialHook[],
        ctas: ctas as unknown as EditorialCta[],
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

export type RuntimeGoldenExample = {
  id: string;
  formatId: string;
  pillarId: string;
  topic: string;
  hook: string;
  slides: string[];
  toneNotes: string;
  whyItWorks: string;
  visualDirection: string;
};

export async function loadRuntimeGoldenExamples(formatId: string, pillarId: string, limit = 3): Promise<RuntimeGoldenExample[]> {
  if (!backendConfigured()) return [];
  try {
    const live = await loadRuntimeRows("editorial_golden_examples", 500);
    const approved = live
      .filter((row) => row.active !== false)
      .filter((row) => String(row.approval_status ?? "").toLowerCase() === "human_approved")
      .filter((row) => String(row.format_id ?? "") === formatId)
      .sort((left, right) => {
        const leftMatch = String(left.pillar_id ?? "") === pillarId ? 1 : 0;
        const rightMatch = String(right.pillar_id ?? "") === pillarId ? 1 : 0;
        return rightMatch - leftMatch;
      });
    return approved.slice(0, Math.max(0, limit)).map((row) => {
      const content = row.content && typeof row.content === "object" ? row.content as AnyRow : {};
      const structuredSlides = Array.isArray(row.slides)
        ? row.slides.map((slide) => typeof slide === "string" ? slide : JSON.stringify(slide)).filter(Boolean)
        : [];
      const legacySlides = ["slide_2","slide_3","slide_4","slide_5","slide_6","slide_7","cta"]
        .map((key) => String(content[key] ?? "").trim())
        .filter(Boolean);
      return {
        id: String(row.example_id ?? ""),
        formatId: String(row.format_id ?? ""),
        pillarId: String(row.pillar_id ?? ""),
        topic: String(row.topic ?? content.topic ?? ""),
        hook: String(row.hook ?? content.hook ?? ""),
        slides: structuredSlides.length ? structuredSlides : legacySlides,
        toneNotes: String(content.tone_notes ?? ""),
        whyItWorks: String(content.why_it_works ?? ""),
        visualDirection: String(content.visual_direction ?? ""),
      };
    }).filter((example) => example.id && example.hook);
  } catch {
    return [];
  }
}

export function autonomyRuleValue(rules: AnyRow[], key: string, fallback: number): number {
  const row = rules.find((item) => String(item.key) === key && item.active !== false);
  const raw = row?.value;
  const normalized = typeof raw === "string" ? raw.trim().replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : fallback;
}


const splitPipe = (value: unknown) => String(value ?? "").split("|").map((x) => x.trim()).filter(Boolean);

export async function loadRuntimePersonaConfigs(): Promise<PersonaConfig[]> {
  if (backendConfigured()) {
    const live = await loadRuntimeRows("personas", 100);
    const parsed = live.map((row) => personaConfigSchema.safeParse({
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
    })).flatMap((result) => result.success ? [result.data] : []);
    if (parsed.length) return parsed;
  }
  if (!allowJsonFallback()) throw new Error("Runtime personas are empty/unavailable and JSON fallback is disabled");
  return (fallbackPersonas as unknown[]).map((value) => personaConfigSchema.parse(value));
}
