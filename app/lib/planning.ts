import { dataBackend } from "./data-backend";
import { assertCarouselHasCompleteRender, recordReviewEvent } from "./human-review";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
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
    `carousels?id=eq.${encodeURIComponent(input.carouselId)}&workspace_id=eq.cortifree&select=id,account_id,status,review_status,current_version,approved_version,approved_at&limit=1`,
  ))[0];
  if (!carousel) throw new Error(`Carousel not found: ${input.carouselId}`);
  if (!["APPROVED","SCHEDULED"].includes(String(carousel.status))) {
    throw new Error(`PLANNING_REQUIRES_APPROVAL: ${input.carouselId} is ${carousel.status ?? "unknown"}`);
  }
  const currentVersion = Number(carousel.current_version ?? 1);
  const approvedVersion = Number(carousel.approved_version ?? currentVersion);
  if (approvedVersion !== currentVersion) throw new Error("APPROVAL_STALE: carousel changed after approval");
  await assertCarouselHasCompleteRender(input.carouselId);

  let scheduled: Date;
  if (input.mode === "exact" || input.scheduledFor) {
    scheduled = new Date(String(input.scheduledFor ?? ""));
    if (!Number.isFinite(scheduled.getTime())) throw new Error("scheduledFor is invalid");
    if (scheduled.getTime() <= Date.now() + 60_000) throw new Error("scheduledFor must be in the future");
  } else {
    const accountId = String(carousel.account_id ?? "");
    if (!accountId) throw new Error("Carousel has no account_id");
    const account = (await rows(
      `content_accounts?account_id=eq.${encodeURIComponent(accountId)}&select=account_id,timezone,posting_slots&limit=1`,
    ))[0];
    if (!account) throw new Error(`Account not found: ${accountId}`);
    scheduled = nextAccountPostingTime(
      Array.isArray(account.posting_slots) ? account.posting_slots.map(String) : [],
      String(account.timezone ?? "America/New_York"),
    );
  }

  const scheduledFor = scheduled.toISOString();
  await patch(`carousels?id=eq.${encodeURIComponent(input.carouselId)}`, {
    status: "SCHEDULED",
    review_status: "SCHEDULED",
    scheduled_for: scheduledFor,
    last_review_action: "SCHEDULED",
  });
  await recordReviewEvent({
    carouselId: input.carouselId,
    eventType: "SCHEDULED",
    actor,
    patchPlan: { scheduled_for: scheduledFor },
    beforeVersion: currentVersion,
    afterVersion: currentVersion,
  });
  return { carouselId: input.carouselId, status: "SCHEDULED", scheduledFor };
}

export async function unscheduleCarousel(carouselId: string, actor = "admin") {
  const carousel = (await rows(
    `carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=current_version,status&limit=1`,
  ))[0];
  if (!carousel) throw new Error(`Carousel not found: ${carouselId}`);
  if (String(carousel.status) === "PUBLISHED") throw new Error("Published carousel cannot be unscheduled");
  const version = Number(carousel.current_version ?? 1);
  await patch(`carousels?id=eq.${encodeURIComponent(carouselId)}`, {
    status: "APPROVED",
    review_status: "APPROVED",
    scheduled_for: null,
    last_review_action: "UNSCHEDULED",
  });
  await recordReviewEvent({
    carouselId,
    eventType: "UNSCHEDULED",
    actor,
    beforeVersion: version,
    afterVersion: version,
  });
  return { carouselId, status: "APPROVED", scheduledFor: null };
}
