import { backendMode } from "../../data-backend";
import { existingAssetForStockRow, type DriveSyncContext } from "./context";
import { runtimeMetadata, sameCanonicalValue, sameTimestamp, sheetSelectable, split, stockCanonicalMetadata, stockSheetRepairFields, visualList, visualTaggingSchema } from "./sheet-metadata";
import { md5Matches, patch, upload, upsert, type Row } from "./upsert";
import { isImage, type WalkedFile } from "./walk";

// Stock scope: 08_STOCK_ASSETS is canonical for stock metadata; Drive holds the files.

// Repairs stock assets whose runtime metadata drifted from the Sheet, without
// walking Drive. Pixel-inspected Vision V2 metadata is never overwritten.
export async function repairStockMetadata(ctx: DriveSyncContext) {
  const repairs: Array<{ id: string; row: Row; existing: Row; expectedCategory: string; expectedSubcategory: string; existingIsVisionV2: boolean }> = [];
  for (const row of ctx.stockTaxonomy) {
    const existing = existingAssetForStockRow(ctx, row);
    if (!existing || !row.drive_file_id) continue;
    const expectedCategory = String(row.category || existing.category || "uncategorized");
    const expectedSubcategory = String(row.scene || row.category || existing.subcategory || "uncategorized");
    // Vision V2 is a per-image pixel inspection. A legacy Sheet row must
    // never overwrite it with generic directory-derived metadata.
    const existingIsVisionV2 = String(existing.visual_tagging_schema || runtimeMetadata(existing).visual_tagging_schema || "").toLowerCase() === "observable_v2"
      && String(existing.visual_review_status || runtimeMetadata(existing).visual_review_status || "").toUpperCase() === "IMAGE_INSPECTED_V2";
    const metadataNeedsRepair = !existingIsVisionV2 && (String(existing.category ?? "") !== expectedCategory
      || String(existing.subcategory ?? "") !== expectedSubcategory
      || String(existing.scene ?? "") !== String(row.scene ?? "")
      || String(existing.framing ?? "") !== String(row.framing ?? "")
      || String(existing.activity ?? "") !== String(row.activity ?? "")
      || String(existing.mood ?? "") !== String(row.mood ?? "")
      || String(existing.visual_description ?? "") !== String(row.visual_description ?? "")
      || !sameCanonicalValue(existing.visible_objects, visualList(row.visible_objects))
      || !sameCanonicalValue(existing.visible_actions, visualList(row.visible_actions))
      || String(existing.setting ?? "") !== String(row.setting ?? "")
      || String(existing.people_visibility ?? "") !== String(row.people_visibility ?? "")
      || !sameCanonicalValue(existing.body_parts_visible, visualList(row.body_parts_visible))
      || String(existing.composition ?? "") !== String(row.composition ?? "")
      || String(existing.camera_angle ?? "") !== String(row.camera_angle ?? "")
      || String(existing.lighting ?? "") !== String(row.lighting ?? "")
      || !sameCanonicalValue(existing.dominant_colors, visualList(row.dominant_colors))
      || String(existing.text_in_image ?? "") !== String(row.text_in_image ?? "")
      || String(existing.specific_details ?? "") !== String(row.specific_details ?? "")
      || String(existing.visual_tagging_schema || runtimeMetadata(existing).visual_tagging_schema || "") !== visualTaggingSchema(row)
      || String(existing.visual_review_status ?? "") !== String(row.visual_review_status ?? "")
      || !sameTimestamp(existing.visual_reviewed_at, row.visual_reviewed_at)
      || !sameCanonicalValue(existing.tags, split(row.tags))
      || !sameCanonicalValue(existing.good_for, split(row.good_for_pillars)));
    const syncStateNeedsRepair = String(existing.sync_status ?? "") !== "SYNCED"
      || !existing.synced_at
      || String(existing.source_hash ?? "") !== String(existing.drive_md5 ?? "");
    if (!metadataNeedsRepair && !syncStateNeedsRepair) continue;
    repairs.push({ id: String(existing.id), row, existing, expectedCategory, expectedSubcategory, existingIsVisionV2 });
  }
  for (let index = 0; index < repairs.length; index += 20) {
    const batch = repairs.slice(index, index + 20);
    await Promise.all(batch.map(async ({ id, row, existing, expectedCategory, expectedSubcategory, existingIsVisionV2 }) => {
      await patch("assets", id, stockSheetRepairFields(row, existing, expectedCategory, expectedSubcategory, existingIsVisionV2));
    }));
    ctx.stats.metadataRepaired += batch.length;
  }
}

export async function syncStockEntry(ctx: DriveSyncContext, entry: WalkedFile) {
  const { limit, stockByDrive, assetByDrive, assetByFilename, assetByMd5, resolvedStockDriveIds, resolvedStockKeys } = ctx;
  if (!isImage(entry.file) || ctx.stats.uploaded >= limit) return;
  const taxonomy = stockByDrive.get(entry.file.id) ?? {};
  const existing = assetByDrive.get(entry.file.id)
    ?? assetByFilename.get(entry.file.name.trim().toLowerCase())
    ?? (entry.file.md5Checksum ? assetByMd5.get(entry.file.md5Checksum) : undefined);
  if (existing && entry.file.md5Checksum && assetByMd5.get(entry.file.md5Checksum)
    && String(existing.drive_file_id ?? "") !== String(entry.file.id)) {
    resolvedStockDriveIds.add(String(entry.file.id));
    if (taxonomy.stock_key) resolvedStockKeys.add(String(taxonomy.stock_key));
    ctx.stats.duplicatesSkipped += 1;
    ctx.stats.skipped += 1;
    return;
  }
  const category = String(taxonomy.category || entry.path[0] || "uncategorized");
  const selectable = sheetSelectable(taxonomy);
  const canonicalMetadata = stockCanonicalMetadata(taxonomy, entry, existing, category, selectable);
  if (existing && (md5Matches(existing, entry.file) || existing.filename === entry.file.name || existing.drive_file_id === entry.file.id)) {
    await patch("assets", String(existing.id), {
      ...canonicalMetadata,
      drive_file_id: existing.drive_file_id ?? entry.file.id,
      drive_md5: existing.drive_md5 ?? entry.file.md5Checksum ?? null,
      drive_modified_time: entry.file.modifiedTime ?? existing.drive_modified_time ?? null,
    });
    resolvedStockDriveIds.add(String(entry.file.id));
    if (taxonomy.stock_key) resolvedStockKeys.add(String(taxonomy.stock_key));
    ctx.stats.metadataRepaired += 1;
    ctx.stats.skipped += 1;
    return;
  }
  const storage = await upload(entry.file);
  await upsert("assets", {
    workspace_id: "cortifree",
    drive_file_id: entry.file.id,
    drive_md5: entry.file.md5Checksum ?? null,
    drive_modified_time: entry.file.modifiedTime ?? null,
    filename: entry.file.name,
    persona_id: null,
    source_type: "stock",
    public_url: storage.publicUrl,
    storage_bucket: backendMode(),
    convex_storage_id: String(storage.storageId),
    ...canonicalMetadata,
    use_count: Number(taxonomy.use_count ?? 0),
    indexed_at: new Date().toISOString(),
  }, ["workspace_id", "drive_file_id"]);
  resolvedStockDriveIds.add(String(entry.file.id));
  if (taxonomy.stock_key) resolvedStockKeys.add(String(taxonomy.stock_key));
  ctx.stats.uploaded += 1;
}
