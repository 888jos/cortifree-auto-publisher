import { dataBackend } from "./data-backend";
import { assertCarouselHasCompleteRender, recordReviewEvent } from "./human-review";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function post(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function patch(resource: string, body: Row) {
  const response = await dataBackend(resource, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year:get("year"), month:get("month"), day:get("day"), hour:get("hour"), minute:get("minute") };
}

function zonedToUtc(year:number,month:number,day:number,hour:number,minute:number,timezone:string) {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - represented;
  }
  return new Date(guess);
}

export function nextAccountPostingTime(
  slots: string[],
  timezone: string,
  now = new Date(),
) {
  const local = localParts(now, timezone);
  const parsed = slots
    .map((slot) => slot.split(":").map(Number))
    .filter(([hour, minute]) => Number.isFinite(hour) && Number.isFinite(minute))
    .map(([hour, minute]) => [hour, minute] as const)
    .sort((a,b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const candidates = parsed.length ? parsed : [[18,0] as const, [20,30] as const];
  const nowMinutes = local.hour * 60 + local.minute;
  const today = candidates.find(([hour,minute]) => hour * 60 + minute > nowMinutes + 5);
  if (today) return zonedToUtc(local.year, local.month, local.day, today[0], today[1], timezone);
  const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day) + 86_400_000);
  const [hour, minute] = candidates[0]!;
  return zonedToUtc(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    hour,
    minute,
    timezone,
  );
}

export async function scheduleCarousel(input: {
  carouselId: string;
  actor?: string;
  scheduledFor?: string;
  mode?: "next" | "exact";
}) {
  const actor = input.actor?.trim() || "admin";
  const carousel = (await rows(
    `carousels?id=eq.${encodeURIComponent(input.carouselId)}&workspace_id=eq.cortifree&select=id,account_id,persona_id,status,review_status,current_version,approved_version,approved_hash,content_hash,approved_at,calendar_slot_id&limit=1`,
  ))[0];
  if (!carousel) throw new Error(`Carousel not found: ${input.carouselId}`);
  if (!["APPROVED","PLANNED","SCHEDULED"].includes(String(carousel.status))) {
    throw new Error(`PLANNING_REQUIRES_APPROVAL: ${input.carouselId} is ${carousel.status ?? "unknown"}`);
  }
  const currentVersion = Number(carousel.current_version ?? 1);
  const approvedVersion = Number(carousel.approved_version ?? currentVersion);
  if (approvedVersion !== currentVersion) throw new Error("APPROVAL_STALE: carousel changed after approval");
  if (!carousel.approved_hash || carousel.approved_hash !== carousel.content_hash) throw new Error("APPROVAL_STALE: content hash changed after approval");
  await assertCarouselHasCompleteRender(input.carouselId);
  const accountId = String(carousel.account_id ?? "");
  if (!accountId) throw new Error("Carousel has no account_id");
  const account = (await rows(
    `content_accounts?account_id=eq.${encodeURIComponent(accountId)}&select=account_id,timezone,posting_slots,enabled&limit=1`,
  ))[0];
  if (!account) throw new Error(`Account not found: ${accountId}`);
  if (account.enabled === false) throw new Error(`ACCOUNT_DISABLED: ${accountId}`);
  const linkedSlotId = String(carousel.calendar_slot_id ?? "").trim();
  const linkedSlot = linkedSlotId
    ? (await rows(
        `content_slots?id=eq.${encodeURIComponent(linkedSlotId)}&workspace_id=eq.cortifree&select=id,status,scheduled_for,timezone&limit=1`,
      ))[0]
    : null;
  const providerJob = (await rows(
    `publish_jobs?workspace_id=eq.cortifree&carousel_id=eq.${encodeURIComponent(input.carouselId)}&status=in.(SCHEDULING,SCHEDULED,PUBLISHING,PUBLISHED)&select=id,status,provider_request_id&order=created_at.desc&limit=1`,
  ))[0];
  if (providerJob?.provider_request_id) throw new Error("PROVIDER_SCHEDULE_ALREADY_CREATED");

  const timezone = String(account.timezone ?? linkedSlot?.timezone ?? "America/New_York");
  let scheduled: Date;
  if (input.mode === "exact" || input.scheduledFor) {
    scheduled = new Date(String(input.scheduledFor ?? ""));
    if (!Number.isFinite(scheduled.getTime())) throw new Error("scheduledFor is invalid");
    if (scheduled.getTime() <= Date.now() + 60_000) throw new Error("scheduledFor must be in the future");
  } else {
    const canonicalSlotAt = linkedSlot?.scheduled_for ? new Date(String(linkedSlot.scheduled_for)) : null;
    scheduled = canonicalSlotAt && Number.isFinite(canonicalSlotAt.getTime()) && canonicalSlotAt.getTime() > Date.now() + 60_000
      ? canonicalSlotAt
      : nextAccountPostingTime(
          Array.isArray(account.posting_slots) ? account.posting_slots.map(String) : [],
          timezone,
        );
  }

  const scheduledFor = scheduled.toISOString();
  const local = localParts(scheduled, timezone);
  const slotDate = `${local.year}-${String(local.month).padStart(2,"0")}-${String(local.day).padStart(2,"0")}`;
  const slotTime = `${String(local.hour).padStart(2,"0")}:${String(local.minute).padStart(2,"0")}`;
  const slotId = linkedSlotId || `MANUAL_SLOT_${input.carouselId}_${scheduledFor.replace(/[^0-9]/g,"").slice(0,14)}`;

  if (!linkedSlotId) {
    await post("content_slots?on_conflict=id", {
      id: slotId,
      workspace_id: "cortifree",
      account_id: accountId,
      persona_id: carousel.persona_id ?? null,
      slot_date: slotDate,
      slot_time: slotTime,
      local_time: slotTime,
      timezone,
      scheduled_for: scheduledFor,
      strategy: "MANUAL",
      status: "APPROVED",
      carousel_id: input.carouselId,
      source: "manual_planning",
      metadata: { created_from_approved_carousel: true, actor },
      updated_at: new Date().toISOString(),
    });
  }

  await patch(`carousels?id=eq.${encodeURIComponent(input.carouselId)}`, {
    status: "PLANNED",
    review_status: "PLANNED",
    scheduled_for: scheduledFor,
    calendar_slot_id: slotId,
    last_review_action: "PLANNED",
  });
  await recordReviewEvent({
    carouselId: input.carouselId,
    eventType: "PLANNED",
    actor,
    patchPlan: { scheduled_for: scheduledFor },
    beforeVersion: currentVersion,
    afterVersion: currentVersion,
  });
  await patch(`content_slots?id=eq.${encodeURIComponent(slotId)}&workspace_id=eq.cortifree`, {
    status: "PLANNED",
    carousel_id: input.carouselId,
    slot_date: slotDate,
    slot_time: slotTime,
    timezone,
    scheduled_for: scheduledFor,
  });
  return { carouselId: input.carouselId, slotId, status: "PLANNED", scheduledFor };
}

