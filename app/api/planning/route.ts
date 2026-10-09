import { NextResponse } from "next/server";
import { isOperatorRequest } from "../../lib/admin-auth";
import { dataBackend } from "../../lib/data-backend";
import { scheduleCarousel, unscheduleCarousel } from "../../lib/planning";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function makeDays(start: string, count: number) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T12:00:00Z`) : new Date();
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(date.getTime() + index * 86_400_000);
    return next.toISOString().slice(0, 10);
  });
}

function approvalStale(carousel: Row | undefined) {
  if (!carousel) return false;
  const versionMismatch = Number(carousel.approved_version ?? carousel.current_version ?? 1) !== Number(carousel.current_version ?? 1);
  const hashMismatch = Boolean(carousel.approved_hash) && String(carousel.approved_hash) !== String(carousel.content_hash ?? "");
  return versionMismatch || hashMismatch;
}

export async function GET(request: Request) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const daysCount = Math.min(21, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
    const start = url.searchParams.get("start") || new Date().toISOString().slice(0, 10);
    const days = makeDays(start, daysCount);
    const lastDay = days.at(-1)!;

    const [accounts, slots, carousels, ideas, slideRows] = await Promise.all([
      rows("content_accounts?select=account_id,persona_id,username,display_name,timezone,daily_target,posting_slots,enabled,posting_enabled,warmup_status&order=account_id.asc&limit=100"),
      rows(`content_slots?workspace_id=eq.cortifree&slot_date=gte.${days[0]}&slot_date=lte.${lastDay}&select=id,account_id,persona_id,slot_date,slot_time,timezone,scheduled_for,strategy,pillar_id,concept_id,format_id,topic_id,hook_id,status,idea_id,carousel_id,source,metadata&order=scheduled_for.asc&limit=3000`),
      rows("carousels?workspace_id=eq.cortifree&status=neq.ARCHIVED&select=id,account_id,persona_id,topic,content_type,status,review_status,approved_at,approved_version,approved_hash,content_hash,current_version,scheduled_for,calendar_slot_id,created_at,spec&order=created_at.desc&limit=2000"),
      rows("carousel_ideas?workspace_id=eq.cortifree&select=id,status,last_error,carousel_id,slot_id&order=updated_at.desc&limit=3000"),
      rows("carousel_slides?workspace_id=eq.cortifree&status=eq.CURRENT&select=carousel_id,position,rendered_url&order=position.asc&limit=5000"),
    ]);

    const covers = new Map<string, string>();
    for (const slide of slideRows) {
      const carouselId = String(slide.carousel_id ?? "");
      if (!carouselId || covers.has(carouselId)) continue;
      const renderedUrl = String(slide.rendered_url ?? "");
      if (renderedUrl) covers.set(carouselId, renderedUrl);
    }

    const accountMap = new Map(accounts.map((account) => [String(account.account_id), account]));
    const carouselMap = new Map(carousels.map((carousel) => [String(carousel.id), carousel]));
    const ideaMap = new Map(ideas.map((idea) => [String(idea.id), idea]));

    const carouselItems = carousels.map((carousel) => {
      const id = String(carousel.id);
      const account = accountMap.get(String(carousel.account_id ?? ""));
      return {
        id,
        accountId: String(carousel.account_id ?? ""),
        personaId: String(carousel.persona_id ?? account?.persona_id ?? ""),
        topic: String(carousel.topic ?? id),
        format: String(carousel.content_type ?? ""),
        status: String(carousel.status ?? ""),
        reviewStatus: String(carousel.review_status ?? ""),
        scheduledFor: carousel.scheduled_for ? String(carousel.scheduled_for) : null,
        publishedAt: null,
        postUrl: null,
        error: null,
        approvedAt: carousel.approved_at ? String(carousel.approved_at) : null,
        approvalStale: approvalStale(carousel),
        date: null,
        cover: covers.get(id) ?? null,
        slotId: carousel.calendar_slot_id ? String(carousel.calendar_slot_id) : null,
      };
    });

    const slotItems = slots.map((slot) => {
      const carouselId = slot.carousel_id ? String(slot.carousel_id) : null;
      const ideaId = slot.idea_id ? String(slot.idea_id) : null;
      const carousel = carouselId ? carouselMap.get(carouselId) : undefined;
      const idea = ideaId ? ideaMap.get(ideaId) : undefined;
      const metadata = slot.metadata && typeof slot.metadata === "object" ? slot.metadata as Row : {};
      const account = accountMap.get(String(slot.account_id ?? ""));
      return {
        slotId: String(slot.id),
        carouselId,
        ideaId,
        accountId: String(slot.account_id ?? ""),
        personaId: String(slot.persona_id ?? carousel?.persona_id ?? account?.persona_id ?? ""),
        topic: String(carousel?.topic ?? metadata.topic ?? metadata.angle ?? slot.topic_id ?? "Créneau contenu"),
        format: String(carousel?.content_type ?? slot.format_id ?? ""),
        concept: String(slot.concept_id ?? metadata.carousel_type ?? ""),
        status: String(slot.status ?? carousel?.status ?? idea?.status ?? "OPEN"),
        reviewStatus: String(carousel?.review_status ?? ""),
        strategy: String(slot.strategy ?? ""),
        scheduledFor: slot.scheduled_for ? String(slot.scheduled_for) : null,
        date: String(slot.slot_date ?? ""),
        cover: carouselId ? covers.get(carouselId) ?? null : null,
        error: idea?.last_error ? String(idea.last_error) : null,
        source: String(slot.source ?? ""),
        approvalStale: approvalStale(carousel),
      };
    });

    const personas = accounts.map((account) => {
      const accountId = String(account.account_id);
      const personaId = String(account.persona_id ?? "");
      const relevantSlots = slotItems.filter((item) => item.accountId === accountId);
      const relevantCarousels = carouselItems.filter((item) => item.accountId === accountId || (personaId && item.personaId === personaId));
      const byDay = Object.fromEntries(days.map((day) => [day, relevantSlots.filter((item) => item.date === day)]));
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
        backlog: relevantCarousels.filter((item) => item.status === "APPROVED" && !item.scheduledFor),
        byDay,
      };
    });

    const summary = {
      open: slotItems.filter((item) => item.status === "OPEN").length,
      queued: slotItems.filter((item) => item.status === "QUEUED").length,
      blockedConfig: slotItems.filter((item) => item.status === "BLOCKED_CONFIG").length,
      needsAssets: slotItems.filter((item) => item.status === "NEEDS_ASSETS").length,
      awaitingReview: slotItems.filter((item) => item.status === "READY_FOR_REVIEW").length,
      approvedBacklog: carouselItems.filter((item) => item.status === "APPROVED" && !item.scheduledFor).length,
      planned: slotItems.filter((item) => item.status === "PLANNED").length,
      failed: slotItems.filter((item) => ["FAILED","MISSED"].includes(item.status)).length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: "content_slots",
      start: days[0],
      days,
      summary,
      personas,
      slots: slotItems,
      items: carouselItems,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
