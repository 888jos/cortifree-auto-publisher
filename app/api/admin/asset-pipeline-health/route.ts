import { dataBackend } from "../../../lib/data-backend";
import { readSheetObjects } from "../../../lib/google/sheets";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

function truthy(value: unknown) {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  try {
    const [assets, refs, jobs, stockSheet, refSheet] = await Promise.all([
      rows(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,filename,drive_file_id,drive_md5,source_type,persona_id,public_url,enabled,visual_tagging_schema,visual_review_status,sync_status,synced_at,source_hash,metadata&limit=2000`),
      rows(`visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,drive_file_id,category,enabled,thumbnail_url,sync_status,synced_at,source_hash,metadata&limit=1000`),
      rows(`image_generation_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,persona_id,status,visual_reference_id,master_asset_id,output_asset_id,last_error,created_at,finished_at&order=created_at.desc&limit=500`),
      readSheetObjects("08_STOCK_ASSETS", "A1:ZZ2000"),
      readSheetObjects("08_VISUAL_REFS", "A1:ZZ2000"),
    ]);

    const stock = assets.filter((row) => row.source_type === "stock");
    const masters = assets.filter((row) => row.source_type === "persona_master");
    const generated = assets.filter((row) => row.source_type === "persona_generated");

    const canonicalStock = stockSheet.filter((row) => text(row.source_type).toLowerCase() === "stock");
    const canonicalActiveStock = canonicalStock.filter((row) => truthy(row.enabled) && text(row.sync_status).toUpperCase() !== "DUPLICATE_SKIPPED");
    const duplicateStockRows = canonicalStock.filter((row) => !truthy(row.enabled) && text(row.sync_status).toUpperCase() === "DUPLICATE_SKIPPED");
    const canonicalStockByDrive = new Map<string, Row>(
      canonicalActiveStock
        .map((row) => [text(row.drive_file_id), row] as const)
        .filter(([id]) => Boolean(id)),
    );
    const runtimeStockByDrive = new Map<string, Row>(
      stock
        .map((row) => [text(row.drive_file_id), row] as const)
        .filter(([id]) => Boolean(id)),
    );
    const missingStock = [...canonicalStockByDrive.entries()]
      .filter(([id]) => !runtimeStockByDrive.has(id))
      .map(([drive_file_id, row]) => ({ drive_file_id, stock_key: row.stock_key ?? null, filename: row.filename ?? null }));
    const orphanStock = [...runtimeStockByDrive.entries()]
      .filter(([id]) => !canonicalStockByDrive.has(id))
      .map(([drive_file_id, row]) => ({ drive_file_id, id: row.id, filename: row.filename ?? null }));

    const canonicalRefs = refSheet.filter((row) => Boolean(text(row.ref_id)));
    const canonicalActiveRefs = canonicalRefs.filter((row) => truthy(row.enabled));
    const runtimeActiveRefs = refs.filter((row) => truthy(row.enabled));
    const canonicalRefIds = new Set(canonicalRefs.map((row) => text(row.ref_id)));
    const runtimeRefIds = new Set(refs.map((row) => text(row.id)));
    const missingRefs = canonicalRefs.filter((row) => truthy(row.enabled) && !runtimeRefIds.has(text(row.ref_id))).map((row) => text(row.ref_id));
    const orphanRefs = refs.filter((row) => !canonicalRefIds.has(text(row.id))).map((row) => ({ id: row.id, enabled: row.enabled }));

    const masterCounts = new Map<string, number>();
    for (const row of masters.filter((row) => truthy(row.enabled))) {
      const personaId = text(row.persona_id);
      if (personaId) masterCounts.set(personaId, (masterCounts.get(personaId) ?? 0) + 1);
    }
    const expectedPersonas = Array.from({ length: 16 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
    const missingMasters = expectedPersonas.filter((id) => !masterCounts.has(id));
    const duplicateMasters = [...masterCounts.entries()].filter(([, count]) => count > 1).map(([persona_id, count]) => ({ persona_id, count }));

    const jobCounts = jobs.reduce<Record<string, number>>((acc, row) => {
      const status = text(row.status) || "UNKNOWN";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    const stockV2 = stock.filter((row) => text(row.visual_tagging_schema).toLowerCase() === "observable_v2" && text(row.visual_review_status).toUpperCase() === "IMAGE_INSPECTED_V2");
    const stockSynced = stock.filter((row) => text(row.sync_status).toUpperCase() === "SYNCED" && Boolean(row.synced_at));
    const brokenUrls = assets.filter((row) => truthy(row.enabled) && !text(row.public_url)).map((row) => ({ id: row.id, source_type: row.source_type, filename: row.filename }));
    const generatedBroken = generated.filter((row) => truthy(row.enabled) && (!text(row.persona_id) || !text(row.public_url))).map((row) => ({ id: row.id, persona_id: row.persona_id, public_url: Boolean(row.public_url) }));

    const status = missingStock.length || missingRefs.length || missingMasters.length || duplicateMasters.length || brokenUrls.length
      ? "DEGRADED"
      : stockV2.length < canonicalActiveStock.length
        ? "NEEDS_VISION_V2"
        : "HEALTHY";

    return Response.json({
      status,
      checked_at: new Date().toISOString(),
      stock: {
        canonical_rows: canonicalStock.length,
        canonical_active_unique: canonicalActiveStock.length,
        duplicate_rows_skipped: duplicateStockRows.map((row) => ({ filename: row.filename ?? null, drive_file_id: row.drive_file_id ?? null })),
        runtime: stock.length,
        runtime_enabled: stock.filter((row) => truthy(row.enabled)).length,
        observable_v2: stockV2.length,
        synced: stockSynced.length,
        missing_runtime: missingStock,
        orphan_runtime: orphanStock,
      },
      visual_references: {
        canonical_total: canonicalRefs.length,
        canonical_active: canonicalActiveRefs.length,
        runtime_total: refs.length,
        runtime_active: runtimeActiveRefs.length,
        missing_active_runtime: missingRefs,
        orphan_runtime: orphanRefs,
      },
      personas: {
        expected: expectedPersonas.length,
        masters_enabled: masters.filter((row) => truthy(row.enabled)).length,
        covered_personas: masterCounts.size,
        missing_masters: missingMasters,
        duplicate_masters: duplicateMasters,
        generated_total: generated.length,
        generated_broken: generatedBroken,
      },
      modelark_jobs: {
        total_checked: jobs.length,
        by_status: jobCounts,
        failed_recent: jobs.filter((row) => text(row.status) === "FAILED").slice(0, 20).map((row) => ({
          id: row.id,
          persona_id: row.persona_id,
          visual_reference_id: row.visual_reference_id,
          error: row.last_error,
          created_at: row.created_at,
        })),
      },
      integrity: {
        enabled_assets_missing_public_url: brokenUrls,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      status: "ERROR",
      error: error instanceof Error ? error.message : String(error),
      checked_at: new Date().toISOString(),
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
