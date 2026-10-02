import { backendMode, dataBackend } from "../data-backend";
import { readSheetObjects } from "../google/sheets";

type Row = Record<string, unknown>;
type Mapping = { sheet: string; range: string; table: string; key: string; sourceKey?: string; transform?: (row: Row) => Row };

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

function territory(row: Row): Row {
  const parts = [
    row.human_tension ? `Human tension: ${String(row.human_tension).trim()}` : "",
    row.situations ? `Situations: ${String(row.situations).trim()}` : "",
    row.creative_directions ? `Creative directions: ${String(row.creative_directions).trim()}` : "",
    row.avoid ? `Avoid: ${String(row.avoid).trim()}` : "",
  ].filter(Boolean);
  return {
    topic_id: row.territory_id,
    pillar_id: row.pillar_id,
    topic: row.territory,
    angle: parts.join(" | "),
    target_problem: row.human_tension,
    target_emotion: row.target_emotion,
    eligible_formats: row.eligible_formats,
    eligible_personas: row.eligible_personas,
    season: row.season || "evergreen",
    priority: row.priority || "MEDIUM",
    weight: decimal(row.weight, 1),
    cooldown_days: Math.max(1, Math.round(decimal(row.cooldown_days, 7))),
    active: bool(row.active, true),
  };
}

function canonicalGoldenFormat(row: Row) {
  const compatible = split(row.compatible_format_ids).find((value) => /^F0[134578]_/.test(value));
  if (compatible) return compatible;
  const direct = String(row.format_id ?? "").trim();
  return /^F0[134578]_/.test(direct) ? direct : "";
}

function goldenExample(row: Row): Row {
  const slides = ["slide_2", "slide_3", "slide_4", "slide_5", "slide_6", "slide_7"]
    .map((key) => String(row[key] ?? "").trim())
    .filter(Boolean);
  return {
    example_id: row.golden_id,
    format_id: canonicalGoldenFormat(row),
    concept_id: row.format_id,
    pillar_id: row.pillar_id,
    topic: row.topic,
    angle: row.why_it_works,
    hook: row.hook,
    slides,
    content: row,
    active: bool(row.active, true),
    approval_status: String(row.human_status ?? "").trim().toUpperCase() === "AI_CURATED_APPROVED"
      ? "assistant_curated"
      : String(row.human_status ?? "").trim().toUpperCase() === "HUMAN_APPROVED"
        ? "human_approved"
        : "review_required",
  };
}

function copyReference(row: Row): Row {
  return {
    copy_id: row.copy_id,
    concept_id: row.integration_type,
    hook: row.copy_line,
    body: "",
    content: row,
    active: bool(row.active, true),
  };
}

function claimRule(row: Row): Row {
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
    active: bool(row.active, true),
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
    active: row.active,
    enabled: row.active,
    weight: Number(row.weight ?? 1),
    status: row.status ?? row.warmup_status ?? "CREATED",
    warmup_status: row.warmup_status || "CREATED",
    upload_post_profile: row.upload_post_profile || "",
    primary_pillar_id: row.primary_pillar_id,
    secondary_pillars: row.secondary_pillar_ids ?? "",
    secondary_pillar_ids: split(row.secondary_pillar_ids),
    pillar_mix: mix(row.pillar_mix),
    format_mix: mix(row.format_mix),
    posting_enabled: row.posting_enabled,
    daily_target: Number(row.daily_target ?? 1),
    posts_per_day: Number(row.daily_target ?? 1),
    posting_slots: split(row.posting_slots),
    promo_ratio: Number(row.promo_ratio ?? 0.08),
    ready_buffer_days: Number(row.ready_buffer_days ?? 3),
    workspace_id: row.workspace_id ?? "cortifree",
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
  { sheet: "02_ACCOUNTS", range: "A1:AD40", table: "accounts", key: "account_id", transform: account },
  { sheet: "03_FORMATS", range: "A1:N40", table: "content_formats", key: "format_id" },
  { sheet: "04_CONTENT_PILLARS", range: "A1:I40", table: "content_pillars", key: "pillar_id", transform: pillar },
  { sheet: "05_CONTENT_TERRITORIES", range: "A1:O200", table: "content_topics", key: "topic_id", sourceKey: "territory_id", transform: territory },
  { sheet: "07_CTAS", range: "A1:H100", table: "content_ctas", key: "cta_id" },
  { sheet: "09_CLAIMS_RULES", range: "A1:L100", table: "content_claim_rules", key: "rule_id", transform: claimRule },
  { sheet: "09_HEALTH_SOURCES", range: "A1:I100", table: "content_health_sources", key: "source_id", transform: healthSource },
  { sheet: "18_CORTIFREE_COPY_BANK", range: "A1:K200", table: "editorial_copy_bank", key: "copy_id", transform: copyReference },
  { sheet: "20_GOLDEN_CAROUSELS", range: "A1:V200", table: "editorial_golden_examples", key: "example_id", sourceKey: "golden_id", transform: goldenExample },
  ...(process.env.CORTIFREE_LANGUAGE_BANK_SHEET ? [{ sheet: process.env.CORTIFREE_LANGUAGE_BANK_SHEET, range: "A1:Q500", table: "content_language_bank", key: "term_id" }] : []),
];

