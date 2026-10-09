import { NextResponse } from "next/server";
import { isOperatorRequest } from "../../lib/admin-auth";
import { dataBackend } from "../../lib/data-backend";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export async function GET(request: Request) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "AWAITING_REVIEW";
    const persona = url.searchParams.get("persona")?.trim() || "";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    const all = await rows(
      "carousels?workspace_id=eq.cortifree&select=id,account_id,persona_id,topic,angle,content_type,status,review_status,review_notes,current_version,revision_count,approved_version,approved_at,rejected_at,rejection_reason_code,rejection_action,scheduled_for,caption,created_at&order=created_at.desc&limit=1000",
    );
    const operational = all.filter((row) => String(row.status ?? "") !== "ARCHIVED");
    const summary = operational.reduce<Record<string, number>>((totals, row) => {
      const key = String(row.review_status ?? "UNKNOWN");
      totals[key] = (totals[key] ?? 0) + 1;
      return totals;
    }, {});

    const queue = operational
      .filter((row) => String(row.review_status ?? "") === status)
      .filter((row) => status !== "AWAITING_REVIEW" || String(row.status ?? "") === "READY_FOR_REVIEW")
      .filter((row) => !persona || String(row.persona_id ?? "") === persona)
      // Soonest publication first; unplanned drafts after, newest first.
      .sort((left, right) => {
        const l = left.scheduled_for ? Date.parse(String(left.scheduled_for)) : Number.POSITIVE_INFINITY;
        const r = right.scheduled_for ? Date.parse(String(right.scheduled_for)) : Number.POSITIVE_INFINITY;
        return l - r || String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
      })
      .slice(0, limit);
    const ids = new Set(queue.map((row) => String(row.id)));
    const slideRows = ids.size
      ? await rows("carousel_slides?workspace_id=eq.cortifree&status=eq.CURRENT&select=carousel_id,position,rendered_url&order=position.asc&limit=5000")
      : [];
    const slidesByCarousel = new Map<string, Array<{ position: number; url: string }>>();
    for (const slide of slideRows) {
      const carouselId = String(slide.carousel_id ?? "");
      if (!ids.has(carouselId)) continue;
      const renderedUrl = String(slide.rendered_url ?? "");
      if (!renderedUrl) continue;
      const current = slidesByCarousel.get(carouselId) ?? [];
      current.push({ position: Number(slide.position ?? current.length + 1), url: renderedUrl });
      slidesByCarousel.set(carouselId, current);
    }

    return NextResponse.json({
      status,
      summary,
      carousels: queue.map((row) => ({
        ...row,
        slides: (slidesByCarousel.get(String(row.id)) ?? []).sort((a,b) => a.position - b.position),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
