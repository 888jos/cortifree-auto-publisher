import crypto from "node:crypto";
import type { Account } from "../domain";
import { dataBackend } from "../../app/lib/data-backend";
import { ACTIVE_FORMAT_IDS } from "../content/formats";

type Row = Record<string, unknown>;
const ACTIVE_FORMAT_SET = new Set<string>(ACTIVE_FORMAT_IDS);
function boolish(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true","1","yes"].includes(String(value ?? "").trim().toLowerCase());
}
function integrationPayload(data: Record<string, unknown>) {
  const required = boolish(data.brand_required);
  const assetId = String(data.app_screen_asset_id ?? "").trim();
  const screenReady = assetId.length > 0 && String(data.app_screen_status ?? "").toUpperCase() === "READY";
  return {
    required,
    mention: String(data.brand_exact_phrase ?? "the app CortiFree"),
    integration_type: String(data.integration_type ?? ""),
    slide: String(data.integration_slide ?? ""),
    intensity: Number(data.integration_intensity ?? 0) || 0,
    app_screen_category: String(data.app_screen_category ?? ""),
    app_screen_asset_id: assetId || null,
    copy_bank_seed_id: String(data.copy_bank_seed_id ?? "") || null,
    screenshot_required: required && boolish(data.app_screen_required) && screenReady,
  };
}

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function upsert(resource: string, body: unknown) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
}
async function patch(resource: string, body: Row) {
  const response = await dataBackend(resource, { method: "PATCH", body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(await response.text());
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year:get("year"), month:get("month"), day:get("day"), hour:get("hour"), minute:get("minute") };
}

export function zonedToUtc(date: string, time: string, timezone: string) {
  const [year,month,day] = date.split("-").map(Number);
  const [hour,minute] = time.split(":").map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let index = 0; index < 3; index += 1) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    guess += Date.UTC(year,month-1,day,hour,minute)-represented;
  }
  return new Date(guess);
}

export function strategyForSlot(slotId: string) {
  const bucket = crypto.createHash("sha1").update(slotId).digest().readUInt32BE(0) % 10;
  return bucket < 7 ? "PROVEN" : bucket < 9 ? "ADJACENT" : "EXPERIMENT";
}

export async function syncContentSlotsFromCalendar() {
  const [records, existing] = await Promise.all([
    rows("editorial_records?kind=eq.content_calendar&active=eq.true&select=key,data&limit=2000"),
    rows("content_slots?workspace_id=eq.cortifree&select=id,status,idea_id,carousel_id&limit=2000").catch(() => []),
  ]);
  const existingById = new Map(existing.map((row) => [String(row.id), row]));
  const now = Date.now();
  const batch: Row[] = [];
  let restDays = 0;
  for (const record of records) {
    const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
    const id = String(record.key ?? data.slot_id ?? "").trim();
    const accountId = String(data.account_id ?? "").trim();
    const date = String(data.date ?? "").trim();
    const time = String(data.local_time ?? "").trim();
    const timezone = String(data.timezone ?? "America/New_York");
    const isRest = String(data.content_mode ?? "").toUpperCase() === "REST" || String(data.status ?? "").toUpperCase() === "NO_POST";
    if (isRest) {
      restDays += 1;
      continue;
    }
    if (!id || !accountId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) continue;
    const scheduled = zonedToUtc(date,time,timezone);
    const prior = existingById.get(id);
    const priorStatus = String(prior?.status ?? "");
    const status = priorStatus && priorStatus !== "EXPIRED"
      ? priorStatus
      : scheduled.getTime() < now ? "EXPIRED" : "OPEN";
    const plannedFormat = String(data.format_id_v2 ?? "").trim();
    const rawTopicId = String(data.topic_id ?? "").trim();
    const brand = integrationPayload(data);
    batch.push({
      id, workspace_id:"cortifree", account_id:accountId, persona_id:data.persona_id ?? null,
      slot_date:date, slot_time:time, timezone, scheduled_for:scheduled.toISOString(),
      strategy:strategyForSlot(id), pillar_id:data.pillar_id ?? null, concept_id:data.carousel_type ?? null,
      format_id:ACTIVE_FORMAT_SET.has(plannedFormat) ? plannedFormat : null,
      topic_id:/^T_/.test(rawTopicId) ? rawTopicId : null,
      hook_id:null,
      status, idea_id:prior?.idea_id ?? null, carousel_id:prior?.carousel_id ?? null,
      source:"content_calendar",
      metadata:data,
      topic:data.topic ?? null,
      angle:data.angle ?? null,
      hook:null,
      brand_integration:brand,
      app_screenshot_required:brand.screenshot_required,
      source_payload:data,
      updated_at:new Date().toISOString(),
    });
  }
  if (batch.length) await upsert("content_slots?on_conflict=id", batch);
  return { synced: batch.length, restDays };
}