async function upsert(table: string, key: string, rows: Row[]) {
  if (!rows.length) return 0;
  const supabaseRuntime = backendMode() === "supabase";
  const tableHasNoWorkspaceColumn = new Set(["accounts", "content_personas", "content_accounts", "content_topics", "content_hooks", "content_ctas", "content_formats", "content_pillars", "content_claim_rules", "content_health_sources", "content_template_specs", "editorial_records", "editorial_golden_examples", "editorial_copy_bank"]).has(table);
  let payload = rows.map((row) => {
    const normalized = supabaseRuntime
      ? Object.fromEntries(Object.entries(row).map(([field, value]) => [field, value === "" ? null : value]))
      : row;
    return { ...normalized, ...(supabaseRuntime && tableHasNoWorkspaceColumn ? {} : supabaseRuntime ? { workspace_id: "cortifree" } : { id: row.id ?? row[key], workspace_id: "cortifree" }) };
  });
  const conflictKey = table === "accounts" ? "account_id" : (supabaseRuntime ? key : "id");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await dataBackend(`${table}?on_conflict=${conflictKey}`, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(payload),
    });
    if (response.ok) return payload.length;
    const errorText = await response.text();
    const missingColumn = errorText.match(/Could not find the '([^']+)' column/);
    if (!missingColumn || !payload.some((row) => Object.prototype.hasOwnProperty.call(row, missingColumn[1]))) {
      throw new Error(`Sheet sync failed for ${table}: ${errorText}`);
    }
    payload = payload.map((row) => { const copy: Row = { ...row }; delete copy[missingColumn[1]]; return copy; });
  }
  throw new Error(`Sheet sync failed for ${table}: too many schema compatibility retries`);
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

export async function syncEditorialSheetToConvex() {
  const startedAt = new Date().toISOString();
  const counts: Record<string, number> = {};
  for (const mapping of mappings) {
    const source = await readSheetObjects(mapping.sheet, mapping.range);
    const sourceKey = mapping.sourceKey ?? mapping.key;
    const rows = source
      .filter((row) => row[sourceKey] !== null && row[sourceKey] !== undefined && String(row[sourceKey]).trim())
      .map((row) => mapping.transform ? mapping.transform(row) : row)
      .filter((row) => row[mapping.key] !== null && row[mapping.key] !== undefined && String(row[mapping.key]).trim());
    counts[mapping.table] = await upsert(mapping.table, mapping.key, rows);
  }

  if (backendMode() === "supabase") {
    const territories = await readSheetObjects("05_CONTENT_TERRITORIES", "A1:O200");
    const activeIds = new Set(territories.map((row) => String(row.territory_id ?? "").trim()).filter(Boolean));
    const existingResponse = await dataBackend("content_topics?select=topic_id&limit=5000");
    if (!existingResponse.ok) throw new Error(`Cannot reconcile content territories: ${await existingResponse.text()}`);
    const existing = await existingResponse.json() as Array<{ topic_id?: unknown }>;
    const stale = existing.map((row) => String(row.topic_id ?? "")).filter((id) => id && !activeIds.has(id));
    for (let offset = 0; offset < stale.length; offset += 100) {
      const ids = stale.slice(offset, offset + 100).map(encodeURIComponent).join(",");
      const response = await dataBackend(`content_topics?topic_id=in.(${ids})`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) throw new Error(`Cannot deactivate stale content topics: ${await response.text()}`);
    }
    const hooksResponse = await dataBackend("content_hooks?active=eq.true", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    if (!hooksResponse.ok) throw new Error(`Cannot deactivate legacy hook formulas: ${await hooksResponse.text()}`);
    counts.legacy_topics_deactivated = stale.length;
    counts.dynamic_hook_mode = 1;
  }

  const recordMirrors = [
    { sheet: "04_CONTENT_PILLARS", range: "A1:I40", kind: "pillars", key: "pillar_id", title: "name" },
    { sheet: "09_CLAIMS_RULES", range: "A1:L100", kind: "claim_rules", key: "rule_id", title: "topic" },
    { sheet: "09_HEALTH_SOURCES", range: "A1:I100", kind: "health_sources", key: "source_id", title: "title" },
    { sheet: "12_AUTONOMY_RULES", range: "A1:G100", kind: "autonomy_rules", key: "rule_id", title: "key" },
    { sheet: "13_TEMPLATE_SPECS", range: "A1:H100", kind: "template_specs", key: "format_id", title: "format_id" },
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
    { key: "CONTENT_TERRITORY_COUNT", value: counts.content_topics ?? 0, value_type: "number", description: "Derived from canonical creative territories", source: "derived", active: true },
    { key: "DYNAMIC_HOOK_GENERATION", value: true, value_type: "boolean", description: "Hooks are generated with the carousel; legacy hook formulas are non-runtime", source: "system", active: true },
    { key: "GOLDEN_EXAMPLE_COUNT", value: counts.editorial_golden_examples ?? 0, value_type: "number", description: "Creative few-shot examples mirrored from Sheet", source: "derived", active: true },
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
