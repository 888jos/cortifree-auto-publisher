import os from "node:os";
import { dataBackend } from "../../app/lib/data-backend";
import { processImageGenerationJob } from "../../app/lib/image-generation";
import { renderCarousel } from "../../app/lib/render-carousel";
import { syncEditorialSheetToConvex } from "../../app/lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../../app/lib/sync/drive";
import { syncPersonaGeneratedAssetsToDrive } from "../../app/lib/sync/persona-assets";
import { CORTIFREE_WORKSPACE_ID } from "../../app/lib/workspace";
import type { WorkerJob } from "../../app/lib/worker-queue";
import { runScheduler } from "../autonomy/scheduler";
import { processQueuedIdeas, retryPendingRenders } from "../autonomy/processor";
import { refillPersonaCaches, processPendingImageJobs } from "../autonomy/image-cache";
import { refreshPublishStatuses, refreshPostAnalytics, queueWinnerVariants } from "../autonomy/performance";
import { autoScheduleApproved } from "../autonomy/publishing";

type Row = Record<string, unknown>;

const WORKER_ID = process.env.CORTIFREE_WORKER_ID?.trim() || `${os.hostname()}-${process.pid}`;
const VERSION = process.env.CORTIFREE_WORKER_VERSION?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "dev";
const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_MS ?? 2_000));
const STALE_MS = Math.max(60_000, Number(process.env.WORKER_STALE_MS ?? 15 * 60_000));
const MAX_GENERIC_PER_TICK = Math.max(1, Math.min(10, Number(process.env.WORKER_GENERIC_BATCH ?? 2)));
const MAX_IMAGE_PER_TICK = Math.max(1, Math.min(6, Number(process.env.WORKER_IMAGE_BATCH ?? 2)));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rows<T extends Row = Row>(resource: string): Promise<T[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as T[];
}

async function patch<T extends Row = Row>(resource: string, body: Row): Promise<T[]> {
  const response = await dataBackend(resource, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as T[];
}

async function heartbeat() {
  const response = await dataBackend("worker_heartbeats?on_conflict=worker_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      worker_id: WORKER_ID,
      workspace_id: CORTIFREE_WORKSPACE_ID,
      version: VERSION,
      capabilities: ["RENDER_CAROUSEL", "GOOGLE_SYNC", "PERSONA_ASSET_ARCHIVE", "AUTONOMY_RUN", "MODELARK"],
      last_seen_at: new Date().toISOString(),
      metadata: { hostname: os.hostname(), pid: process.pid },
    }),
  });
  if (!response.ok) throw new Error(`heartbeat failed: ${await response.text()}`);
}

function due(nextAttemptAt: unknown) {
  const at = Date.parse(String(nextAttemptAt ?? ""));
  return !Number.isFinite(at) || at <= Date.now();
}

function stale(lockedAt: unknown) {
  const at = Date.parse(String(lockedAt ?? ""));
  return Number.isFinite(at) && at < Date.now() - STALE_MS;
}

async function recoverStaleJobs() {
  const generic = await rows<WorkerJob>("worker_jobs?workspace_id=eq.cortifree&status=eq.RUNNING&select=*&limit=100");
  for (const job of generic.filter((item) => stale(item.locked_at))) {
    await patch(`worker_jobs?id=eq.${encodeURIComponent(job.id)}&status=eq.RUNNING`, {
      status: "RETRY",
      worker_id: null,
      locked_at: null,
      next_attempt_at: new Date().toISOString(),
      last_error: "Recovered stale worker lock",
    });
  }

  const imageJobs = await rows("image_generation_jobs?workspace_id=eq.cortifree&status=eq.RUNNING&select=id,locked_at&limit=100");
  for (const job of imageJobs.filter((item) => stale(item.locked_at))) {
    await patch(`image_generation_jobs?id=eq.${encodeURIComponent(String(job.id))}&status=eq.RUNNING`, {
      status: "RETRY",
      worker_id: null,
      locked_at: null,
      next_attempt_at: new Date().toISOString(),
      last_error: "Recovered stale worker lock",
    });
  }
}

async function claimWorkerJob() {
  const candidates = await rows<WorkerJob>(
    "worker_jobs?workspace_id=eq.cortifree&status=in.(PENDING,RETRY)&select=*&order=priority.desc&limit=20",
  );
  for (const candidate of candidates.filter((item) => due(item.next_attempt_at))) {
    const claimed = await patch<WorkerJob>(
      `worker_jobs?id=eq.${encodeURIComponent(candidate.id)}&status=in.(PENDING,RETRY)`,
      {
        status: "RUNNING",
        worker_id: WORKER_ID,
        locked_at: new Date().toISOString(),
        started_at: candidate.started_at ?? new Date().toISOString(),
        attempts: Number(candidate.attempts ?? 0) + 1,
        last_error: null,
      },
    );
    if (claimed[0]) return claimed[0];
  }
  return null;
}

