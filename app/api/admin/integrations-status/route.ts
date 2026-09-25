import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { dataBackend } from "../../../lib/data-backend";
import { getLocalIntegrationHealth } from "../../../lib/integration-health";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [heartbeats, accounts, jobs, snapshots, telegramEvents] = await Promise.all([
      rows("worker_heartbeats?workspace_id=eq.cortifree&select=worker_id,version,last_seen_at,capabilities&order=last_seen_at.desc&limit=1"),
      rows("accounts?select=account_id,active,enabled,posting_enabled,warmup_status,upload_post_profile&limit=200"),
      rows("publish_jobs?workspace_id=eq.cortifree&select=id,status&limit=500"),
      rows("analytics_snapshots?workspace_id=eq.cortifree&select=id,captured_at&order=captured_at.desc&limit=500"),
      rows("system_logs?stage=like.TELEGRAM_%25&select=id,stage,created_at&order=created_at.desc&limit=20"),
    ]);

    const counts = jobs.reduce<Record<string, number>>((acc, row) => {
      const status = String(row.status ?? "UNKNOWN");
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      local: getLocalIntegrationHealth(),
      worker: heartbeats[0] ?? null,
      accounts: {
        total: accounts.length,
        postingEnabled: accounts.filter((row) => row.posting_enabled === true).length,
        warmupActive: accounts.filter((row) => row.warmup_status === "ACTIVE").length,
        uploadPostMapped: accounts.filter((row) => Boolean(String(row.upload_post_profile ?? "").trim())).length,
      },
      publishing: {
        jobs: counts,
        analyticsSnapshots: snapshots.length,
        latestAnalyticsAt: snapshots[0]?.captured_at ?? null,
      },
      telegram: {
        eventCount: telegramEvents.length,
        latestEvent: telegramEvents[0] ?? null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      local: getLocalIntegrationHealth(),
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
