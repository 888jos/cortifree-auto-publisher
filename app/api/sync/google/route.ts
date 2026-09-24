import { syncEditorialSheetToConvex } from "../../../lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../../../lib/sync/drive";
import { enqueueWorkerJob, shouldDelegateHeavyWork } from "../../../lib/worker-queue";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.CORTIFREE_ADMIN_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret || request.headers.get("x-admin-token") === secret || request.headers.get("x-admin-password") === process.env.CORTIFREE_ADMIN_PASSWORD;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || process.env.GOOGLE_DRIVE_SYNC_BATCH || 40);
  const offset = Number(url.searchParams.get("offset") || 0);
  const scope = url.searchParams.get("scope") || "all";
  const personaId = url.searchParams.get("persona_id")?.trim().toUpperCase() || undefined;
  if (personaId && !/^P\d{2}$/.test(personaId)) return Response.json({ ok: false, error: "Invalid persona_id; expected P01..P16" }, { status: 400 });
  try {
    if (await shouldDelegateHeavyWork()) {
      const bucket = new Date().toISOString().slice(0, 13);
      const queued = await enqueueWorkerJob({
        kind: "GOOGLE_SYNC",
        resourceId: personaId ?? scope,
        idempotencyKey: `google-sync:${scope}:${personaId ?? "all"}:${offset}:${limit}:${bucket}`,
        payload: { scope, limit, offset, persona_id: personaId ?? null },
        priority: 10,
      });
      return Response.json({ ok: true, queued: true, job: queued.job, reused: queued.reused, execution: "external_worker" }, { status: 202 });
    }
    const editorial = scope === "all" || scope === "sheet"
      ? await syncEditorialSheetToConvex()
      : { status: "SKIPPED", reason: "Drive-only scope; canonical editorial mirror unchanged" };
    if (scope === "sheet") return Response.json({ ok: true, editorial, synced_at: new Date().toISOString() });
    const drive = await syncGoogleDriveToConvex({ limit, offset, personaId, scope: scope === "visual_refs" || scope === "visual_refs_missing" || scope === "assets" || scope === "stock" || scope === "stock_missing" ? scope : "all" });
    return Response.json({ ok: true, editorial, drive, synced_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