function dateKeyInZone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}

export async function ensureRollingSlots(accounts: Account[], now = new Date()) {
  await patch(
    "content_slots?workspace_id=eq.cortifree&status=eq.OPEN&scheduled_for=lt." + encodeURIComponent(now.toISOString()),
    { status: "EXPIRED" },
  ).catch(() => undefined);
  const [existing, calendarRecords] = await Promise.all([
    rows("content_slots?workspace_id=eq.cortifree&scheduled_for=gte."+encodeURIComponent(now.toISOString())+"&select=id,account_id,slot_date,status&order=scheduled_for.asc&limit=2000").catch(() => []),
    rows("editorial_records?kind=eq.content_calendar&active=eq.true&select=key,data&limit=2000").catch(() => []),
  ]);
  const restDays = new Set(
    calendarRecords.flatMap((record) => {
      const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
      const rest = String(data.content_mode ?? "").toUpperCase() === "REST" || String(data.status ?? "").toUpperCase() === "NO_POST";
      const accountId = String(data.account_id ?? "").trim();
      const date = String(data.date ?? "").trim();
      return rest && accountId && /^\d{4}-\d{2}-\d{2}$/.test(date) ? [`${accountId}:${date}`] : [];
    }),
  );
  const byAccountDate = new Map<string, number>();
  for (const row of existing) {
    const key = `${String(row.account_id)}:${String(row.slot_date)}`;
    byAccountDate.set(key,(byAccountDate.get(key)??0)+1);
  }
  const created: Row[] = [];
  for (const account of accounts.filter((item)=>item.enabled && !["PAUSED","ERROR"].includes(item.warmup_status))) {
    const horizon = Math.max(1,account.ready_buffer_days ?? 3);
    const target = Math.max(1,account.daily_target ?? 1);
    const candidateTimes = account.posting_slots.length ? account.posting_slots : ["20:00","21:30"];
    for(let offset=0;offset<horizon;offset+=1){
      const instant = new Date(now.getTime()+offset*86_400_000);
      const day = dateKeyInZone(instant,account.timezone);
      const key = `${account.id}:${day}`;
      if (restDays.has(key)) continue;
      const current=byAccountDate.get(key)??0;
      let added = 0;
      for(let index=current;index<target;index+=1){
        const time=candidateTimes[index % candidateTimes.length]!;
        const scheduled = zonedToUtc(day,time,account.timezone);
        if (scheduled.getTime() <= now.getTime() + 5 * 60_000) continue;
        const id=`AUTO_SLOT_${account.id}_${day.replaceAll("-","")}_${index+1}`;
        const promoBucket = crypto.createHash("sha1").update(`${id}:promo`).digest().readUInt32BE(0) / 0xffffffff;
        const brandRequired = promoBucket < Math.max(0, Math.min(1, account.promo_ratio ?? 0.08));
        const brandIntegration = {
          required: brandRequired,
          mention: "the app CortiFree",
          integration_type: brandRequired ? "HABIT_IN_LIST" : "",
          slide: "",
          intensity: brandRequired ? 1 : 0,
          app_screen_category: "",
          app_screen_asset_id: null,
          copy_bank_seed_id: null,
          screenshot_required: false,
        };
        created.push({
          id,workspace_id:"cortifree",account_id:account.id,persona_id:account.persona_id,
          slot_date:day,slot_time:time,timezone:account.timezone,
          scheduled_for:scheduled.toISOString(),
          strategy:strategyForSlot(id),pillar_id:account.primary_pillar_id??null,
          concept_id:null,format_id:null,topic_id:null,hook_id:null,status:"OPEN",
          source:"runtime_generated",metadata:{generated_from_account:true,promo_ratio:account.promo_ratio ?? 0.08},
          brand_integration:brandIntegration,
          app_screenshot_required:false,
          updated_at:new Date().toISOString(),
        });
        added += 1;
      }
      if (added) byAccountDate.set(key, current + added);
    }
  }
  if(created.length)await upsert("content_slots?on_conflict=id",created);
  return {created:created.length};
}

export async function claimContentSlot(slotId: string, ideaId: string, formatId: string) {
  await patch(`content_slots?id=eq.${encodeURIComponent(slotId)}&workspace_id=eq.cortifree`, {
    status:"QUEUED", idea_id:ideaId, format_id:formatId,
  });
}

export async function updateContentSlot(slotId: unknown, body: Row) {
  const id=String(slotId??"").trim();
  if(!id)return;
  await patch(`content_slots?id=eq.${encodeURIComponent(id)}&workspace_id=eq.cortifree`,body);
}
