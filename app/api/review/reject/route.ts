import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { planReviewRevision, recordReviewEvent, rejectCarousel } from "../../../lib/human-review";
import { enqueueWorkerJob } from "../../../lib/worker-queue";
import { reviewReasonLabel, type RejectionAction } from "../../../lib/review-reasons";
import { dataBackend } from "../../../lib/data-backend";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as {
      carouselId?: string;
      reason?: string;
      reasonCode?: string;
      action?: RejectionAction;
      actor?: string;
    };
    const carouselId = body.carouselId?.trim();
    if (!carouselId) return NextResponse.json({ error: "carouselId is required" }, { status: 400 });
    const action: RejectionAction = body.action === "REVISION" ? "REVISION" : "ARCHIVE";
    const reasonCode = body.reasonCode?.trim() || "OTHER";
    const reason = body.reason?.trim() || reviewReasonLabel(reasonCode);
    const actor = body.actor?.trim() || "admin";

    const rejected = await rejectCarousel(carouselId, reason, actor, { reasonCode, action });
    if (action !== "REVISION") return NextResponse.json(rejected);

    const currentResponse = await dataBackend(
      `carousels?id=eq.${encodeURIComponent(carouselId)}&workspace_id=eq.cortifree&select=current_version&limit=1`,
    );
    if (!currentResponse.ok) throw new Error(await currentResponse.text());
    const current = (await currentResponse.json() as Array<{ current_version?: number }>)[0];
    if (!current) return NextResponse.json({ error: "Carousel not found" }, { status: 404 });

    const feedback = `Reason: ${reviewReasonLabel(reasonCode)}. ${reason}`;
    const revision = await planReviewRevision(carouselId, feedback);
    await recordReviewEvent({
      carouselId,
      eventType: "REVISION_QUEUED_AFTER_REJECTION",
      actor,
      feedback,
      patchPlan: { ...revision, rejection_reason_code: reasonCode },
      beforeVersion: Number(current.current_version ?? 1),
    });
    const queued = await enqueueWorkerJob({
      kind: "APPLY_REVIEW_PATCH",
      resourceId: carouselId,
      idempotencyKey: `rejected-revision:${carouselId}:${Date.now()}`,
      payload: { feedback, actor, revision },
      priority: 200,
      maxAttempts: 2,
    });
    return NextResponse.json({ ...rejected, queued: true, revision: revision.summary, job: queued.job }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
