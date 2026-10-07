import { runtimeMetadata } from "./sheet-metadata";
import type { Row, SyncFailure } from "./upsert";

export type DriveSyncScope = "all" | "visual_refs" | "visual_refs_missing" | "assets" | "stock" | "stock_missing" | "app_screens";

export type DriveSyncOptions = {
  limit?: number;
  offset?: number;
  scope?: DriveSyncScope;
  personaId?: string;
};

// State shared by the scope syncs of one run: the Sheet taxonomies, lookups
// over the existing runtime rows, the counters reported at the end and the
// Sheet rows resolved along the way.
export type DriveSyncContext = {
  limit: number;
  scope: DriveSyncScope;
  stockTaxonomy: Row[];
  refTaxonomy: Row[];
  stockByDrive: Map<string, Row>;
  refsByDrive: Map<string, Row>;
  assetByDrive: Map<string, Row>;
  assetByFilename: Map<string, Row>;
  assetByMd5: Map<string, Row>;
  refByDrive: Map<string, Row>;
  refById: Map<string, Row>;
  refByHash: Map<string, Row>;
  stats: { uploaded: number; skipped: number; metadataRepaired: number; duplicatesSkipped: number; failed: number };
  resolvedStockDriveIds: Set<string>;
  resolvedStockKeys: Set<string>;
  resolvedRefIds: Set<string>;
  failures: SyncFailure[];
};

export function createSyncContext(options: { limit: number; scope: DriveSyncScope; stockTaxonomy: Row[]; refTaxonomy: Row[]; existingAssets: Row[]; existingRefs: Row[] }): DriveSyncContext {
  const { stockTaxonomy, refTaxonomy, existingAssets, existingRefs } = options;
  const refByHash = new Map<string, Row>();
  for (const row of existingRefs.filter((item) => item.file_hash)) {
    const hash = String(row.file_hash);
    const current = refByHash.get(hash);
    const rank = (candidate: Row) => candidate.enabled === true && !["DUPLICATE", "REVIEW"].includes(String(runtimeMetadata(candidate).review_status ?? "").toUpperCase()) && String(runtimeMetadata(candidate).qa_flag ?? "").toUpperCase() !== "MULTI_PERSON_AUTO_DISABLED" ? 0 : 1;
    if (!current || rank(row) < rank(current)) refByHash.set(hash, row);
  }
  return {
    limit: options.limit,
    scope: options.scope,
    stockTaxonomy,
    refTaxonomy,
    stockByDrive: new Map(stockTaxonomy.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row])),
    refsByDrive: new Map(refTaxonomy.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row])),
    assetByDrive: new Map(existingAssets.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row])),
    assetByFilename: new Map(existingAssets.filter((row) => row.filename).map((row) => [String(row.filename).trim().toLowerCase(), row])),
    assetByMd5: new Map(existingAssets.filter((row) => row.drive_md5).map((row) => [String(row.drive_md5), row])),
    refByDrive: new Map(existingRefs.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row])),
    refById: new Map(existingRefs.filter((row) => row.id).map((row) => [String(row.id), row])),
    refByHash,
    stats: { uploaded: 0, skipped: 0, metadataRepaired: 0, duplicatesSkipped: 0, failed: 0 },
    resolvedStockDriveIds: new Set<string>(),
    resolvedStockKeys: new Set<string>(),
    resolvedRefIds: new Set<string>(),
    failures: [],
  };
}

// The runtime asset a 08_STOCK_ASSETS row refers to, by Drive id, filename or md5.
export function existingAssetForStockRow(ctx: DriveSyncContext, row: Row) {
  return row.drive_file_id
    ? ctx.assetByDrive.get(String(row.drive_file_id)) ?? ctx.assetByFilename.get(String(row.filename ?? "").trim().toLowerCase()) ?? ctx.assetByMd5.get(String(row.drive_md5 ?? row.md5 ?? ""))
    : ctx.assetByFilename.get(String(row.filename ?? "").trim().toLowerCase()) ?? ctx.assetByMd5.get(String(row.drive_md5 ?? row.md5 ?? ""));
}