async function claimImageJob() {
  const candidates = await rows(
    "image_generation_jobs?workspace_id=eq.cortifree&status=in.(PENDING,RETRY)&select=*&order=priority.desc&limit=20",
  );
  for (const candidate of candidates.filter((item) => due(item.next_attempt_at))) {
    const id = String(candidate.id);
    const claimed = await patch(
      `image_generation_jobs?id=eq.${encodeURIComponent(id)}&status=in.(PENDING,RETRY)`,
      {
        status: "RUNNING",
        worker_id: WORKER_ID,
        locked_at: new Date().toISOString(),
        started_at: candidate.started_at ?? new Date().toISOString(),
        worker_attempts: Number(candidate.worker_attempts ?? 0) + 1,
        last_error: null,
      },
    );
    if (claimed[0]) return claimed[0];
  }
  return null;
}

async function runAutonomy() {
  const result: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const errors: Record<string, string> = {};
  async function stage<T>(name: string, run: () => Promise<T>) {
    try {
      result[name] = await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors[name] = message;
      result[`${name}Error`] = message;
    }
  }
  await stage("publishStatus", refreshPublishStatuses);
  await stage("analytics", refreshPostAnalytics);
  await stage("winnerVariants", queueWinnerVariants);
  await stage("cacheRefill", refillPersonaCaches);
  await stage("imageJobs", processPendingImageJobs);
  await stage("scheduler", runScheduler);
  await stage("drafts", processQueuedIdeas);
  await stage("rerenders", retryPendingRenders);
  await stage("publishing", autoScheduleApproved);
  result.finishedAt = new Date().toISOString();
  result.errors = errors;
  if (Object.keys(errors).length) throw new Error(`AUTONOMY_STAGES_FAILED:${JSON.stringify(errors)}`);
  return result;
}

async function runGoogleSync(payload: Row) {
  const scope = String(payload.scope ?? "all");
  const limit = Math.max(1, Math.min(250, Number(payload.limit ?? process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 40)));
  const offset = Math.max(0, Number(payload.offset ?? 0));
  const personaId = payload.persona_id ? String(payload.persona_id).trim().toUpperCase() : undefined;
  const editorial = scope === "all" || scope === "sheet"
    ? await syncEditorialSheetToConvex()
    : { status: "SKIPPED", reason: "Drive-only scope" };
  if (scope === "sheet") return { editorial, drive: { status: "SKIPPED" } };
  const driveScope = ["visual_refs", "visual_refs_missing", "assets", "stock", "stock_missing"].includes(scope)
    ? scope as "visual_refs" | "visual_refs_missing" | "assets" | "stock" | "stock_missing"
    : "all";
  const drive = await syncGoogleDriveToConvex({ limit, offset, personaId, scope: driveScope });
  return { editorial, drive };
}

async function runRender(resourceId: string | null | undefined) {
  const id = String(resourceId ?? "").trim();
  if (!id) throw new Error("RENDER_CAROUSEL missing resource_id");
  const carousel = (await rows(
    `carousels?workspace_id=eq.cortifree&id=eq.${encodeURIComponent(id)}&select=id,persona_id,content_type,spec&limit=1`,
  ))[0];
  if (!carousel) throw new Error(`Carousel not found: ${id}`);
  const spec = carousel.spec as Record<string, unknown>;
  const slides = Array.isArray(spec?.generated_slides) ? spec.generated_slides as any[] : [];
  if (!slides.length) throw new Error(`Carousel has no generated slides: ${id}`);
  const rendered = await renderCarousel({
    id,
    carouselType: String(spec.carousel_type ?? carousel.content_type ?? ""),
    layout: String(spec.model_id ?? spec.layout ?? "single-image"),
    personaId: carousel.persona_id ? String(carousel.persona_id) : undefined,
    slides,
    references: Array.isArray(spec.references) ? spec.references as any[] : [],
    spec,
  });
  await patch(`carousels?id=eq.${encodeURIComponent(id)}`, { status: "READY_FOR_REVIEW" });
  return { rendered: rendered.length, urls: rendered.map((slide) => slide.url) };
}

