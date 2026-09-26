import crypto from "node:crypto";
import type { Account } from "../domain";
import { dataBackend } from "../../app/lib/data-backend";

type Row = Record<string, unknown>;

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
  for (const record of records) {
    const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
    const id = String(record.key ?? data.slot_id ?? "").trim();
    const accountId = String(data.account_id ?? "").trim();
    const date = String(data.date ?? "").trim();
    const time = String(data.local_time ?? "").trim();
    const timezone = String(data.timezone ?? "America/New_York");
    if (!id || !accountId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) continue;
    const scheduled = zonedToUtc(date,time,timezone);
    const prior = existingById.get(id);
    const priorStatus = String(prior?.status ?? "");
    const status = priorStatus && priorStatus !== "EXPIRED"
      ? priorStatus
      : scheduled.getTime() < now ? "EXPIRED" : "OPEN";
    batch.push({
      id, workspace_id:"cortifree", account_id:accountId, persona_id:data.persona_id ?? null,
      slot_date:date, slot_time:time, timezone, scheduled_for:scheduled.toISOString(),
      strategy:strategyForSlot(id), pillar_id:data.pillar_id ?? null, concept_id:data.carousel_type ?? null,
      format_id:null, topic_id:data.topic_id ?? null, hook_id:data.hook_id ?? null,
      status, idea_id:prior?.idea_id ?? null, carousel_id:prior?.carousel_id ?? null,
      source:"content_calendar", metadata:data, updated_at:new Date().toISOString(),
    });
  }
  if (batch.length) await upsert("content_slots?on_conflict=id", batch);
  return { synced: batch.length };
}

function dateKeyInZone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}

export async function ensureRollingSlots(accounts: Account[], now = new Date()) {
  const existing = await rows("content_slots?workspace_id=eq.cortifree&scheduled_for=gte."+encodeURIComponent(now.toISOString())+"&select=id,account_id,slot_date,status&order=scheduled_for.asc&limit=2000").catch(() => []);
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
      const current=byAccountDate.get(key)??0;
      for(let index=current;index<target;index+=1){
        const time=candidateTimes[index % candidateTimes.length]!;
        const id=`AUTO_SLOT_${account.id}_${day.replaceAll("-","")}_${index+1}`;
        created.push({
          id,workspace_id:"cortifree",account_id:account.id,persona_id:account.persona_id,
          slot_date:day,slot_time:time,timezone:account.timezone,
          scheduled_for:zonedToUtc(day,time,account.timezone).toISOString(),
          strategy:strategyForSlot(id),pillar_id:account.primary_pillar_id??null,
          concept_id:null,format_id:null,topic_id:null,hook_id:null,status:"OPEN",
          source:"runtime_generated",metadata:{generated_from_account:true},updated_at:new Date().toISOString(),
        });
      }
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
