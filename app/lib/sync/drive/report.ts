import { backendMode, dataBackend } from "../../data-backend";
import type { DriveSyncContext } from "./context";
import { existingAssetForStockRow } from "./context";
import { sheetSelectable } from "./sheet-metadata";
import type { Row } from "./upsert";
import { isImage, type WalkedFile } from "./walk";

// Builds the sync report (counters plus a Sheet-vs-runtime audit) and logs it.
export async function reportDriveSync(ctx: DriveSyncContext, run: { requestedPersonaId: string; stockTree: WalkedFile[]; personaTree: WalkedFile[]; refTree: WalkedFile[]; existingAssets: Row[]; existingRefs: Row[] }) {
  const { scope, stockTaxonomy, refTaxonomy, refById, refByHash, resolvedStockDriveIds, resolvedStockKeys, resolvedRefIds, failures, stats } = ctx;
  const { requestedPersonaId, stockTree, refTree, existingAssets, existingRefs } = run;
  const selectedPersonaTree = run.personaTree;
  const stockAuditRows = stockTaxonomy.map((row) => {
    const existing = existingAssetForStockRow(ctx, row);
    const resolved = (row.drive_file_id && resolvedStockDriveIds.has(String(row.drive_file_id)))
      || (row.stock_key && resolvedStockKeys.has(String(row.stock_key)));
    return { row, existing, status: existing || resolved ? `INDEXED_${backendMode().toUpperCase()}` : "DRIVE_ONLY_NEEDS_SYNC" };
  });
  const visualAuditRows = refTaxonomy.map((row) => {
    const existing = row.ref_id ? refById.get(String(row.ref_id)) : undefined;
    const byHash = row.file_hash ? refByHash.get(String(row.file_hash)) : undefined;
    const resolved = row.ref_id ? resolvedRefIds.has(String(row.ref_id)) : false;
    return { row, existing: existing ?? byHash, status: existing || byHash || resolved ? `INDEXED_${backendMode().toUpperCase()}` : "DRIVE_ONLY_NEEDS_SYNC" };
  });
  const statusCounts = (items: Array<{ status: string }>) => items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  const result = {
    id: `SYNC_DRIVE_${Date.now()}`,
    workspace_id: "cortifree",
    event: "DRIVE_TO_SUPABASE",
    status: stats.failed ? "PARTIAL" : "SUCCESS",
    uploaded: stats.uploaded,
    skipped: stats.skipped,
    duplicates_skipped: stats.duplicatesSkipped,
    metadata_repaired: stats.metadataRepaired,
    failed: stats.failed,
    remaining_hint: Math.max(0, (requestedPersonaId ? selectedPersonaTree : scope === "visual_refs" ? refTree : [...stockTree, ...selectedPersonaTree, ...refTree]).filter((x) => isImage(x.file)).length - stats.skipped - stats.uploaded),
    scope,
    persona_id: requestedPersonaId || null,
    failures: failures.slice(0, 20),
    audit: {
      sheet_count: scope === "visual_refs" || scope === "visual_refs_missing" ? refTaxonomy.length : stockTaxonomy.length,
      drive_count: scope === "visual_refs" || scope === "visual_refs_missing"
        ? refTaxonomy.filter((row) => row.drive_file_id).length
        : stockTree.length ? stockTree.filter((entry) => isImage(entry.file)).length : stockTaxonomy.filter((row) => row.drive_file_id).length,
      runtime_count: scope === "visual_refs" || scope === "visual_refs_missing" ? existingRefs.length : existingAssets.filter((row) => row.source_type === "stock").length,
      missing_runtime: scope === "visual_refs" || scope === "visual_refs_missing"
        ? visualAuditRows.filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC" && sheetSelectable(item.row)).length
        : stockAuditRows.filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC" && sheetSelectable(item.row)).length,
      duplicates_skipped: stats.duplicatesSkipped,
      metadata_repaired: stats.metadataRepaired,
      uploaded: stats.uploaded,
      stock_drive_images: scope === "assets" || scope === "stock" || scope === "stock_missing" ? stockTaxonomy.length : stockTree.filter((entry) => isImage(entry.file)).length,
      stock_sheet_rows: stockTaxonomy.length,
      stock_sheet_columns: Object.keys(stockTaxonomy[0] ?? {}),
      stock_sheet_sample: stockTaxonomy[0] ?? null,
      stock_status_counts: statusCounts(stockAuditRows),
      stock_drive_only_rows: stockAuditRows.filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC").map(({ row }) => String(row.stock_key ?? row.drive_file_id ?? "unknown")),
      stock_runtime_missing_rows: stockAuditRows.filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC").map(({ row }) => String(row.stock_key ?? row.drive_file_id)),
      visual_ref_status_counts: statusCounts(visualAuditRows),
      visual_ref_drive_images: scope === "visual_refs" || scope === "visual_refs_missing" ? refTaxonomy.length : refTree.filter((entry) => isImage(entry.file)).length,
      visual_ref_sheet_rows: refTaxonomy.length,
      visual_ref_runtime_missing_rows: visualAuditRows
        .filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC" && sheetSelectable(item.row))
        .map(({ row }) => String(row.ref_id)),
      canonical_metadata_repaired: stats.metadataRepaired,
    },
    finished_at: new Date().toISOString(),
  };
  const logResponse = await dataBackend("system_logs", {
    method: "POST",
    body: JSON.stringify({ created_at: result.finished_at, stage: result.event, status: result.status, metadata: result }),
  });
  if (!logResponse.ok) throw new Error(`Sync log write failed: ${await logResponse.text()}`);
  return result;
}
