import { dataBackend } from "./data-backend";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";

export type HeavyJobKind = "HEALTHCHECK" | "APPLY_REVIEW_PATCH" | "SCHEDULE_APPROVED_POST" | "RENDER_CAROUSEL" | "GOOGLE_SYNC" | "PERSONA_ASSET_ARCHIVE" | "MODELARK_ORPHAN_RECOVERY" | "AUTONOMY_RUN";
export type HeavyExecutionMode = "auto" | "inline" | "external";

export type WorkerJob = {
  id: string;
  kind: HeavyJobKind;
  resource_id?: string | null;
  idempotency_key?: string | null;
  payload: Record<string, unknown>;
  status: "PENDING" | "RUNNING" | "RETRY" | "DONE" | "FAILED" | "CANCELLED";
  priority: number;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  worker_id?: string | null;
  locked_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
};

export function heavyExecutionMode(): HeavyExecutionMode {
  const value = process.env.HEAVY_EXECUTION_MODE?.trim().toLowerCase();
  return value === "inline" || value === "external" ? value : "auto";
}

function cutoffIso(maxAgeSeconds: number) {
  return new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
}

export async function hasActiveHeavyWorker(maxAgeSeconds = 90) {
  try {
    const response = await dataBackend(
      `worker_heartbeats?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&last_seen_at=gte.${encodeURIComponent(cutoffIso(maxAgeSeconds))}&select=worker_id,last_seen_at&order=last_seen_at.desc&limit=1`,
    );
    if (!response.ok) return false;
    const rows = await response.json() as Array<{ worker_id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function shouldDelegateHeavyWork() {
  const mode = heavyExecutionMode();
  if (mode === "inline") return false;
  if (mode === "external") return true;
  return hasActiveHeavyWorker();
}

export async function enqueueWorkerJob(input: {
  kind: HeavyJobKind;
  resourceId?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
}) {
  if (input.idempotencyKey) {
    const existing = await dataBackend(
      `worker_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&status=in.(PENDING,RUNNING,RETRY,DONE,FAILED)&select=*&order=created_at.desc&limit=1`,
    );
    if (existing.ok) {
      const rows = await existing.json() as WorkerJob[];
      if (rows[0]) {
        if (rows[0].status === "FAILED") {
          const retry = await dataBackend(`worker_jobs?id=eq.${encodeURIComponent(rows[0].id)}&status=eq.FAILED`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ status: "RETRY", worker_id: null, locked_at: null, finished_at: null, last_error: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
          });
          if (!retry.ok) throw new Error(`Cannot retry ${input.kind}: ${await retry.text()}`);
          const retried = await retry.json() as WorkerJob[];
          if (retried[0]) return { job: retried[0], reused: true };
        }
        return { job: rows[0], reused: true };
      }
    }
  }

  const response = await dataBackend("worker_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      workspace_id: CORTIFREE_WORKSPACE_ID,
      kind: input.kind,
      resource_id: input.resourceId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      payload: input.payload ?? {},
      status: "PENDING",
      priority: input.priority ?? 0,
      attempts: 0,
      max_attempts: input.maxAttempts ?? 3,
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Cannot enqueue ${input.kind}: ${await response.text()}`);
  const rows = await response.json() as WorkerJob[];
  if (!rows[0]) throw new Error(`Cannot enqueue ${input.kind}: no job returned`);
  return { job: rows[0], reused: false };
}