export async function unscheduleCarousel(carouselId: string, actor = "admin") {
  const carousel = (await rows(
    `carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=current_version,status,calendar_slot_id&limit=1`,
  ))[0];
  if (!carousel) throw new Error(`Carousel not found: ${carouselId}`);
  if (String(carousel.status) === "PUBLISHED") throw new Error("Published carousel cannot be unscheduled");
  const providerJob = (await rows(
    `publish_jobs?workspace_id=eq.cortifree&carousel_id=eq.${encodeURIComponent(carouselId)}&status=in.(SCHEDULING,SCHEDULED,PUBLISHING,PUBLISHED)&select=id,status,provider_request_id&order=created_at.desc&limit=1`,
  ))[0];
  if (providerJob?.provider_request_id) throw new Error("PROVIDER_SCHEDULE_ALREADY_CREATED");
  const version = Number(carousel.current_version ?? 1);
  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    status: "APPROVED",
    review_status: "APPROVED",
    scheduled_for: null,
    last_review_action: "UNSCHEDULED",
  });
  if (carousel.calendar_slot_id) {
    await patch(`content_slots?id=eq.${encodeURIComponent(String(carousel.calendar_slot_id))}&workspace_id=eq.cortifree`, {
      status: "APPROVED",
      carousel_id: carouselId,
    });
  }
  await recordReviewEvent({
    carouselId,
    eventType: "UNSCHEDULED",
    actor,
    beforeVersion: version,
    afterVersion: version,
  });
  return { carouselId, status: "APPROVED", scheduledFor: null };
}
