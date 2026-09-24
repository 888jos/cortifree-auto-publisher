import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";
import { heavyExecutionMode, hasActiveHeavyWorker } from "../../../lib/worker-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function countsBy(rowsValue: Row[], field: string) {
  return rowsValue.reduce<Record<string, number>>((acc, row) => {
    const key = String(row[field] ?? "UNKNOWN");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function oldestPendingAgeSeconds(rowsValue: Row[]) {
  const pending = rowsValue
    .filter((row) => ["PENDING", "RETRY", "RUNNING"].includes(String(row.status)))
    .map((row) => Date.parse(String(row.created_at ?? "")))
    .filter(Number.isFinite);
  if (!pending.length) return null;
  return Math.max(0, Math.round((Date.now() - Math.min(...pending)) / 1000));
}

export async function GET() {
  try {
    const [active, heartbeats, genericJobs, imageJobs] = await Promise.all([
      hasActiveHeavyWorker(),
      rows(`worker_heartbeats?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=worker_id,version,capabilities,started_at,last_seen_at,metadata&order=last_seen_at.desc&limit=10`),
      rows(`worker_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,kind,status,attempts,max_attempts,worker_id,locked_at,last_error,created_at,updated_at&order=created_at.desc&limit=500`),
      rows(`image_generation_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,status,persona_id,worker_attempts,max_attempts,worker_id,locked_at,last_error,created_at,finished_at&order=created_at.desc&limit=500`),
    ]);

    return Response.json({
      ok: true,
      checked_at: new Date().toISOString(),
      execution_mode: heavyExecutionMode(),
      worker: {
        active,
        latest: heartbeats[0] ?? null,
        heartbeats,
      },
      queue: {
        generic: {
          total_sampled: genericJobs.length,
          by_status: countsBy(genericJobs, "status"),
          by_kind: countsBy(genericJobs, "kind"),
          oldest_active_age_seconds: oldestPendingAgeSeconds(genericJobs),
          recent_failures: genericJobs.filter((row) => row.status === "FAILED").slice(0, 10),
        },
        image_generation: {
          total_sampled: imageJobs.length,
          by_status: countsBy(imageJobs, "status"),
          oldest_active_age_seconds: oldestPendingAgeSeconds(imageJobs),
          recent_failures: imageJobs.filter((row) => row.status === "FAILED").slice(0, 10),
        },
      },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      checked_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
