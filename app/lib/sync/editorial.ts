import { backendMode, dataBackend } from "../data-backend";
import { readSheetObjects } from "../google/sheets";

type Row = Record<string, unknown>;
type Mapping = { sheet: string; range: string; table: string; key: string; transform?: (row: Row) => Row };

const split = (value: unknown) => String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
function decimal(value: unknown, fallback = 0) {
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return fallback;
}

function mix(value: unknown) {
  return Object.fromEntries(split(value).map((entry) => {
    const [key, raw] = entry.split(":").map((part) => part.trim());
    return [key, decimal(raw)];
  }).filter(([key, value]) => key && Number.isFinite(value)));
}

function pillar(row: Row): Row {
  return {
    pillar_id: row.pillar_id,
    name: row.name,
    purpose: row.purpose,
    keywords: row.keywords,
    visual_bucket: row.visual_bucket,
    preferred_formats: row.preferred_formats,
    persona_ids: row.persona_ids,
    weight: decimal(row.weight, 1),
    active: bool(row.active, true),
  };
}

function formatRow(row: Row): Row {
  return {
    format_id: row.format_id,
    name: row.name,
    objective: row.objective,
    min_slides: Number(row.min_slides ?? 5),
    max_slides: Number(row.max_slides ?? 8),
    slide_structure: [row.hook_structure, row.body_structure].filter(Boolean).join(" || "),
    hook_family: row.allowed_concepts ?? null,
    cta_type: null,
    image_strategy: row.image_strategy,
    preferred_template_family: null,
    eligible_pillars: null,
    cooldown_days: Number(row.cooldown_days ?? 5),
    weight: decimal(row.weight, 0),
    active: bool(row.active, true),
  };
}

function topicRow(row: Row): Row {
  return {
    topic_id: row.topic_id,
    pillar_id: row.pillar_id,
    topic: row.topic,
    angle: row.angle,
    target_problem: row.target_problem,
    target_emotion: row.target_emotion,
    eligible_formats: row.eligible_formats,
    eligible_personas: row.eligible_personas,
    season: row.season,
    priority: row.priority,
    weight: decimal(row.weight, 1),
    cooldown_days: Number(row.cooldown_days ?? 14),
    use_count: Number(row.use_count ?? 0),
    last_used_at: row.last_used_at || null,
    active: bool(row.active, true),
  };
}

function hookVariables(formula: unknown) {
  return Array.from(new Set(
    Array.from(String(formula ?? "").matchAll(/\{([a-z_]+)\}/gi)).map((match) => match[1]!)
  ));
}

function hookRow(row: Row): Row {
  return {
    hook_id: row.hook_id,
    hook_family: row.hook_family,
    formula: row.formula,
    required_variables: hookVariables(row.formula),
    optional_variables: [],
    emotion: row.emotion,
    intensity: row.intensity,
    compatible_formats: row.compatible_formats,
    compatible_pillars: row.compatible_pillars,
    persona_fit: row.persona_fit,
    weight: decimal(row.weight, 1),
    cooldown_days: Number(row.cooldown_days ?? 7),
    use_count: Number(row.use_count ?? 0),
    last_used_at: row.last_used_at || null,
    active: bool(row.active, true),
  };
}

function ctaRow(row: Row): Row {
  return {
    cta_id: row.cta_id,
    cta_family: row.cta_family,
    text: row.text,
    intent: row.intent,
    compatible_formats: row.compatible_formats,
    weight: decimal(row.weight, 1),
    cooldown_days: Number(row.cooldown_days ?? 3),
    active: bool(row.active, true),
  };
}

function claimRule(row: Row): Row {
  const runtimeReady = String(row.runtime_status ?? "READY").toUpperCase() === "READY";
  return {
    rule_id: row.rule_id,
    topic: row.topic,
    risk_level: row.risk_level,
    claim_type: row.claim_type,
    allowed_wording: row.allowed_wording,
    avoid_wording: row.avoid_wording,
    example_safe: row.example_safe,
    requires_source: bool(row.requires_source),
    source_ids: split(row.source_ids),
    active: bool(row.active, true) && runtimeReady,
  };
}

