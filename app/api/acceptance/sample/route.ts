import { z } from "zod";
import { enqueueWorkerJob } from "../../../lib/worker-queue";
import { ACTIVE_FORMAT_IDS } from "../../../../src/content/formats";

export const runtime = "nodejs";

// Queues a dry-run acceptance sample on the external worker: one idea per
// requested format, generated, rendered and QA'd by the same processor as the
// daily autonomy run. Nothing is approved or published. Access is limited to
// allowlisted dashboard sessions by the middleware.
const bodySchema = z.object({
  formatIds: z.array(z.enum(ACTIVE_FORMAT_IDS)).min(1).max(ACTIVE_FORMAT_IDS.length).optional(),
  batchId: z.string().regex(/^[A-Z0-9_]{3,60}$/).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid sample request", details: parsed.error.issues }, { status: 400 });
  const formatIds = parsed.data.formatIds ?? [...ACTIVE_FORMAT_IDS];
  const batchId = parsed.data.batchId ?? `E2E_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  // One sample per batch id, so a double click does not pay for two batches.
  const queued = await enqueueWorkerJob({
    kind: "ACCEPTANCE_SAMPLE",
    resourceId: batchId,
    idempotencyKey: `acceptance-sample:${batchId}`,
    payload: { batch_id: batchId, format_ids: formatIds, limit: formatIds.length },
    priority: 20,
    maxAttempts: 1,
  });
  return Response.json({ ok: true, batchId, formatIds, job: queued.job, reused: queued.reused }, { status: 202 });
}
