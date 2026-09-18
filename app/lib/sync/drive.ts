import { dataBackend } from "../data-backend";
import { uploadConvexFile } from "../convex-storage";
import { listDriveChildren, downloadDriveFile, type DriveFile } from "../google/drive";
import { readSheetObjects } from "../google/sheets";

type Row = Record<string, unknown>;
type WalkedFile = { file: DriveFile; path: string[] };

const STOCK_ROOT = process.env.GOOGLE_DRIVE_STOCK_FOLDER_ID || "12Jd3vxCe-B82Op_fTCVgEjHdzxJMxSCb";
const PERSONAS_ROOT = process.env.GOOGLE_DRIVE_PERSONAS_FOLDER_ID || "1cnDHDfAGgwOxTT_kJsZNpnRHvB5sY6Ps";
const VISUAL_REFS_ROOT = process.env.GOOGLE_DRIVE_VISUAL_REFS_FOLDER_ID || "1kIdIzUptjOa6wIzCamp5cisDjLJqHxHL";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function isImage(file: DriveFile) {
  return file.mimeType.startsWith("image/");
}
function split(value: unknown) {
  return String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
}
async function walk(folderId: string, path: string[] = [], out: WalkedFile[] = []): Promise<WalkedFile[]> {
  for (const child of await listDriveChildren(folderId)) {
    if (child.mimeType === FOLDER_MIME) await walk(child.id, [...path, child.name], out);
    else out.push({ file: child, path });
  }
  return out;
}
async function backendRows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function upsert(table: string, row: Row) {
  const response = await dataBackend(`${table}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(await response.text());
}
function md5Matches(existing: Row | undefined, file: DriveFile) {
  return Boolean(existing?.public_url && file.md5Checksum && existing.drive_md5 === file.md5Checksum);
}
async function upload(file: DriveFile) {
  const downloaded = await downloadDriveFile(file.id);
  return await uploadConvexFile(downloaded.bytes, downloaded.contentType || file.mimeType);
}

export async function syncGoogleDriveToConvex(options: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(250, options.limit ?? Number(process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 40)));
  const [stockTaxonomy, refTaxonomy, stockTree, personaTree, refTree, existingAssets, existingRefs] = await Promise.all([
    readSheetObjects("08_STOCK_ASSETS", "A1:T500"),
    readSheetObjects("08_VISUAL_REFS", "A1:X300"),
    walk(STOCK_ROOT),
    walk(PERSONAS_ROOT),
    walk(VISUAL_REFS_ROOT),
    backendRows("assets?select=*&limit=5000"),
    backendRows("visual_references?select=*&limit=5000"),
  ]);
  const stockByDrive = new Map(stockTaxonomy.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const refsByDrive = new Map(refTaxonomy.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const assetByDrive = new Map(existingAssets.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const refByDrive = new Map(existingRefs.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ id: string; name: string; error: string }> = [];

  async function syncStock(entry: WalkedFile) {
    if (!isImage(entry.file) || uploaded >= limit) return;
    const taxonomy = stockByDrive.get(entry.file.id) ?? {};
    const existing = assetByDrive.get(entry.file.id);
    if (md5Matches(existing, entry.file)) { skipped += 1; return; }
    const storage = await upload(entry.file);
    const category = String(taxonomy.category || entry.path[0] || "uncategorized");
    await upsert("assets", {
      id: taxonomy.stock_key || `DRIVE_STOCK_${entry.file.id}`,
      workspace_id: "cortifree",
      drive_file_id: entry.file.id,
      drive_md5: entry.file.md5Checksum ?? null,
      drive_modified_time: entry.file.modifiedTime ?? null,
      filename: entry.file.name,
      category,
      subcategory: category,
      persona_id: null,
      source_type: "stock",
      public_url: storage.publicUrl,
      storage_bucket: "convex",
      convex_storage_id: String(storage.storageId),
      scene: taxonomy.scene ?? null,
      framing: taxonomy.framing ?? null,
      activity: taxonomy.activity ?? null,
      mood: taxonomy.mood ?? null,
      tags: split(taxonomy.tags),
      good_for: split(taxonomy.good_for_pillars),
      enabled: taxonomy.enabled !== false,
      weight: Number(taxonomy.weight ?? 1),
      use_count: Number(taxonomy.use_count ?? 0),
      indexed_at: new Date().toISOString(),
      metadata: { drive_path: entry.path, sheet_sync_status: taxonomy.sync_status ?? null },
    });
    uploaded += 1;
  }

  async function syncPersona(entry: WalkedFile) {
    if (!isImage(entry.file) || uploaded >= limit) return;
    const personaFolder = entry.path[0] ?? "";
    const match = personaFolder.match(/^(P\d{2})/i);
    if (!match) return;
    const personaId = match[1].toUpperCase();
    const section = entry.path[1] ?? "";
    const sourceType = section === "00_MASTER" ? "persona_master" : section === "01_REFERENCES" ? "persona_reference" : "persona_generated";
    const existing = assetByDrive.get(entry.file.id);
    if (md5Matches(existing, entry.file)) { skipped += 1; return; }
    const storage = await upload(entry.file);
    await upsert("assets", {
      id: sourceType === "persona_master" ? `${personaId}_MASTER` : `DRIVE_PERSONA_${entry.file.id}`,
      workspace_id: "cortifree",
      drive_file_id: entry.file.id,
      drive_md5: entry.file.md5Checksum ?? null,
      drive_modified_time: entry.file.modifiedTime ?? null,
      filename: entry.file.name,
      category: section.replace(/^\d+_/, "").toLowerCase() || "other",
      persona_id: personaId,
      source_type: sourceType,
      public_url: storage.publicUrl,
      storage_bucket: "convex",
      convex_storage_id: String(storage.storageId),
      enabled: true,
      indexed_at: new Date().toISOString(),
      metadata: { drive_path: entry.path, protected_master: sourceType === "persona_master" },
    });
    uploaded += 1;
  }

  async function syncReference(entry: WalkedFile) {
    if (!isImage(entry.file) || uploaded >= limit) return;
    const taxonomy = refsByDrive.get(entry.file.id) ?? {};
    const existing = refByDrive.get(entry.file.id);
    if (existing?.thumbnail_url && entry.file.md5Checksum && existing.drive_md5 === entry.file.md5Checksum) { skipped += 1; return; }
    const storage = await upload(entry.file);
    const reviewStatus = String(taxonomy.review_status || "REVIEW");
    await upsert("visual_references", {
      id: taxonomy.ref_id || `VR_DRIVE_${entry.file.id}`,
      workspace_id: "cortifree",
      drive_file_id: entry.file.id,
      drive_md5: entry.file.md5Checksum ?? null,
      drive_modified_time: entry.file.modifiedTime ?? null,
      filename: entry.file.name,
      category: taxonomy.carousel_use || entry.path[0] || "hero_misc",
      pose: taxonomy.pose_detail || taxonomy.pose_group || "",
      framing: taxonomy.framing_group || "",
      outfit: taxonomy.outfit_group || "",
      environment: taxonomy.decor_group || "",
      mood: split(taxonomy.mood_palette),
      tags: split(taxonomy.tags),
      good_for: split(taxonomy.preferred_pillars),
      thumbnail_url: storage.publicUrl,
      convex_storage_id: String(storage.storageId),
      review_status: reviewStatus,
      qa_flag: taxonomy.qa_flag ?? null,
      enabled: taxonomy.enabled !== false && reviewStatus !== "REVIEW",
      weight: Number(taxonomy.weight ?? 1),
      use_count: Number(taxonomy.use_count ?? 0),
      updated_at: new Date().toISOString(),
      metadata: { drive_path: entry.path },
    });
    uploaded += 1;
  }

  const tasks: Array<() => Promise<void>> = [
    ...personaTree.map((entry) => () => syncPersona(entry)),
    ...stockTree.map((entry) => () => syncStock(entry)),
    ...refTree.map((entry) => () => syncReference(entry)),
  ];
  for (const task of tasks) {
    if (uploaded >= limit) break;
    try { await task(); }
    catch (error) {
      failed += 1;
      failures.push({ id: "unknown", name: "drive_asset", error: error instanceof Error ? error.message : String(error) });
    }
  }

  const result = {
    id: `SYNC_DRIVE_${Date.now()}`,
    workspace_id: "cortifree",
    event: "DRIVE_TO_CONVEX",
    status: failed ? "PARTIAL" : "SUCCESS",
    uploaded,
    skipped,
    failed,
    remaining_hint: Math.max(0, stockTree.filter((x) => isImage(x.file)).length + personaTree.filter((x) => isImage(x.file)).length + refTree.filter((x) => isImage(x.file)).length - skipped - uploaded),
    failures: failures.slice(0, 20),
    finished_at: new Date().toISOString(),
  };
  await dataBackend("system_logs", { method: "POST", body: JSON.stringify(result) });
  return result;
}
