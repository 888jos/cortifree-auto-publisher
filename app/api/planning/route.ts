import { NextResponse } from "next/server";
import { isAdminRequest } from "../../lib/admin-auth";
import { dataBackend } from "../../lib/data-backend";
import { scheduleCarousel, unscheduleCarousel } from "../../lib/planning";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function dateKey(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function makeDays(start: string, count: number) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T12:00:00Z`) : new Date();
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(date.getTime() + index * 86_400_000);
    return next.toISOString().slice(0, 10);
  });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const daysCount = Math.min(21, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
    const start = url.searchParams.get("start") || new Date().toISOString().slice(0, 10);
    const days = makeDays(start, daysCount);

    const [accounts, carousels, slideRows, publishJobs] = await Promise.all([
      rows("content_accounts?select=account_id,persona_id,username,display_name,timezone,daily_target,posting_slots,enabled,posting_enabled,warmup_status&order=account_id.asc&limit=100"),
      rows("carousels?workspace_id=eq.cortifree&status=in.(READY_FOR_REVIEW,APPROVED,SCHEDULED,PUBLISHING,PUBLISHED,FAILED)&select=id,account_id,persona_id,topic,content_type,status,review_status,approved_at,approved_version,current_version,scheduled_for,created_at,spec&order=created_at.desc&limit=1000"),
      rows("carousel_slides?workspace_id=eq.cortifree&status=eq.CURRENT&select=carousel_id,position,rendered_url&order=position.asc&limit=5000"),
      rows("publish_jobs?workspace_id=eq.cortifree&select=carousel_id,status,scheduled_at,published_at,post_url,last_error,updated_at&order=updated_at.desc&limit=2000"),
    ]);

    const covers = new Map<string, string>();
    for (const slide of slideRows) {
      const carouselId = String(slide.carousel_id ?? "");
      if (!carouselId || covers.has(carouselId)) continue;
      const renderedUrl = String(slide.rendered_url ?? "");
      if (renderedUrl) covers.set(carouselId, renderedUrl);
    }

    const latestPublish = new Map<string, Row>();
    for (const job of publishJobs) {
      const carouselId = String(job.carousel_id ?? "");
      if (carouselId && !latestPublish.has(carouselId)) latestPublish.set(carouselId, job);
    }

    const accountMap = new Map(accounts.map((account) => [String(account.account_id), account]));
    const items = carousels.map((carousel) => {
      const id = String(carousel.id);
      const account = accountMap.get(String(carousel.account_id ?? ""));
      const timezone = String(account?.timezone ?? "America/New_York");
      const job = latestPublish.get(id);
      const time = String(job?.published_at ?? carousel.scheduled_for ?? job?.scheduled_at ?? "");
      return {
        id,
        accountId: String(carousel.account_id ?? ""),
        personaId: String(carousel.persona_id ?? account?.persona_id ?? ""),
        topic: String(carousel.topic ?? id),
        format: String(carousel.content_type ?? ""),
        status: String(job?.status ?? carousel.status ?? ""),
        reviewStatus: String(carousel.review_status ?? ""),
        scheduledFor: carousel.scheduled_for ? String(carousel.scheduled_for) : null,
        publishedAt: job?.published_at ? String(job.published_at) : null,
        postUrl: job?.post_url ? String(job.post_url) : null,
        error: job?.last_error ? String(job.last_error) : null,
        approvedAt: carousel.approved_at ? String(carousel.approved_at) : null,
        approvalStale: Number(carousel.approved_version ?? carousel.current_version ?? 1) !== Number(carousel.current_version ?? 1),
        date: time ? dateKey(time, timezone) : null,
        cover: covers.get(id) ?? null,
      };
    });

    const personas = accounts.map((account) => {
      const accountId = String(account.account_id);
      const personaId = String(account.persona_id ?? "");
      const relevant = items.filter((item) => item.accountId === accountId || (personaId && item.personaId === personaId));
      const byDay = Object.fromEntries(days.map((day) => [day, relevant.filter((item) => item.date === day)]));
      return {
        accountId,
        personaId,
        username: account.username ?? null,
        name: account.display_name ?? account.username ?? personaId ?? accountId,
        timezone: account.timezone ?? "America/New_York",
        dailyTarget: Number(account.daily_target ?? 1),
        postingSlots: Array.isArray(account.posting_slots) ? account.posting_slots : [],
        enabled: Boolean(account.enabled),
        postingEnabled: Boolean(account.posting_enabled),
        warmupStatus: String(account.warmup_status ?? ""),
        backlog: relevant.filter((item) => item.status === "APPROVED" && !item.scheduledFor),
        byDay,
      };
    });

    const summary = {
      awaitingReview: items.filter((item) => item.reviewStatus === "AWAITING_REVIEW").length,
      approvedBacklog: items.filter((item) => item.status === "APPROVED" && !item.scheduledFor).length,
      scheduled: items.filter((item) => item.status === "SCHEDULED").length,
      published: items.filter((item) => item.status === "PUBLISHED").length,
      failed: items.filter((item) => item.status === "FAILED").length,
    };

    return NextResponse.json({ generatedAt: new Date().toISOString(), start: days[0], days, summary, personas, items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as {
      action?: "schedule" | "unschedule";
      carouselId?: string;
      scheduledFor?: string;
      mode?: "next" | "exact";
      actor?: string;
    };
    const carouselId = body.carouselId?.trim();
    if (!carouselId) return NextResponse.json({ error: "carouselId is required" }, { status: 400 });
    if (body.action === "unschedule") {
      return NextResponse.json(await unscheduleCarousel(carouselId, body.actor ?? "admin"));
    }
    return NextResponse.json(await scheduleCarousel({
      carouselId,
      actor: body.actor ?? "admin",
      scheduledFor: body.scheduledFor,
      mode: body.mode ?? (body.scheduledFor ? "exact" : "next"),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
