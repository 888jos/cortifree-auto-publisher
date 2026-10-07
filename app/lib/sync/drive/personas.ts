import { backendMode } from "../../data-backend";
import { personaIdFromFolder } from "../../../../src/personas/identity";
import type { DriveSyncContext } from "./context";
import { runtimeMetadata } from "./sheet-metadata";
import { backendRows, md5Matches, patch, upload, upsert, type Row } from "./upsert";
import { isImage, type WalkedFile } from "./walk";

// Persona scope: masters, references and generated images from each persona's
// Drive folder (P01_AVA/00_MASTER, 01_REFERENCES, 02_GENERATED...).

async function disableDuplicatePersonaMasters(personaId: string, canonicalDriveFileId: string) {
  if (backendMode() !== "supabase") return;
  const masters = await backendRows(`assets?workspace_id=eq.cortifree&source_type=eq.persona_master&persona_id=eq.${encodeURIComponent(personaId)}&select=id,drive_file_id,enabled,metadata&limit=20`);
  const duplicates = masters.filter((row) => String(row.drive_file_id ?? "") !== canonicalDriveFileId && row.enabled !== false);
  await Promise.all(duplicates.map((row) => patch("assets", String(row.id), {
    enabled: false,
    metadata: {
      ...runtimeMetadata(row),
      disabled_reason: "DUPLICATE_PERSONA_MASTER",
      canonical_drive_file_id: canonicalDriveFileId,
      disabled_at: new Date().toISOString(),
    },
  })));
}

export async function syncPersonaEntry(ctx: DriveSyncContext, entry: WalkedFile) {
  const { limit, assetByDrive, failures } = ctx;
  if (!isImage(entry.file) || ctx.stats.uploaded >= limit) return;
  const personaFolder = entry.path[0] ?? "";
  const prefixedPersonaId = personaFolder.match(/^(P\d{2})/i)?.[1]?.toUpperCase();
  let personaId = prefixedPersonaId;
  if (!personaId) {
    try { personaId = personaIdFromFolder(personaFolder); }
    catch {
      ctx.stats.failed += 1;
      failures.push({ id: entry.file.id, name: entry.file.name, error: `Unknown persona folder: ${personaFolder || "(root)"}` });
      return;
    }
  }
  const section = entry.path[1] ?? "";
  const sourceType = section === "00_MASTER" ? "persona_master" : section === "01_REFERENCES" ? "persona_reference" : "persona_generated";
  const existing = assetByDrive.get(entry.file.id);
  const syncedAt = new Date().toISOString();
  const syncState = {
    canonical_updated_at: entry.file.modifiedTime ?? null,
    synced_at: syncedAt,
    source_hash: entry.file.md5Checksum ?? null,
    sync_status: "SYNCED",
    sync_error: null,
  };
  if (md5Matches(existing, entry.file)) {
    await patch("assets", String(existing!.id), {
      ...syncState,
      drive_modified_time: entry.file.modifiedTime ?? existing!.drive_modified_time ?? null,
      metadata: {
        ...runtimeMetadata(existing!),
        synced_at: syncedAt,
        canonical_updated_at: entry.file.modifiedTime ?? null,
        source_hash: entry.file.md5Checksum ?? null,
        sync_status: "SYNCED",
        sync_error: null,
      },
    });
    if (sourceType === "persona_master") await disableDuplicatePersonaMasters(personaId, entry.file.id);
    ctx.stats.skipped += 1;
    return;
  }
  const storage = await upload(entry.file);
  const personaPayload: Row = {
    workspace_id: "cortifree",
    drive_file_id: entry.file.id,
    drive_md5: entry.file.md5Checksum ?? null,
    drive_modified_time: entry.file.modifiedTime ?? null,
    filename: entry.file.name,
    category: section.replace(/^\d+_/, "").toLowerCase() || "other",
    persona_id: personaId,
    source_type: sourceType,
    public_url: storage.publicUrl,
    storage_bucket: backendMode(),
    convex_storage_id: String(storage.storageId),
    enabled: true,
    indexed_at: syncedAt,
    ...syncState,
    metadata: {
      drive_path: entry.path,
      protected_master: sourceType === "persona_master",
      canonical_asset_id: sourceType === "persona_master" ? `${personaId}_MASTER` : `DRIVE_PERSONA_${entry.file.id}`,
      synced_at: syncedAt,
      canonical_updated_at: entry.file.modifiedTime ?? null,
      source_hash: entry.file.md5Checksum ?? null,
      sync_status: "SYNCED",
      sync_error: null,
    },
  };
  // Legacy Supabase uses a numeric identity for assets.id. Keep the stable
  // Drive/canonical key in metadata and let Supabase allocate the row id.
  if (backendMode() !== "supabase") personaPayload.id = sourceType === "persona_master" ? `${personaId}_MASTER` : `DRIVE_PERSONA_${entry.file.id}`;
  await upsert("assets", personaPayload, ["workspace_id", "drive_file_id"]);
  if (sourceType === "persona_master") await disableDuplicatePersonaMasters(personaId, entry.file.id);
  ctx.stats.uploaded += 1;
}
