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
  { sheet: "04_CONTENT_PILLARS", range: "A1:I40", table: "content_pillars", key: "pillar_id" },
  { sheet: "05_TOPICS_ANGLES", range: "A1:O1000", table: "content_topics", key: "topic_id" },
  { sheet: "06_HOOKS", range: "A1:M500", table: "content_hooks", key: "hook_id" },
  { sheet: "07_CTAS", range: "A1:H100", table: "content_ctas", key: "cta_id" },
  { sheet: "09_CLAIMS_RULES", range: "A1:L100", table: "content_claim_rules", key: "rule_id" },
  { sheet: "09_HEALTH_SOURCES", range: "A1:I100", table: "content_health_sources", key: "source_id" },
  { sheet: "13_TEMPLATE_SPECS", range: "A1:J100", table: "content_template_specs", key: "template_id" },
  ...(process.env.CORTIFREE_LANGUAGE_BANK_SHEET ? [{ sheet: process.env.CORTIFREE_LANGUAGE_BANK_SHEET, range: "A1:Q500", table: "content_language_bank", key: "term_id" }] : []),
];

async function upsert(table: string, key: string, rows: Row[]) {
  if (!rows.length) return 0;
  const supabaseRuntime = backendMode() === "supabase";
  const tableHasNoWorkspaceColumn = new Set(["accounts", "content_personas", "content_accounts", "content_topics", "content_hooks", "content_ctas", "content_formats", "content_pillars", "content_claim_rules", "content_health_sources", "content_template_specs", "editorial_records"]).has(table);
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
    if (backendMode() === "supabase" && !new Set(["accounts", "content_personas", "content_topics", "content_hooks", "content_ctas", "content_formats"]).has(mapping.table)) {
      counts[mapping.table] = 0;
      continue;
    }
    const source = await readSheetObjects(mapping.sheet, mapping.range);
    const rows = source
      .filter((row) => row[mapping.key] !== null && row[mapping.key] !== undefined && String(row[mapping.key]).trim())
      .map((row) => mapping.transform ? mapping.transform(row) : row);
    counts[mapping.table] = await upsert(mapping.table, mapping.key, rows);
  }
  counts.content_calendar = await syncCanonicalCalendar();

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
