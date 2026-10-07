import { listDriveChildren, getDriveFile, type DriveFile } from "../../google/drive";
import { personaIdFromFolder } from "../../../../src/personas/identity";
import type { Row, SyncFailure } from "./upsert";

// Drive roots and the folder walk that turns them into image entries.

export type WalkedFile = { file: DriveFile; path: string[] };

export const STOCK_ROOT = process.env.GOOGLE_DRIVE_STOCK_FOLDER_ID || "12Jd3vxCe-B82Op_fTCVgEjHdzxJMxSCb";
export const PERSONAS_ROOT = process.env.GOOGLE_DRIVE_PERSONAS_FOLDER_ID || "1cnDHDfAGgwOxTT_kJsZNpnRHvB5sY6Ps";
export const VISUAL_REFS_ROOT = process.env.GOOGLE_DRIVE_VISUAL_REFS_FOLDER_ID || "1kIdIzUptjOa6wIzCamp5cisDjLJqHxHL";
export const APP_SCREENS_ROOT = process.env.GOOGLE_DRIVE_APP_SCREENS_FOLDER_ID || "1kcASLh8flvGVIeaqCKg6Onvua8Qks2uU";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export function isImage(file: DriveFile) {
  return file.mimeType.startsWith("image/");
}
export async function walk(folderId: string, path: string[] = [], out: WalkedFile[] = []): Promise<WalkedFile[]> {
  const children = await listDriveChildren(folderId);
  const files = children.filter((child) => child.mimeType !== FOLDER_MIME).map((file) => ({ file, path }));
  out.push(...files);
  const folders = children.filter((child) => child.mimeType === FOLDER_MIME);
  const nested = await Promise.all(folders.map((folder) => walk(folder.id, [...path, folder.name])));
  for (const entries of nested) out.push(...entries);
  return out;
}
export function isCanonicalPersonaRootFolder(name: string) {
  if (/^P\d{2}(?:[_\s-]|$)/i.test(name.trim())) return true;
  try {
    return Boolean(personaIdFromFolder(name));
  } catch {
    return false;
  }
}

export async function walkPersonaTree(personaId?: string): Promise<WalkedFile[]> {
  const children = await listDriveChildren(PERSONAS_ROOT);
  const personaFolders = children.filter((child) =>
    child.mimeType === FOLDER_MIME && isCanonicalPersonaRootFolder(child.name),
  );
  if (!personaId) {
    const nested = await Promise.all(personaFolders.map((folder) => walk(folder.id, [folder.name])));
    return nested.flat();
  }
  const folder = personaFolders.find((child) => personaIdFromFolder(child.name) === personaId);
  if (!folder) return [];
  return walk(folder.id, [folder.name]);
}

// Looks up the Drive files behind Sheet rows that have no runtime row yet,
// recording lookup failures instead of aborting the run.
export async function lookupDriveEntries(rows: Row[], entryFor: (row: Row) => { id: string; path: string[]; name: string }, failures: SyncFailure[]): Promise<WalkedFile[]> {
  return (await Promise.all(rows.map(async (row) => {
    const { id, path, name } = entryFor(row);
    try {
      return { file: await getDriveFile(id), path };
    } catch (error) {
      failures.push({ id, name, error: error instanceof Error ? error.message : "Drive file lookup failed" });
      return null;
    }
  }))).filter((entry): entry is WalkedFile => Boolean(entry));
}