function healthSource(row: Row): Row {
  return {
    source_id: row.source_id,
    topic: row.topic,
    organization: row.organization,
    title: row.title,
    url: row.url,
    evidence_level: row.evidence_level,
    allowed_claims: row.allowed_claim_scope ?? row.allowed_claims,
    last_reviewed: row.last_reviewed,
    active: bool(row.active, true),
  };
}

function account(row: Row): Row {
  return {
    account_id: row.account_id,
    persona_id: row.persona_id,
    platform: row.platform || "tiktok",
    username: row.username_candidate ?? row.username,
    display_name: row.display_name_candidate ?? row.display_name,
    bio: row.bio_candidate ?? row.bio,
    language: row.language || "en",
    market: row.market || "US",
    timezone: row.timezone || "America/New_York",
    active: bool(row.active, true),
    enabled: bool(row.active, true),
    weight: Number(row.weight ?? 1),
    status: row.status ?? row.warmup_status ?? "CREATED",
    warmup_status: row.warmup_status || "CREATED",
    upload_post_profile: row.upload_post_profile || "",
    primary_pillar_id: row.primary_pillar_id,
    secondary_pillars: row.secondary_pillar_ids ?? "",
    secondary_pillar_ids: split(row.secondary_pillar_ids),
    pillar_mix: mix(row.pillar_mix),
    format_mix: mix(row.format_mix),
    posting_enabled: bool(row.posting_enabled),
    daily_target: Number(row.daily_target ?? 1),
    posts_per_day: Number(row.daily_target ?? 1),
    posting_slots: split(row.posting_slots),
    promo_ratio: decimal(row.promo_ratio, 0.08),
    ready_buffer_days: Number(row.ready_buffer_days ?? 3),
    workspace_id: row.workspace_id ?? "cortifree",
  };
}

function persona(row: Row): Row {
  return {
    persona_id: row.persona_id,
    name: row.name ?? row.display_name ?? row.display_name_candidate,
    age: Number(row.age),
    background: row.background,
    skin: row.skin,
    hair: row.hair,
    eyes: row.eyes,
    face: row.face,
    build: row.build,
    situation: row.situation,
    visual_style: row.visual_style,
    signature_scene: row.signature_scene,
    master_prompt: row.master_prompt,
    identity_reference_prompt: row.identity_reference_prompt,
    negative_prompt: row.negative_prompt,
    primary_topics: row.primary_topics,
    voice: row.voice,
    cta_style: row.cta_style,
    medical_guardrails: row.medical_guardrails,
    persona_drive_folder_id: row.persona_drive_folder_id,
    config_drive_file_id: row.config_drive_file_id,
    active: bool(row.active, true),
    weight: decimal(row.weight, 1),
    workspace_id: row.workspace_id ?? "cortifree",
  };
}

const mappings: Mapping[] = [
  { sheet: "01_PERSONAS", range: "A1:AD40", table: "content_personas", key: "persona_id", transform: persona },
  { sheet: "02_ACCOUNTS", range: "A1:AC40", table: "accounts", key: "account_id", transform: account },
  { sheet: "03_FORMATS", range: "A1:P40", table: "content_formats", key: "format_id", transform: formatRow },
  { sheet: "04_CONTENT_PILLARS", range: "A1:I40", table: "content_pillars", key: "pillar_id", transform: pillar },
  { sheet: "05_TOPICS_ANGLES", range: "A1:Q1000", table: "content_topics", key: "topic_id", transform: topicRow },
  { sheet: "06_HOOKS", range: "A1:Q500", table: "content_hooks", key: "hook_id", transform: hookRow },
  { sheet: "07_CTAS", range: "A1:J100", table: "content_ctas", key: "cta_id", transform: ctaRow },
  { sheet: "09_CLAIMS_RULES", range: "A1:M100", table: "content_claim_rules", key: "rule_id", transform: claimRule },
  { sheet: "09_HEALTH_SOURCES", range: "A1:I100", table: "content_health_sources", key: "source_id", transform: healthSource },
  ...(process.env.CORTIFREE_LANGUAGE_BANK_SHEET
    ? [{ sheet: process.env.CORTIFREE_LANGUAGE_BANK_SHEET, range: "A1:Q500", table: "content_language_bank", key: "term_id" }]
    : []),
];

