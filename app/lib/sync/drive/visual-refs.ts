import { backendMode, dataBackend } from "../../data-backend";
import type { DriveSyncContext } from "./context";
import { runtimeMetadata, sameCanonicalValue, sheetQaFlag, sheetReviewStatus, sheetSelectable, visualRefCanonicalMetadata, visualRefSheetExpected } from "./sheet-metadata";
import { backendRows, patch, upload, upsert, type Row } from "./upsert";
import { isImage, type WalkedFile } from "./walk";

// Visual references scope: Pinterest-style references for ModelArk, canonical
// in 08_VISUAL_REFS with files in Drive.

// Repairs references whose runtime metadata or sync state drifted from the Sheet.
export async function repairVisualRefMetadata(ctx: DriveSyncContext) {
  const { refTaxonomy, refById } = ctx;
  const refRepairs = refTaxonomy.map((row) => {
    const existing = refById.get(String(row.ref_id ?? ""));
    if (!existing) return null;
    const expected = visualRefSheetExpected(row);
    // A reference disabled at runtime (collage output, wrong label) stays off.
    if (String(runtimeMetadata(existing).disabled_reason ?? "").trim()) expected.enabled = false;
    const metadataChanged = String(existing.category ?? "") !== String(expected.category)
      || String(existing.pose ?? "") !== String(expected.pose)
      || String(existing.framing ?? "") !== String(expected.framing)
      || String(existing.outfit ?? "") !== String(expected.outfit)
      || String(existing.environment ?? "") !== String(expected.environment)
      || String(existing.lighting ?? "") !== String(expected.lighting)
      || existing.enabled !== expected.enabled
      || !sameCanonicalValue(existing.tags, expected.tags)
      || !sameCanonicalValue(existing.good_for, expected.good_for);
    const syncStateNeedsRepair = String(existing.sync_status ?? "") !== "SYNCED"
      || !existing.synced_at
      || String(existing.source_hash ?? "") !== String(existing.file_hash ?? "");
    return metadataChanged || syncStateNeedsRepair ? {
      id: String(existing.id),
      expected: {
        ...expected,
        canonical_updated_at: existing.canonical_updated_at ?? existing.updated_at ?? null,
        synced_at: new Date().toISOString(),
        source_hash: existing.file_hash ?? existing.source_hash ?? null,
        sync_status: "SYNCED",
        sync_error: null,
        metadata: { ...runtimeMetadata(existing), ...runtimeMetadata(expected), canonical_source: "08_VISUAL_REFS" },
      },
    } : null;
  }).filter(Boolean) as Array<{ id: string; expected: Row }>;
  for (let index = 0; index < refRepairs.length; index += 20) {
    const batch = refRepairs.slice(index, index + 20);
    await Promise.all(batch.map(({ id, expected }) => patch("visual_references", id, { ...expected, updated_at: new Date().toISOString() })));
    ctx.stats.metadataRepaired += batch.length;
  }
}

export async function syncReferenceEntry(ctx: DriveSyncContext, entry: WalkedFile) {
  const { limit, refsByDrive, refByDrive, refById, refByHash, resolvedRefIds } = ctx;
  if (!isImage(entry.file) || ctx.stats.uploaded >= limit) return;
  const taxonomy = refsByDrive.get(entry.file.id) ?? {};
  const reviewStatus = sheetReviewStatus(taxonomy);
  const qaFlag = sheetQaFlag(taxonomy);
  const selectable = sheetSelectable(taxonomy);
  const refId = String(taxonomy.ref_id ?? "");
  const existing = refByDrive.get(entry.file.id) ?? (refId ? refById.get(refId) : undefined);
  const canonicalMetadata = visualRefCanonicalMetadata(taxonomy, entry, existing, selectable);
  if (reviewStatus === "DUPLICATE" || qaFlag === "MULTI_PERSON_AUTO_DISABLED") {
    if (existing?.id) await patch("visual_references", String(existing.id), { ...canonicalMetadata, enabled: false });
    if (refId) resolvedRefIds.add(refId);
    ctx.stats.duplicatesSkipped += 1;
    ctx.stats.skipped += 1;
    return;
  }
  if (existing?.thumbnail_url) {
    const metadataNeedsRepair = String(existing.category ?? "") !== String(canonicalMetadata.category ?? "")
      || String(existing.pose ?? "") !== String(canonicalMetadata.pose ?? "")
      || String(existing.framing ?? "") !== String(canonicalMetadata.framing ?? "")
      || String(existing.outfit ?? "") !== String(canonicalMetadata.outfit ?? "")
      || String(existing.environment ?? "") !== String(canonicalMetadata.environment ?? "")
      || String(existing.lighting ?? "") !== String(canonicalMetadata.lighting ?? "")
      || !sameCanonicalValue(existing.tags, canonicalMetadata.tags)
      || !sameCanonicalValue(existing.good_for, canonicalMetadata.good_for);
    if (!metadataNeedsRepair && existing.enabled === canonicalMetadata.enabled) { if (refId) resolvedRefIds.add(refId); ctx.stats.skipped += 1; return; }
    await patch("visual_references", String(existing.id), { ...canonicalMetadata, drive_file_id: entry.file.id });
    if (refId) resolvedRefIds.add(refId);
    ctx.stats.metadataRepaired += 1;
    ctx.stats.skipped += 1;
    return;
  }
  if (entry.file.md5Checksum) {
    const sameHash = refByHash.get(entry.file.md5Checksum)
      ? [refByHash.get(entry.file.md5Checksum)!]
      : await backendRows(`visual_references?file_hash=eq.${encodeURIComponent(entry.file.md5Checksum)}&limit=1`);
    if (sameHash[0]?.id) {
      const canonical = sameHash[0];
      if (String(canonical.id) !== String(taxonomy.ref_id ?? "")) {
        if (refId) resolvedRefIds.add(refId);
        ctx.stats.duplicatesSkipped += 1;
        ctx.stats.skipped += 1;
        return;
      }
      await patch("visual_references", String(canonical.id), { ...canonicalMetadata, drive_file_id: entry.file.id });
      if (refId) resolvedRefIds.add(refId);
      ctx.stats.metadataRepaired += 1;
      ctx.stats.skipped += 1;
      return;
    }
  }
  const storage = await upload(entry.file);
  const referencePayload: Row = {
    workspace_id: "cortifree",
    id: taxonomy.ref_id || `VR_DRIVE_${entry.file.id}`,
    storage_path: storage.publicUrl,
    ...canonicalMetadata,
    thumbnail_url: storage.publicUrl,
    file_hash: entry.file.md5Checksum ?? null,
    drive_file_id: entry.file.id,
  };
  if (backendMode() === "supabase") referencePayload.metadata = { ...runtimeMetadata(referencePayload), canonical_reference_id: taxonomy.ref_id || null };
  // The legacy Supabase table has no unique constraint on drive_file_id;
  // conflict-target upsert would fail with 42P10. Existing rows are handled
  // above, so a plain insert is the correct operation for a new reference.
  if (backendMode() === "supabase") {
    const response = await dataBackend("visual_references", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(referencePayload),
    });
    if (!response.ok) throw new Error(await response.text());
  } else {
    await upsert("visual_references", referencePayload, ["workspace_id", "drive_file_id"]);
  }
  if (refId) resolvedRefIds.add(refId);
  ctx.stats.uploaded += 1;
}
