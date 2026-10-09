import { NextResponse } from "next/server";
import { isOperatorRequest } from "../../../lib/admin-auth";
import { dataBackend } from "../../../lib/data-backend";
import { recentImageProviderBlocker } from "../../../lib/image-generation";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";
import { humanReason } from "../../../lib/review-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Pill = { key: string; label: string; ok: boolean; detail: string };

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) return [];
  return await response.json() as Row[];
}

const minutesAgo = (iso: unknown) => iso ? Math.round((Date.now() - Date.parse(String(iso))) / 60_000) : null;

// One-glance pipeline health for the review screen, plus the drafts that
// could not reach review (missing assets, failed generation) so the operator
// sees what tomorrow is missing.
export async function GET(request: Request) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const [heartbeats, aiCalls, googleJobs, blocked, imageBlocker] = await Promise.all([
    rows(`worker_heartbeats?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=last_seen_at,metadata&order=last_seen_at.desc&limit=1`),
    rows(`ai_usage_logs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&operation=like.carousel.generate*&select=success,error,created_at&order=created_at.desc&limit=1`),
    rows(`worker_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&kind=eq.GOOGLE_SYNC&status=in.(DONE,FAILED)&select=status,last_error,finished_at,updated_at&order=updated_at.desc&limit=1`),
    rows(`carousel_ideas?workspace_id=eq.cortifree&status=in.(NEEDS_ASSETS,FAILED)&updated_at=gte.${encodeURIComponent(since)}&select=id,content_type,persona_id,account_id,status,last_error,updated_at&order=updated_at.desc&limit=30`),
    recentImageProviderBlocker(120).catch(() => null),
  ]);

  const worker = heartbeats[0];
  const workerAge = minutesAgo(worker?.last_seen_at);
  const workerMeta = (worker?.metadata ?? {}) as Row;
  const ai = aiCalls[0];
  const google = googleJobs[0];
  const dryRun = process.env.DRY_RUN !== "false";
  const pills: Pill[] = [
    { key: "worker", label: "Worker", ok: workerAge !== null && workerAge < 3, detail: workerAge === null ? "aucun signal" : workerAge < 3 ? "en ligne" : `silencieux depuis ${workerAge} min` },
    { key: "openai", label: "Textes (OpenAI)", ok: !ai || ai.success === true, detail: !ai ? "pas encore utilisé" : ai.success ? "dernière génération OK" : String(ai.error ?? "échec").slice(0, 120) },
    { key: "images", label: "Images (ModelArk)", ok: !imageBlocker, detail: imageBlocker ? "compte bloqué (solde impayé)" : "disponible" },
    { key: "publish", label: "Publication", ok: !dryRun && workerMeta.upload_post_configured === true, detail: dryRun ? "mode test (rien n'est publié)" : workerMeta.upload_post_configured ? "Upload-Post connecté" : "clé Upload-Post absente" },
    { key: "google", label: "Sheet & Drive", ok: google?.status === "DONE", detail: !google ? "jamais synchronisé" : google.status === "DONE" ? `synchro il y a ${Math.round((minutesAgo(google.finished_at ?? google.updated_at) ?? 0) / 60)} h` : String(google.last_error ?? "échec").slice(0, 120) },
  ];

  return NextResponse.json({
    pills,
    blocked: blocked.map((row) => ({
      id: row.id, format: row.content_type, persona: row.persona_id, account: row.account_id,
      status: row.status, reason: humanReason(String(row.last_error ?? "")), updatedAt: row.updated_at,
    })),
  });
}