async function upsert(table: string, key: string, rows: Row[]) {
  if (!rows.length) return 0;
  const supabaseRuntime = backendMode() === "supabase";
  const tableHasNoWorkspaceColumn = new Set([
    "accounts", "content_personas", "content_accounts", "content_topics", "content_hooks", "content_ctas",
    "content_formats", "content_pillars", "content_claim_rules", "content_health_sources",
    "content_template_specs", "editorial_records",
  ]).has(table);

  const payload = rows.map((row) => {
    const normalized = supabaseRuntime
      ? Object.fromEntries(Object.entries(row).map(([field, value]) => [field, value === "" ? null : value]))
      : row;
    return {
      ...normalized,
      ...(supabaseRuntime && tableHasNoWorkspaceColumn
        ? {}
        : supabaseRuntime
          ? { workspace_id: "cortifree" }
          : { id: row.id ?? row[key], workspace_id: "cortifree" }),
    };
  });

  const conflictKey = table === "accounts" ? "account_id" : (supabaseRuntime ? key : "id");
  const response = await dataBackend(`${table}?on_conflict=${conflictKey}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  if (response.ok) return payload.length;

  const errorText = await response.text();
  const missingColumn = errorText.match(/Could not find the '([^']+)' column/);
  if (missingColumn) {
    throw new Error(`Sheet sync schema mismatch for ${table}: missing required column ${missingColumn[1]}. Refusing silent field deletion.`);
  }
  throw new Error(`Sheet sync failed for ${table}: ${errorText}`);
}

function isoSheetDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : raw;
}

function isoSheetTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const minutes = Math.round((value - Math.floor(value)) * 1_440) % 1_440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : raw;
}

async function syncSheetRecordKind(input: {
  sheet: string;
  range: string;
  kind: string;
  key: string;
  title?: string;
}) {
  if (backendMode() !== "supabase") return 0;
  const source = await readSheetObjects(input.sheet, input.range);
  const syncedAt = new Date().toISOString();
  const records = source.flatMap((sourceRow, index) => {
    const key = String(sourceRow[input.key] ?? "").trim();
    if (!key) return [];
    const active = bool(sourceRow.active, true);
    return [{
      kind: input.kind,
      key,
      title: String(sourceRow[input.title ?? input.key] ?? key),
      data: sourceRow,
      active,
      source: "google_sheet",
      source_sheet: input.sheet,
      source_row: index + 2,
      source_updated_at: syncedAt,
      synced_at: syncedAt,
    }];
  });
  if (!records.length) throw new Error(`Refusing to replace ${input.kind} with an empty Sheet read`);
  await upsert("editorial_records", "kind,key", records);

  const existingResponse = await dataBackend(`editorial_records?kind=eq.${encodeURIComponent(input.kind)}&select=key&limit=5000`);
  if (!existingResponse.ok) throw new Error(`Cannot reconcile ${input.kind}: ${await existingResponse.text()}`);
  const existing = await existingResponse.json() as Array<{ key?: unknown }>;
  const currentKeys = new Set(records.map((row) => row.key));
  const staleKeys = existing.map((row) => String(row.key ?? "")).filter((key) => key && !currentKeys.has(key));
  for (const key of staleKeys) {
    const response = await dataBackend(`editorial_records?kind=eq.${encodeURIComponent(input.kind)}&key=eq.${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false, synced_at: syncedAt }),
    });
    if (!response.ok) throw new Error(`Cannot deactivate stale ${input.kind} record ${key}: ${await response.text()}`);
  }
  return records.length;
}

