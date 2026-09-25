import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { enqueueWorkerJob } from "../../../lib/worker-queue";
import { dataBackend } from "../../../lib/data-backend";
import { planReviewRevision, recordReviewEvent } from "../../../lib/human-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { carouselId?: string; feedback?: string; actor?: string };
    const carouselId = body.carouselId?.trim();
    const feedback = body.feedback?.trim();
    const actor = body.actor?.trim() || "admin";
    if (!carouselId) return NextResponse.json({ error: "carouselId is required" }, { status: 400 });
    if (!feedback) return NextResponse.json({ error: "feedback is required" }, { status: 400 });

    const currentResponse = await dataBackend(`carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=current_version&limit=1`);
    if (!currentResponse.ok) throw new Error(await currentResponse.text());
    const current = (await currentResponse.json() as Array<{ current_version?: number }>)[0];
    if (!current) return NextResponse.json({ error: "Carousel not found" }, { status: 404 });

    const revision = await planReviewRevision(carouselId, feedback);
    await recordReviewEvent({
      carouselId, eventType: "REVISION_QUEUED", actor, feedback,
      patchPlan: revision,
      beforeVersion: Number(current.current_version ?? 1),
    });

    const queued = await enqueueWorkerJob({
      kind: "APPLY_REVIEW_PATCH",
      resourceId: carouselId,
      idempotencyKey: `review:${carouselId}:${Date.now()}`,
      payload: { feedback, actor, revision },
      priority: 200,
      maxAttempts: 2,
    });
    return NextResponse.json({ queued: true, job: queued.job, reused: queued.reused }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
