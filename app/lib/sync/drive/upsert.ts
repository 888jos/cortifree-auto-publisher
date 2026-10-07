import { dataBackend } from "../../data-backend";
import { isBrowserRenderableAssetUrl } from "../../asset-public-url";
import { uploadFile } from "../../storage";
import { downloadDriveFile, type DriveFile } from "../../google/drive";

// Supabase reads and writes used by the Drive sync, and the Drive -> storage copy.

export type Row = Record<string, unknown>;
export type SyncFailure = { id: string; name: string; error: string };

export async function backendRows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
export async function upsert(table: string, row: Row, conflictFields = ["id"]) {
  let payload = { ...row };
  let conflicts = [...conflictFields];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await dataBackend(`${table}?on_conflict=${conflicts.join(",")}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return;
    const errorText = await response.text();
    const missingColumn = errorText.match(/Could not find the '([^']+)' column/);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(payload, missingColumn[1])) throw new Error(errorText);
    const copy: Row = { ...payload };
    delete copy[missingColumn[1]];
    payload = copy;
    conflicts = conflicts.filter((field) => field !== missingColumn[1]);
    if (!conflicts.length) conflicts = ["id"];
  }
  throw new Error(`Drive sync failed for ${table}: too many schema compatibility retries`);
}
export async function patch(table: string, id: string, row: Row) {
  const response = await dataBackend(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(await response.text());
}
export function md5Matches(existing: Row | undefined, file: DriveFile) {
  return Boolean(isBrowserRenderableAssetUrl(existing?.public_url) && file.md5Checksum && existing?.drive_md5 === file.md5Checksum);
}
export async function upload(file: DriveFile) {
  const downloaded = await downloadDriveFile(file.id);
  return await uploadFile(downloaded.bytes, downloaded.contentType || file.mimeType);
}
