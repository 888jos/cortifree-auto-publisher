import { z } from "zod";
import { dataBackend } from "../../../lib/data-backend";
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

async function rows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Array<Record<string, unknown>>;
}

// Progress of one sample: the worker job (with its result) and the batch's ideas.
export async function GET(request: Request) {
  const batchId = new URL(request.url).searchParams.get("batchId") ?? "";
  if (!/^[A-Z0-9_]{3,60}$/.test(batchId)) return Response.json({ error: "Invalid batchId" }, { status: 400 });
  const [jobs, ideas] = await Promise.all([
    rows(`worker_jobs?workspace_id=eq.cortifree&idempotency_key=eq.${encodeURIComponent(`acceptance-sample:${batchId}`)}&select=id,status,attempts,last_error,result,started_at,finished_at&limit=1`),
    rows(`carousel_ideas?workspace_id=eq.cortifree&acceptance_batch_id=eq.${encodeURIComponent(batchId)}&select=*&order=created_at.asc&limit=50`),
  ]);
  return Response.json({
    batchId,
    job: jobs[0] ?? null,
    ideas: ideas.map((idea) => ({
      id: idea.id, format: idea.content_type ?? idea.format_id, persona: idea.persona_id, status: idea.status,
      render_status: idea.render_status, carousel_id: idea.carousel_id, last_error: idea.last_error, updated_at: idea.updated_at,
    })),
  });
}
