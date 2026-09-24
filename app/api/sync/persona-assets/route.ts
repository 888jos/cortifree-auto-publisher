import { syncPersonaGeneratedAssetsToDrive } from "../../../lib/sync/persona-assets";
import { enqueueWorkerJob, shouldDelegateHeavyWork } from "../../../lib/worker-queue";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.CORTIFREE_ADMIN_SECRET;
  return Boolean(secret && (
    request.headers.get("authorization") === `Bearer ${secret}`
    || request.headers.get("x-cron-secret") === secret
    || request.headers.get("x-admin-token") === secret
    || request.headers.get("x-admin-password") === process.env.CORTIFREE_ADMIN_PASSWORD
  ));
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const execute = url.searchParams.get("execute") === "true";

  try {
    if (await shouldDelegateHeavyWork()) {
      const bucket = new Date().toISOString().slice(0, 13);
      const queued = await enqueueWorkerJob({
        kind: "PERSONA_ASSET_ARCHIVE",
        resourceId: execute ? "execute" : "audit",
        idempotencyKey: `persona-assets:${execute ? "execute" : "audit"}:${bucket}`,
        payload: { execute },
        priority: 10,
      });
      return Response.json({
        ok: true,
        queued: true,
        job: queued.job,
        reused: queued.reused,
        execution: "external_worker",
      }, { status: 202 });
    }

    const result = await syncPersonaGeneratedAssetsToDrive({ execute });
    return Response.json({ ...result, execution: "inline_fallback" });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
