import { backendMode, dataBackend } from "../data-backend";
import { readSheetObjects } from "../google/sheets";

type Row = Record<string, unknown>;
type Mapping = { sheet: string; range: string; table: string; key: string; transform?: (row: Row) => Row };

const split = (value: unknown) => String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
function mix(value: unknown) {
  return Object.fromEntries(split(value).map((entry) => {
    const [key, raw] = entry.split(":").map((part) => part.trim());
    return [key, Number(raw)];
  }).filter(([key, value]) => key && Number.isFinite(value)));
}

function account(row: Row): Row {
  return {
    account_id: row.account_id,
    display_name_candidate: row.display_name_candidate,
    username_candidate: row.username_candidate,
    platform: row.platform || "tiktok",
    language: row.language || "en",
    market: row.market || "US",
    timezone: row.timezone || "America/New_York",
    active: row.active,
    warmup_status: row.warmup_status || "CREATED",
    upload_post_profile: row.upload_post_profile || "",
    daily_target: row.daily_target || 1,
    primary_pillar_id: row.primary_pillar_id,
    promo_ratio: row.promo_ratio || 0.08,
    ready_buffer_days: row.ready_buffer_days || 3,
    posting_enabled: row.posting_enabled,
    name: row.display_name_candidate || row.username_candidate || row.account_id,
    platforms: [String(row.platform || "tiktok")],
    secondary_pillar_ids: split(row.secondary_pillar_ids),
    posting_slots: split(row.posting_slots),
    pillar_mix: mix(row.pillar_mix),
    format_mix: mix(row.format_mix),
    enabled: row.active === true && ["WARMING", "ACTIVE"].includes(String(row.warmup_status || "CREATED")),
  };
}

function persona(row: Row): Row {
  return {
    persona_id: row.persona_id,
    name: row.name ?? row.display_name ?? row.display_name_candidate,
    age: row.age,
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
  };
}

const mappings: Mapping[] = [
  { sheet: "01_PERSONAS", range: "A1:X40", table: "content_personas", key: "persona_id", transform: persona },
  { sheet: "02_ACCOUNTS", range: "A1:AD40", table: "content_accounts", key: "account_id", transform: account },
  { sheet: "03_FORMATS", range: "A1:N40", table: "content_formats", key: "format_id" },
  { sheet: "04_CONTENT_PILLARS", range: "A1:I40", table: "content_pillars", key: "pillar_id" },
  { sheet: "05_TOPICS_ANGLES", range: "A1:O1000", table: "content_topics", key: "topic_id" },
  { sheet: "06_HOOKS", range: "A1:M500", table: "content_hooks", key: "hook_id" },
  { sheet: "07_CTAS", range: "A1:H100", table: "content_ctas", key: "cta_id" },
  { sheet: "09_CLAIMS_RULES", range: "A1:L100", table: "content_claim_rules", key: "rule_id" },
  { sheet: "09_HEALTH_SOURCES", range: "A1:I100", table: "content_health_sources", key: "source_id" },
  { sheet: "13_TEMPLATE_SPECS", range: "A1:J100", table: "content_template_specs", key: "template_id" },
];

async function upsert(table: string, key: string, rows: Row[]) {
  if (!rows.length) return 0;
  const supabaseRuntime = backendMode() === "supabase";
  const legacySupabase = new Set(["content_personas", "content_accounts", "content_topics", "content_hooks", "content_ctas", "content_formats", "content_pillars", "content_claim_rules", "content_health_sources", "content_template_specs"]).has(table);
  const payload = rows.map((row) => {
    const normalized = supabaseRuntime
      ? Object.fromEntries(Object.entries(row).map(([field, value]) => [field, value === "" ? null : value]))
      : row;
    return { ...normalized, ...(supabaseRuntime && legacySupabase ? {} : supabaseRuntime ? { workspace_id: "cortifree" } : { id: row.id ?? row[key], workspace_id: "cortifree" }) };
  });
  const response = await dataBackend(`${table}?on_conflict=${supabaseRuntime ? key : "id"}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Sheet sync failed for ${table}: ${await response.text()}`);
  return payload.length;
}

export async function syncEditorialSheetToConvex() {
  const startedAt = new Date().toISOString();
  const counts: Record<string, number> = {};
  for (const mapping of mappings) {
    if (backendMode() === "supabase" && mapping.table === "content_accounts") {
      counts[mapping.table] = 0;
      continue;
    }
    if (backendMode() === "supabase" && !new Set(["content_personas", "content_topics", "content_hooks", "content_ctas"]).has(mapping.table)) {
      counts[mapping.table] = 0;
      continue;
    }
    const source = await readSheetObjects(mapping.sheet, mapping.range);
    const rows = source
      .filter((row) => row[mapping.key] !== null && row[mapping.key] !== undefined && String(row[mapping.key]).trim())
      .map((row) => mapping.transform ? mapping.transform(row) : row);
    counts[mapping.table] = await upsert(mapping.table, mapping.key, rows);
  }

  const derivedConfig: Row[] = [
    { key: "PERSONA_COUNT", value: counts.personas ?? 0, value_type: "number", description: "Derived from synced persona rows", source: "derived", active: true },
    { key: "ACCOUNT_COUNT", value: counts.accounts ?? 0, value_type: "number", description: "Derived from synced account rows", source: "derived", active: true },
    { key: "FORMAT_COUNT", value: counts.content_formats ?? 0, value_type: "number", description: "Derived from synced format rows", source: "derived", active: true },
    { key: "CONTENT_PILLAR_COUNT", value: counts.content_pillars ?? 0, value_type: "number", description: "Derived from synced pillar rows", source: "derived", active: true },
    { key: "TOPIC_ANGLE_COUNT", value: counts.content_topics ?? 0, value_type: "number", description: "Derived from synced topic rows", source: "derived", active: true },
    { key: "HOOK_COUNT", value: counts.content_hooks ?? 0, value_type: "number", description: "Derived from synced hook rows", source: "derived", active: true },
    { key: "CTA_COUNT", value: counts.content_ctas ?? 0, value_type: "number", description: "Derived from synced CTA rows", source: "derived", active: true },
    { key: "CLAIM_RULE_COUNT", value: counts.content_claim_rules ?? 0, value_type: "number", description: "Derived from synced claim-rule rows", source: "derived", active: true },
    { key: "HEALTH_SOURCE_COUNT", value: counts.content_sources ?? 0, value_type: "number", description: "Derived from synced health-source rows", source: "derived", active: true },
    { key: "AUTONOMY_RULE_COUNT", value: counts.autonomy_rules ?? 0, value_type: "number", description: "Derived from synced autonomy-rule rows", source: "derived", active: true },
    { key: "TEMPLATE_SPEC_COUNT", value: counts.template_specs ?? 0, value_type: "number", description: "Derived from synced template rows", source: "derived", active: true },
    { key: "RUNTIME_TRUTH", value: "CONVEX", value_type: "enum", description: "Autonomous runtime reads Convex", source: "system", active: true },
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
    event: "SHEET_TO_CONVEX",
    status: "SUCCESS",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    counts,
  };
  await dataBackend("system_logs", {
    method: "POST",
    body: JSON.stringify({ timestamp: log.finished_at, stage: log.event, status: log.status, metadata: log }),
  });
  return log;
}