async function executeWorkerJob(job: WorkerJob) {
  if (job.kind === "RENDER_CAROUSEL") return runRender(job.resource_id);
  if (job.kind === "GOOGLE_SYNC") return runGoogleSync(job.payload ?? {});
  if (job.kind === "PERSONA_ASSET_ARCHIVE") return syncPersonaGeneratedAssetsToDrive({ execute: Boolean(job.payload?.execute) });
  if (job.kind === "AUTONOMY_RUN") return runAutonomy();
  throw new Error(`Unsupported worker job kind: ${job.kind}`);
}

async function finishWorkerJob(job: WorkerJob, result: unknown) {
  await patch(`worker_jobs?id=eq.${encodeURIComponent(job.id)}&worker_id=eq.${encodeURIComponent(WORKER_ID)}`, {
    status: "DONE",
    result,
    finished_at: new Date().toISOString(),
    locked_at: null,
  });
}

async function failWorkerJob(job: WorkerJob, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
  const attempts = Number(job.attempts ?? 1);
  const maxAttempts = Number(job.max_attempts ?? 3);
  const retry = attempts < maxAttempts;
  const delaySeconds = Math.min(900, 15 * 2 ** Math.max(0, attempts - 1));
  await patch(`worker_jobs?id=eq.${encodeURIComponent(job.id)}&worker_id=eq.${encodeURIComponent(WORKER_ID)}`, {
    status: retry ? "RETRY" : "FAILED",
    last_error: message,
    next_attempt_at: retry ? new Date(Date.now() + delaySeconds * 1000).toISOString() : new Date().toISOString(),
    finished_at: retry ? null : new Date().toISOString(),
    locked_at: null,
    worker_id: retry ? null : WORKER_ID,
  });
}

async function processGenericBatch() {
  let processed = 0;
  for (; processed < MAX_GENERIC_PER_TICK; processed += 1) {
    const job = await claimWorkerJob();
    if (!job) break;
    try {
      const result = await executeWorkerJob(job);
      await finishWorkerJob(job, result);
      console.log("[worker] DONE", job.kind, job.id, job.resource_id ?? "");
    } catch (error) {
      console.error("[worker] FAILED", job.kind, job.id, error);
      await failWorkerJob(job, error);
    }
  }
  return processed;
}

async function processImageBatch() {
  let processed = 0;
  for (; processed < MAX_IMAGE_PER_TICK; processed += 1) {
    const job = await claimImageJob();
    if (!job) break;
    try {
      await processImageGenerationJob(String(job.id));
      await patch(`image_generation_jobs?id=eq.${encodeURIComponent(String(job.id))}`, {
        worker_id: WORKER_ID,
        locked_at: null,
      });
      console.log("[worker] IMAGE DONE", job.id);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
      const attempts = Number(job.worker_attempts ?? 1);
      const maxAttempts = Number(job.max_attempts ?? 3);
      const retry = attempts < maxAttempts;
      const delaySeconds = Math.min(900, 15 * 2 ** Math.max(0, attempts - 1));
      await patch(`image_generation_jobs?id=eq.${encodeURIComponent(String(job.id))}`, {
        status: retry ? "RETRY" : "FAILED",
        worker_id: retry ? null : WORKER_ID,
        locked_at: null,
        next_attempt_at: retry ? new Date(Date.now() + delaySeconds * 1000).toISOString() : new Date().toISOString(),
        last_error: message,
        finished_at: retry ? null : new Date().toISOString(),
      });
      console.error("[worker] IMAGE FAILED", job.id, error);
    }
  }
  return processed;
}

function assertWorkerConfiguration() {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.MODELARK_API_KEY) missing.push("MODELARK_API_KEY");
  if (!process.env.MODELARK_MODEL_ID) missing.push("MODELARK_MODEL_ID");

  const googleServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
    || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()
  );
  const googleUserOAuth = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  );
  if (!googleServiceAccount && !googleUserOAuth) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (or GOOGLE_SERVICE_ACCOUNT_JSON / Google OAuth credentials)");
  }

  if (missing.length) {
    throw new Error(`WORKER_CONFIG_INCOMPLETE:${missing.join(",")}`);
  }
}

async function main() {
  console.log("[worker] starting", { workerId: WORKER_ID, version: VERSION, pollMs: POLL_MS });
  assertWorkerConfiguration();
  await heartbeat();
  await recoverStaleJobs();
  let lastHeartbeat = 0;
  let lastRecovery = 0;

  while (true) {
    const now = Date.now();
    if (now - lastHeartbeat > 30_000) {
      await heartbeat();
      lastHeartbeat = now;
    }
    if (now - lastRecovery > 5 * 60_000) {
      await recoverStaleJobs();
      lastRecovery = now;
    }

    const generic = await processGenericBatch();
    const images = await processImageBatch();
    if (generic === 0 && images === 0) await sleep(POLL_MS);
  }
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
