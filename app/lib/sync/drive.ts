import { backendMode } from "../data-backend";
import { readSheetObjects } from "../google/sheets";
import { syncAppScreensOnly } from "./drive/app-screens";
import { createSyncContext, type DriveSyncOptions } from "./drive/context";
import { syncPersonaEntry } from "./drive/personas";
import { reportDriveSync } from "./drive/report";
import { repairStockMetadata, syncStockEntry } from "./drive/stock";
import { backendRows } from "./drive/upsert";
import { repairVisualRefMetadata, syncReferenceEntry } from "./drive/visual-refs";
import { lookupDriveEntries, PERSONAS_ROOT, STOCK_ROOT, VISUAL_REFS_ROOT, walk, walkPersonaTree, type WalkedFile } from "./drive/walk";

// Google Drive + taxonomy Sheets -> Supabase sync. This module loads what a
// scope needs, runs the per-scope syncs in drive/ and reports the result.

export { isCanonicalPersonaRootFolder } from "./drive/walk";
export type { DriveSyncOptions } from "./drive/context";

const syncLocks = new Map<string, Promise<unknown>>();

async function syncGoogleDriveToBackendUnlocked(options: DriveSyncOptions = {}) {
  const limit = Math.max(1, Math.min(250, options.limit ?? Number(process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 40)));
  const offset = Math.max(0, options.offset ?? 0);
  const scope = options.scope ?? "all";
  const requestedPersonaId = options.personaId?.trim().toUpperCase() || "";
  if (requestedPersonaId && !/^P\d{2}$/.test(requestedPersonaId)) throw new Error(`Invalid personaId: ${options.personaId}`);
  if (scope === "app_screens") return syncAppScreensOnly(limit, offset);
  const refTaxonomyPromise = readSheetObjects("08_VISUAL_REFS", "A1:X300");
  const refTreePromise = scope === "visual_refs" || scope === "visual_refs_missing" || scope === "assets" || scope === "stock" || scope === "stock_missing"
    ? Promise.resolve([])
    : walk(VISUAL_REFS_ROOT);
  const [stockTaxonomy, refTaxonomy, stockTree, personaTree, refTree, existingAssets, existingRefs] = await Promise.all([
    scope === "visual_refs" ? Promise.resolve([]) : readSheetObjects("08_STOCK_ASSETS", "A1:AH500"),
    refTaxonomyPromise,
    scope === "visual_refs" || scope === "visual_refs_missing" || scope === "assets" || scope === "stock" || scope === "stock_missing" ? Promise.resolve([]) : walk(STOCK_ROOT),
    scope === "visual_refs" || scope === "visual_refs_missing" || scope === "stock" || scope === "stock_missing" ? Promise.resolve([]) : walkPersonaTree(requestedPersonaId || undefined),
    refTreePromise,
    scope === "visual_refs" ? Promise.resolve([]) : backendRows("assets?select=*&limit=5000"),
    backendRows("visual_references?select=*&limit=5000"),
  ]);
  const ctx = createSyncContext({ limit, scope, stockTaxonomy, refTaxonomy, existingAssets, existingRefs });

  // Stock is canonical in 08_STOCK_ASSETS. For an assets-only run, avoid a
  // second full Drive tree walk: repair metadata in place and fetch only
  // canonical rows that are genuinely missing from runtime storage.
  const stockEntries: WalkedFile[] = scope === "stock_missing"
    ? await lookupDriveEntries(
        stockTaxonomy.filter((row) => row.drive_file_id && !ctx.assetByDrive.has(String(row.drive_file_id)) && !ctx.assetByFilename.has(String(row.filename ?? "").trim().toLowerCase()) && !ctx.assetByMd5.has(String(row.drive_md5 ?? row.md5 ?? ""))),
        (row) => ({ id: String(row.drive_file_id), path: [String(row.category || "uncategorized")], name: String(row.filename ?? "stock_asset") }),
        ctx.failures,
      )
    : stockTree;

  const visualRefEntries: WalkedFile[] = scope === "visual_refs_missing"
    ? await lookupDriveEntries(
        refTaxonomy.filter((row) => row.drive_file_id && !ctx.refById.has(String(row.ref_id))).slice(offset, offset + limit),
        (row) => ({ id: String(row.drive_file_id), path: [String(row.carousel_use || row.category || "hero_misc")], name: String(row.ref_id ?? "visual_reference") }),
        ctx.failures,
      )
    : refTree;

  if (scope === "visual_refs" || scope === "visual_refs_missing") await repairVisualRefMetadata(ctx);
  if (scope === "assets" || scope === "stock" || scope === "stock_missing") await repairStockMetadata(ctx);

  const tasks: Array<() => Promise<void>> = requestedPersonaId
    ? personaTree.map((entry) => () => syncPersonaEntry(ctx, entry))
    : scope === "visual_refs" || scope === "visual_refs_missing"
      ? visualRefEntries.map((entry) => () => syncReferenceEntry(ctx, entry))
      : scope === "assets" || scope === "stock" || scope === "stock_missing"
        ? [...personaTree.map((entry) => () => syncPersonaEntry(ctx, entry)), ...stockEntries.map((entry) => () => syncStockEntry(ctx, entry))]
        : [
            ...personaTree.map((entry) => () => syncPersonaEntry(ctx, entry)),
            ...stockTree.map((entry) => () => syncStockEntry(ctx, entry)),
            ...refTree.map((entry) => () => syncReferenceEntry(ctx, entry)),
          ];
  for (const task of tasks) {
    if (ctx.stats.uploaded >= limit) break;
    try { await task(); }
    catch (error) {
      ctx.stats.failed += 1;
      ctx.failures.push({ id: "unknown", name: "drive_asset", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return reportDriveSync(ctx, { requestedPersonaId, stockTree, personaTree, refTree, existingAssets, existingRefs });
}

/** Serialize syncs per scope in one process; database unique keys protect
 * concurrent Vercel instances and retries across processes. */
export async function syncGoogleDriveToBackend(options: DriveSyncOptions = {}) {
  const key = `${backendMode()}:${options.scope ?? "all"}:${options.personaId ?? "*"}`;
  const previous = syncLocks.get(key) ?? Promise.resolve();
  const current = previous.then(() => syncGoogleDriveToBackendUnlocked(options));
  syncLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (syncLocks.get(key) === current) syncLocks.delete(key);
  }
}