async function syncCanonicalCalendar() {
  if (backendMode() !== "supabase") return 0;
  const source = await readSheetObjects("15_CONTENT_CALENDAR", "A1:AZ1000");
  const syncedAt = new Date().toISOString();
  const calendarRows = source.flatMap((sourceRow, index) => {
    const slotId = String(sourceRow.slot_id ?? "").trim();
    const accountId = String(sourceRow.account_id ?? "").trim();
    const date = isoSheetDate(sourceRow.date);
    if (!slotId || !accountId.startsWith("CF_") || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const data = { ...sourceRow, date, local_time: isoSheetTime(sourceRow.local_time) };
    return [{
      kind: "content_calendar",
      key: slotId,
      title: String(sourceRow.topic ?? slotId),
      data,
      active: true,
      source: "google_sheet",
      source_sheet: "15_CONTENT_CALENDAR",
      source_row: index + 2,
      source_updated_at: syncedAt,
      synced_at: syncedAt,
    }];
  });
  if (!calendarRows.length) throw new Error("Refusing to replace canonical calendar with an empty Sheet read");

  for (let offset = 0; offset < calendarRows.length; offset += 150) {
    await upsert("editorial_records", "kind,key", calendarRows.slice(offset, offset + 150));
  }

  const existingResponse = await dataBackend("editorial_records?kind=eq.content_calendar&select=key&limit=5000");
  if (!existingResponse.ok) throw new Error(`Cannot reconcile canonical calendar keys: ${await existingResponse.text()}`);
  const existing = await existingResponse.json() as Array<{ key?: unknown }>;
  const currentKeys = new Set(calendarRows.map((row) => row.key));
  const staleKeys = existing.map((row) => String(row.key ?? "")).filter((key) => key && !currentKeys.has(key));
  for (let offset = 0; offset < staleKeys.length; offset += 100) {
    const keys = staleKeys.slice(offset, offset + 100).map(encodeURIComponent).join(",");
    const response = await dataBackend(`editorial_records?kind=eq.content_calendar&key=in.(${keys})`, {
      method: "PATCH",
      body: JSON.stringify({ active: false, synced_at: syncedAt }),
    });
    if (!response.ok) throw new Error(`Cannot deactivate stale calendar rows: ${await response.text()}`);
  }
  return calendarRows.length;
}

export async function syncEditorialSheetToBackend() {
  const startedAt = new Date().toISOString();
  const counts: Record<string, number> = {};
  for (const mapping of mappings) {
    const source = await readSheetObjects(mapping.sheet, mapping.range);
    const rows = source
      .filter((row) => row[mapping.key] !== null && row[mapping.key] !== undefined && String(row[mapping.key]).trim())
      .map((row) => mapping.transform ? mapping.transform(row) : row);
    counts[mapping.table] = await upsert(mapping.table, mapping.key, rows);
  }

  const recordMirrors = [
    { sheet: "01_PERSONAS", range: "A1:AD40", kind: "personas", key: "persona_id", title: "name" },
    { sheet: "02_ACCOUNTS", range: "A1:AC40", kind: "accounts", key: "account_id", title: "account_id" },
    { sheet: "03_FORMATS", range: "A1:P40", kind: "formats", key: "format_id", title: "name" },
    { sheet: "04_CONTENT_PILLARS", range: "A1:I40", kind: "pillars", key: "pillar_id", title: "name" },
    { sheet: "05_TOPICS_ANGLES", range: "A1:Q1000", kind: "topics", key: "topic_id", title: "topic" },
    { sheet: "06_HOOKS", range: "A1:Q500", kind: "hooks", key: "hook_id", title: "hook_family" },
    { sheet: "07_CTAS", range: "A1:J100", kind: "ctas", key: "cta_id", title: "cta_family" },
    { sheet: "09_CLAIMS_RULES", range: "A1:M100", kind: "claim_rules", key: "rule_id", title: "topic" },
    { sheet: "09_HEALTH_SOURCES", range: "A1:I100", kind: "health_sources", key: "source_id", title: "title" },
    { sheet: "12_AUTONOMY_RULES", range: "A1:G100", kind: "autonomy_rules", key: "rule_id", title: "key" },
    { sheet: "13_TEMPLATE_SPECS", range: "A1:P100", kind: "template_specs", key: "format_id", title: "format_id" },
    { sheet: "16_PROFILE_PICTURES", range: "A1:M40", kind: "profile_pictures", key: "persona_id", title: "name" },
    { sheet: "17_BRAND_INTEGRATIONS", range: "A1:N100", kind: "brand_integrations", key: "integration_id", title: "integration_type" },
    { sheet: "18_CORTIFREE_COPY_BANK", range: "A1:K200", kind: "copy_bank", key: "copy_id", title: "scenario" },
    { sheet: "19_APP_SCREEN_LIBRARY", range: "A1:K100", kind: "app_screens", key: "screen_id", title: "category" },
    { sheet: "20_GOLDEN_CAROUSELS", range: "A1:V100", kind: "golden_carousels", key: "golden_id", title: "topic" },
  ];
  for (const mirror of recordMirrors) {
    counts[`editorial_${mirror.kind}`] = await syncSheetRecordKind(mirror);
  }

  counts.content_calendar = await syncCanonicalCalendar();

  const derivedConfig: Row[] = [
    { key: "PERSONA_COUNT", value: counts.content_personas ?? 0, value_type: "number", description: "Derived from synced persona rows", source: "derived", active: true },
    { key: "ACCOUNT_COUNT", value: counts.accounts ?? 0, value_type: "number", description: "Derived from synced account rows", source: "derived", active: true },
    { key: "FORMAT_COUNT", value: counts.content_formats ?? 0, value_type: "number", description: "Derived from synced format rows", source: "derived", active: true },
    { key: "CONTENT_PILLAR_COUNT", value: counts.content_pillars ?? 0, value_type: "number", description: "Derived from synced pillar rows", source: "derived", active: true },
    { key: "TOPIC_ANGLE_COUNT", value: counts.content_topics ?? 0, value_type: "number", description: "Derived from synced topic rows", source: "derived", active: true },
    { key: "HOOK_COUNT", value: counts.content_hooks ?? 0, value_type: "number", description: "Derived from synced hook rows", source: "derived", active: true },
    { key: "CTA_COUNT", value: counts.content_ctas ?? 0, value_type: "number", description: "Derived from synced CTA rows", source: "derived", active: true },
    { key: "CLAIM_RULE_COUNT", value: counts.content_claim_rules ?? 0, value_type: "number", description: "Derived from synced claim-rule rows", source: "derived", active: true },
    { key: "HEALTH_SOURCE_COUNT", value: counts.content_health_sources ?? 0, value_type: "number", description: "Derived from synced health-source rows", source: "derived", active: true },
    { key: "AUTONOMY_RULE_COUNT", value: counts.editorial_autonomy_rules ?? 0, value_type: "number", description: "Derived from synced autonomy-rule rows", source: "derived", active: true },
    { key: "TEMPLATE_SPEC_COUNT", value: counts.editorial_template_specs ?? 0, value_type: "number", description: "Derived from synced template rows", source: "derived", active: true },
    { key: "RUNTIME_TRUTH", value: backendMode() === "supabase" ? "SUPABASE" : "CONVEX", value_type: "enum", description: "Autonomous runtime reads the configured Supabase editorial mirror", source: "system", active: true },
    { key: "GOOGLE_SYNC_MODE", value: "CLOUD_API", value_type: "enum", description: "Google Sheet and Drive sync through cloud APIs", source: "system", active: true },
    { key: "JSON_RUNTIME_FALLBACK_DEFAULT", value: false, value_type: "boolean", description: "JSON fallback is emergency-only and opt-in", source: "system", active: true },
  ];
  if (backendMode() !== "supabase") {
    await upsert("content_config", "key", derivedConfig);
    counts.content_config_derived = derivedConfig.length;
  }

  const log = {
    id: `SYNC_SHEET_${Date.now()}`,
    workspace_id: "cortifree",
    event: `SHEET_TO_${backendMode().toUpperCase()}`,
    status: "SUCCESS",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    counts,
  };
  const logResponse = await dataBackend("system_logs", {
    method: "POST",
    body: JSON.stringify({ created_at: log.finished_at, stage: log.event, status: log.status, metadata: log }),
  });
  if (!logResponse.ok) throw new Error(`Sync log write failed: ${await logResponse.text()}`);
  return log;
}

/** @deprecated Use syncEditorialSheetToBackend. */
export const syncEditorialSheetToConvex = syncEditorialSheetToBackend;
