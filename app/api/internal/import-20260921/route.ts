import { backendMode } from "../../../lib/data-backend";
import { syncGoogleDriveToConvex } from "../../../lib/sync/drive";

export const runtime = "nodejs";
export const maxDuration = 300;

// One-shot canonical import bridge for the 2026-09-21 asset batch.
// It is intentionally parameter-free and refuses to run unless production
// is using Supabase, so it cannot be used to push this batch into Convex.
export async function GET() {
  if (backendMode() !== "supabase") {
    return Response.json({ ok: false, error: "Supabase runtime required" }, { status: 409 });
  }

  try {
    const visualRefs = await syncGoogleDriveToConvex({
      scope: "visual_refs_missing",
      limit: 100,
      offset: 0,
    });
    const stock = await syncGoogleDriveToConvex({
      scope: "stock_missing",
      limit: 100,
      offset: 0,
    });
    return Response.json({
      ok: true,
      backend: backendMode(),
      visual_refs: visualRefs,
      stock,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
