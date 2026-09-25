import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { approveCarousel } from "../../../lib/human-review";
import { enqueueWorkerJob } from "../../../lib/worker-queue";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { carouselId?: string; actor?: string };
    if (!body.carouselId) return NextResponse.json({ error: "carouselId is required" }, { status: 400 });
    const approved = await approveCarousel(body.carouselId, body.actor ?? "admin");
    const queued = await enqueueWorkerJob({ kind: "SCHEDULE_APPROVED_POST", resourceId: body.carouselId, idempotencyKey: `schedule-approved:${body.carouselId}`, payload: { approvedAt: new Date().toISOString() }, priority: 150, maxAttempts: 3 });
    return NextResponse.json({ ...approved, schedulingJob: queued.job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
