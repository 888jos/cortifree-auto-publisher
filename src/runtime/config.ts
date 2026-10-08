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
    const live = await loadRuntimeRows("content_accounts", 100);
    const parsed = live
      .filter((row) => row.active !== false)
      .map((row, index) => {
        const candidate = {
          id: row.account_id ?? row.id,
          name: row.display_name ?? row.name ?? row.username ?? row.username_candidate ?? row.account_id ?? row.id,
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
    const [topics, ctas] = await Promise.all([
      loadRuntimeRows("content_topics"),
      loadRuntimeRows("content_ctas"),
    ]);
    if (topics.length && ctas.length) {
      // Autonomy rules are optional in Supabase's editorial mirror. Selection
      // has safe defaults, so a missing optional table must not mask the real
      // canonical-context/account readiness error.
      const autonomyRules = await loadRuntimeAutonomyRules(200);
      return {
        topics: topics as unknown as EditorialTopic[],
        // Legacy hook formulas are deliberately excluded from the V2 runtime.
        // selectEditorial emits the DYNAMIC marker and the generator writes the
        // hook together with the concept/body.
        hooks: [],
        ctas: ctas as unknown as EditorialCta[],
        autonomyRules,
      };
    }
  }
  if (!allowJsonFallback()) throw new Error("Runtime editorial banks are empty/unavailable and JSON fallback is disabled");
  const snapshot = loadEditorialSnapshot();
  return {
    topics: snapshot.tables.content_topics as unknown as EditorialTopic[],
    hooks: [],
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
      .filter((row) => new Set(["human_approved", "assistant_curated"]).has(String(row.approval_status ?? "").toLowerCase()))
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
  } catch (error) {
    console.error("[editorial] golden example load failed", {
      formatId,
      pillarId,
      error: error instanceof Error ? error.message : String(error),
    });
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

export type RuntimeVoiceReferences = {
  personaVoice: string;
  hookReferences: string[];
  voiceExamples: RuntimeGoldenExample[];
};

const splitList = (value: unknown) => String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
const isTrue = (value: unknown, fallback = true) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return !["false", "0", "no", "faux", "non"].includes(normalized);
};

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

async function editorialRecords(kind: string): Promise<AnyRow[]> {
  const response = await dataBackend(`editorial_records?kind=eq.${encodeURIComponent(kind)}&active=eq.true&select=data&limit=1000`);
  if (!response.ok) return [];
  const records = await response.json() as Array<{ data?: AnyRow }>;
  return records.map((row) => row.data ?? {}).filter((row) => Object.keys(row).length > 0);
}

/** One readable voice brief from the persona's 01_PERSONAS voice columns. */
export function personaVoiceBrief(row: AnyRow | undefined, fallbackName: string) {
  if (!row) return fallbackName;
  const parts = [
    `${String(row.name ?? fallbackName)}${row.age ? `, ${row.age}` : ""}: ${String(row.voice_markers ?? row.voice ?? "").trim()}`,
    row.situation ? `life right now: ${row.situation}` : "",
    row.slang_level ? `slang level ${row.slang_level}/10` : "",
    row.punctuation_profile ? `punctuation: ${row.punctuation_profile}` : "",
    // The Sheet prefixes this list with "ephemeral" (passing details, not
    // facts about her); the model was copying the word into the copy.
    row.allowed_invented_details ? `small everyday things she can bring up in passing: ${String(row.allowed_invented_details).replace(/^\s*ephemeral\s+/i, "")}` : "",
    row.avoid_voice ? `never sounds like: ${row.avoid_voice}` : "",
  ].map((part) => part.trim()).filter(Boolean);
  return parts.join(". ");
}

/**
 * Voice references from the Sheet: the persona's voice columns, the
 * STYLE_REFERENCE hooks written for this format (06_HOOKS), and creator-voice
 * golden carousels (20_GOLDEN_CAROUSELS concept rows) compatible with it.
 * Every read is best-effort: missing references only weaken the prompt.
 */
export async function loadRuntimeVoiceReferences(input: {
  formatId: string;
  personaId: string;
  personaName: string;
  hookLimit?: number;
  exampleLimit?: number;
  random?: () => number;
}): Promise<RuntimeVoiceReferences> {
  const empty = { personaVoice: input.personaName, hookReferences: [], voiceExamples: [] };
  if (!backendConfigured()) return empty;
  const random = input.random ?? Math.random;
  try {
    const [personaRows, hookRows, goldenRows] = await Promise.all([
      editorialRecords("persona_voice"),
      editorialRecords("hook_references"),
      loadRuntimeRows("editorial_golden_examples", 500).catch(() => [] as AnyRow[]),
    ]);
    const persona = personaRows.find((row) => String(row.persona_id ?? "") === input.personaId);
    const styleHooks = hookRows.filter((row) =>
      String(row.runtime_use ?? "").toUpperCase() === "STYLE_REFERENCE"
      && isTrue(row.active)
      && splitList(row.compatible_formats).includes(input.formatId));
    const hookReferences = shuffled(styleHooks, random)
      .slice(0, input.hookLimit ?? 8)
      .map((row) => String(row.formula ?? "").trim())
      .filter(Boolean);
    const voiceGoldens = goldenRows.filter((row) => {
      const content = row.content && typeof row.content === "object" ? row.content as AnyRow : {};
      return row.active !== false
        && String(row.approval_status ?? "").toLowerCase() !== "rejected"
        && /^C\d{2}_/.test(String(row.concept_id ?? content.format_id ?? ""))
        && splitList(content.compatible_format_ids).includes(input.formatId);
    });
    const voiceExamples = shuffled(voiceGoldens, random).slice(0, input.exampleLimit ?? 3).map((row) => {
      const content = row.content && typeof row.content === "object" ? row.content as AnyRow : {};
      const slides = ["slide_2", "slide_3", "slide_4", "slide_5", "slide_6", "slide_7", "cta"]
        .map((key) => String(content[key] ?? "").trim()).filter(Boolean);
      return {
        id: String(row.example_id ?? ""),
        formatId: input.formatId,
        pillarId: String(row.pillar_id ?? ""),
        topic: String(row.topic ?? content.topic ?? ""),
        hook: String(row.hook ?? content.hook ?? ""),
        slides,
        toneNotes: String(content.tone_notes ?? ""),
        whyItWorks: String(content.why_it_works ?? ""),
        visualDirection: String(content.visual_direction ?? ""),
      };
    }).filter((example) => example.id && example.hook);
    return { personaVoice: personaVoiceBrief(persona, input.personaName), hookReferences, voiceExamples };
  } catch (error) {
    console.error("[editorial] voice reference load failed", { formatId: input.formatId, error: error instanceof Error ? error.message : String(error) });
    return empty;
  }
}
