import { syncEditorialSheetToConvex } from "../../../lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../../../lib/sync/drive";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.CORTIFREE_ADMIN_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret || request.headers.get("x-admin-token") === secret;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || process.env.GOOGLE_DRIVE_SYNC_BATCH || 40);
  const offset = Number(url.searchParams.get("offset") || 0);
  const scope = url.searchParams.get("scope") || "all";
  try {
    const editorial = await syncEditorialSheetToConvex();
    if (scope === "sheet") return Response.json({ ok: true, editorial, synced_at: new Date().toISOString() });
    const drive = await syncGoogleDriveToConvex({ limit, offset, scope: scope === "visual_refs" || scope === "assets" ? scope : "all" });
    return Response.json({ ok: true, editorial, drive, synced_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
