import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { dataBackend } from "../../../lib/data-backend";
import { getLocalIntegrationHealth } from "../../../lib/integration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(`${resource}: ${await response.text()}`);
  return await response.json() as Row[];
}

function countBy(items: Row[], field: string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = String(item[field] ?? "UNKNOWN");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const [accounts, carousels, publishJobs, assets, heartbeats, workerJobs, imageJobs, usage, snapshots] = await Promise.all([
      rows("content_accounts?workspace_id=eq.cortifree&select=account_id,persona_id,enabled,posting_enabled,warmup_status,daily_target,ready_buffer_days&limit=200"),
      rows("carousels?workspace_id=eq.cortifree&select=id,account_id,persona_id,status,review_status,scheduled_for,created_at,updated_at&limit=2000"),
      rows(`publish_jobs?workspace_id=eq.cortifree&select=id,carousel_id,account_id,status,scheduled_at,published_at,updated_at,last_error&updated_at=gte.${encodeURIComponent(sevenDaysAgo)}&order=updated_at.desc&limit=2000`),
      rows("assets?workspace_id=eq.cortifree&enabled=eq.true&select=id,persona_id,source_type,category&limit=5000"),
      rows("worker_heartbeats?workspace_id=eq.cortifree&select=worker_id,version,last_seen_at,metadata&order=last_seen_at.desc&limit=1"),
      rows("worker_jobs?workspace_id=eq.cortifree&select=id,kind,status,attempts,created_at,updated_at,last_error&order=created_at.desc&limit=500"),
      rows("image_generation_jobs?workspace_id=eq.cortifree&select=id,status,persona_id,created_at,finished_at,last_error&order=created_at.desc&limit=500"),
      rows(`ai_usage_logs?workspace_id=eq.cortifree&select=provider,estimated_cost_usd,created_at&created_at=gte.${encodeURIComponent(sevenDaysAgo)}&limit=5000`),
      rows(`analytics_snapshots?workspace_id=eq.cortifree&select=carousel_id,account_id,views,performance_score,post_url,captured_at&captured_at=gte.${encodeURIComponent(sevenDaysAgo)}&order=captured_at.desc&limit=5000`),
    ]);

    const activeStatuses = new Set(["DRAFT", "READY_FOR_REVIEW", "APPROVED", "SCHEDULED"]);
    const publishSuccess = publishJobs.filter((job) => ["PUBLISHED", "POSTED", "SUCCESS"].includes(String(job.status)));
    const publishFailed = publishJobs.filter((job) => String(job.status) === "FAILED");
    const postsToday = publishJobs.filter((job) => String(job.scheduled_at ?? "").startsWith(today));
    const latestHeartbeat = heartbeats[0] ?? null;
    const heartbeatAgeSeconds = latestHeartbeat
      ? Math.max(0, Math.round((now.getTime() - Date.parse(String(latestHeartbeat.last_seen_at))) / 1000))
      : null;
    const activeQueue = [...workerJobs, ...imageJobs].filter((job) => ["PENDING", "RETRY", "RUNNING"].includes(String(job.status)));
    const oldestQueueAgeSeconds = activeQueue.length
      ? Math.max(...activeQueue.map((job) => Math.max(0, Math.round((now.getTime() - Date.parse(String(job.created_at))) / 1000))))
      : null;
    const recentFailures = [...workerJobs, ...imageJobs].filter((job) => String(job.status) === "FAILED").slice(0, 10);
    const integration = getLocalIntegrationHealth();

    const buffers = accounts.map((account) => {
      const accountId = String(account.account_id ?? "");
      const ready = carousels.filter((carousel) => carousel.account_id === accountId && activeStatuses.has(String(carousel.status))).length;
      const dailyTarget = Math.max(1, Number(account.daily_target ?? 1));
      return { accountId, personaId: account.persona_id, ready, days: Number((ready / dailyTarget).toFixed(1)), targetDays: Number(account.ready_buffer_days ?? 3) };
    });

    const generatedByPersona = new Map<string, number>();
    for (const asset of assets) {
      if (asset.source_type !== "persona_generated" || !asset.persona_id) continue;
      const id = String(asset.persona_id);
      generatedByPersona.set(id, (generatedByPersona.get(id) ?? 0) + 1);
    }
    const personaAssetsUnderThreshold = [...new Set(accounts.map((account) => String(account.persona_id ?? "")).filter(Boolean))]
      .map((personaId) => ({ personaId, count: generatedByPersona.get(personaId) ?? 0, threshold: 20 }))
      .filter((item) => item.count < item.threshold)
      .sort((a, b) => a.count - b.count);

    const latestSnapshotByCarousel = new Map<string, Row>();
    for (const snapshot of snapshots) {
      const id = String(snapshot.carousel_id ?? "");
      if (id && !latestSnapshotByCarousel.has(id)) latestSnapshotByCarousel.set(id, snapshot);
    }
    const latestSnapshots = [...latestSnapshotByCarousel.values()];
    const topCarousels = latestSnapshots
      .sort((a, b) => Number(b.views ?? 0) - Number(a.views ?? 0))
      .slice(0, 5)
      .map((item) => ({ carouselId: item.carousel_id, accountId: item.account_id, views: Number(item.views ?? 0), score: Number(item.performance_score ?? 0), postUrl: item.post_url ?? null }));

    const alerts = [
      ...(heartbeatAgeSeconds === null || heartbeatAgeSeconds > 600 ? [{ code: "WORKER_HEARTBEAT", severity: "critical", message: "Worker heartbeat absent for more than 10 minutes" }] : []),
      ...(oldestQueueAgeSeconds !== null && oldestQueueAgeSeconds > 900 ? [{ code: "QUEUE_AGING", severity: "critical", message: "Oldest queued job is more than 15 minutes old" }] : []),
      ...(recentFailures.length >= 3 ? [{ code: "CONSECUTIVE_FAILURES", severity: "critical", message: "At least 3 recent jobs are failed" }] : []),
      ...(!integration.uploadPost.configured ? [{ code: "UPLOAD_POST_DOWN", severity: "critical", message: "Upload-Post is not configured in this runtime" }] : []),
      ...buffers.filter((item) => item.days < item.targetDays).map((item) => ({ code: "BUFFER_LOW", severity: "warning", message: `${item.accountId}: ${item.days} day(s) ready, target ${item.targetDays}` })),
    ];

    const costByProvider = usage.reduce<Record<string, number>>((totals, row) => {
      const provider = String(row.provider ?? "unknown");
      totals[provider] = Number(((totals[provider] ?? 0) + Number(row.estimated_cost_usd ?? 0)).toFixed(4));
      return totals;
    }, {});

    return NextResponse.json({
      ok: true,
      checkedAt: now.toISOString(),
      posts: {
        today: postsToday.length,
        publishedToday: postsToday.filter((job) => ["PUBLISHED", "POSTED", "SUCCESS"].includes(String(job.status))).length,
        failedToday: postsToday.filter((job) => String(job.status) === "FAILED").length,
        successRate7d: publishSuccess.length + publishFailed.length ? Math.round(1000 * publishSuccess.length / (publishSuccess.length + publishFailed.length)) / 10 : null,
        byStatus7d: countBy(publishJobs, "status"),
      },
      worker: { latest: latestHeartbeat, heartbeatAgeSeconds, oldestQueueAgeSeconds, activeQueue: activeQueue.length, recentFailures },
      buffers,
      personaAssetsUnderThreshold,
      costs7d: costByProvider,
      analytics: { views7d: latestSnapshots.reduce((sum, item) => sum + Number(item.views ?? 0), 0), topCarousels },
      accountsInError: accounts.filter((account) => account.warmup_status === "ERROR" || account.enabled === false).map((account) => ({ accountId: account.account_id, personaId: account.persona_id, status: account.warmup_status })),
      alerts,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
