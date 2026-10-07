import { backendMode, dataBackend } from "../../data-backend";
import { appScreenRow } from "./sheet-metadata";
import { backendRows, md5Matches, patch, upload, upsert, type Row } from "./upsert";
import { APP_SCREENS_ROOT, isImage, walk } from "./walk";

// App screens scope: official CortiFree screenshots, synced on their own run
// and logged separately.

export async function syncAppScreensOnly(limit: number, offset: number) {
  const allEntries = (await walk(APP_SCREENS_ROOT)).filter((entry) => isImage(entry.file));
  const entries = allEntries.slice(offset, offset + limit);
  const existing = await backendRows("assets?workspace_id=eq.cortifree&source_type=eq.app_screenshot&select=*&limit=500");
  const byDrive = new Map(existing.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ id: string; name: string; error: string }> = [];

  for (const entry of entries) {
    try {
      const current = byDrive.get(entry.file.id);
      const syncedAt = new Date().toISOString();
      const common: Row = appScreenRow(entry, current, syncedAt);

      if (current && md5Matches(current, entry.file)) {
        await patch("assets", String(current.id), common);
        skipped += 1;
        continue;
      }

      const storage = await upload(entry.file);
      await upsert("assets", {
        ...common,
        public_url: storage.publicUrl,
        storage_bucket: backendMode(),
        storage_path: String(storage.storageId),
        path: `app_screens/${entry.file.id}`,
      }, ["workspace_id", "drive_file_id"]);
      uploaded += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        id: entry.file.id,
        name: entry.file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = {
    id: `SYNC_APP_SCREENS_${Date.now()}`,
    workspace_id: "cortifree",
    event: "DRIVE_APP_SCREENS_SYNC",
    status: failed ? "PARTIAL" : "SUCCESS",
    scope: "app_screens",
    drive_root: APP_SCREENS_ROOT,
    drive_images: allEntries.length,
    uploaded,
    skipped,
    failed,
    remaining_hint: Math.max(0, allEntries.length - offset - entries.length),
    failures: failures.slice(0, 20),
    finished_at: new Date().toISOString(),
  };
  const logResponse = await dataBackend("system_logs", {
    method: "POST",
    body: JSON.stringify({ created_at: result.finished_at, stage: result.event, status: result.status, metadata: result }),
  });
  if (!logResponse.ok) throw new Error(`App screen sync log write failed: ${await logResponse.text()}`);
  return result;
}
