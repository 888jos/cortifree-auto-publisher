import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";
import { listDriveChildren, uploadDriveFile, type DriveFile } from "../../../lib/google/drive";
import { personaAssetFolder } from "../../../../src/image-generation/core";

export const runtime = "nodejs";
export const maxDuration = 300;

const PERSONAS_ROOT = process.env.GOOGLE_DRIVE_PERSONAS_FOLDER_ID || "1cnDHDfAGgwOxTT_kJsZNpnRHvB5sY6Ps";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const PERSONA_RE = /^(P\d{2})/i;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.CORTIFREE_ADMIN_SECRET;
  return Boolean(secret && (request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret || request.headers.get("x-admin-token") === secret || request.headers.get("x-admin-password") === process.env.CORTIFREE_ADMIN_PASSWORD));
}

type Row = Record<string, unknown>;
type FolderNode = { id: string; path: string[] };

async function rows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function patchAsset(id: string, row: Row) {
  const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(row) });
  if (!response.ok) throw new Error(await response.text());
}

async function folders(folderId: string, path: string[] = [], out: FolderNode[] = []) {
  const children = await listDriveChildren(folderId);
  for (const child of children.filter((item) => item.mimeType === FOLDER_MIME)) {
    const next = { id: child.id, path: [...path, child.name] };
    out.push(next);
    await folders(child.id, next.path, out);
  }
  return out;
}

function personaIdFromMaster(value: unknown) {
  const filename = String(value ?? "").toUpperCase();
  const direct = filename.match(/P\d{2}/)?.[0];
  if (direct) return direct;
  const names: Record<string, string> = { EMMA: "P01", LILY: "P02", MAYA: "P03", NORA: "P04", GRACE: "P05", AVA: "P06", CHLOE: "P07", ISABELA: "P08", CAMILA: "P09", HANA: "P10", ZOEY: "P11", ELIANA: "P12", JADE: "P13", SOFIA: "P14", MIA: "P15", OLIVIA: "P16" };
  return Object.entries(names).find(([name]) => filename.includes(`${name}_MASTER`))?.[1] ?? null;
}

function categoryFolder(category: unknown) {
  return personaAssetFolder(String(category ?? "other"));
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const execute = url.searchParams.get("execute") === "true";
  try {
    const [assets, folderTree] = await Promise.all([
      rows(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&source_type=eq.persona_generated&select=id,filename,category,persona_id,public_url,metadata,enabled&limit=5000`),
      folders(PERSONAS_ROOT),
    ]);
    const personaFolders = new Map<string, FolderNode>();
    for (const item of folderTree) {
      const id = item.path.find((part) => PERSONA_RE.test(part))?.match(PERSONA_RE)?.[1]?.toUpperCase();
      if (id && !personaFolders.has(id)) personaFolders.set(id, item);
    }
    const report: Row[] = [];
    for (const asset of assets) {
      const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata as Row : {};
      const personaId = String(asset.persona_id ?? "").match(/^P\d{2}$/i)?.[0]?.toUpperCase() ?? personaIdFromMaster((metadata.input_image_1 as Row | undefined)?.filename);
      if (!personaId) { report.push({ id: asset.id, filename: asset.filename, status: "UNASSIGNED_NO_MASTER" }); continue; }
      const personaFolder = personaFolders.get(personaId);
      if (!personaFolder) { report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "PERSONA_FOLDER_NOT_FOUND" }); continue; }
      const targetName = categoryFolder(asset.category);
      const target = folderTree.find((item) => item.path.length === personaFolder.path.length + 1 && item.path.slice(0, personaFolder.path.length).join("/") === personaFolder.path.join("/") && item.path.at(-1) === targetName);
      if (!target) { report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "CATEGORY_FOLDER_NOT_FOUND", target: targetName }); continue; }
      const storedDriveFileId = String(metadata.drive_file_id ?? "").trim();
      if (storedDriveFileId) { report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "ALREADY_IN_DRIVE", drive_file_id: storedDriveFileId }); continue; }
      if (!execute) { report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "READY_TO_ARCHIVE", target: [...target.path].join("/") }); continue; }
      const attribution = { persona_id: personaId, metadata: { ...metadata, reconciled_from_master: (metadata.input_image_1 as Row | undefined)?.filename ?? null, reconciled_at: new Date().toISOString() } };
      // Preserve the identity attribution even when an old test output no longer
      // has a downloadable Supabase URL. This makes the audit truthful without
      // pretending that the missing bytes were archived.
      await patchAsset(String(asset.id), attribution);
      if (!asset.public_url) { report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "ATTRIBUTED_NOT_ARCHIVED" }); continue; }
      const image = await fetch(String(asset.public_url), { signal: AbortSignal.timeout(30_000) });
      if (!image.ok) { report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "SOURCE_DOWNLOAD_FAILED", http_status: image.status }); continue; }
      const existingDriveFile = (await listDriveChildren(target.id)).find((item) => item.name === String(asset.filename) && item.mimeType !== FOLDER_MIME);
      const uploaded = existingDriveFile ?? await uploadDriveFile({ name: String(asset.filename), parentId: target.id, bytes: new Uint8Array(await image.arrayBuffer()), mimeType: image.headers.get("content-type") || "image/jpeg" });
      // Keep the archive pointer in metadata because older production schemas
      // may not yet have the additive drive_file_id column. The pointer is
      // still canonical and makes retries idempotent by filename and ID.
      await patchAsset(String(asset.id), { ...attribution, metadata: { ...attribution.metadata, drive_file_id: uploaded.id, drive_path: [...target.path, String(asset.filename)].join("/"), drive_archived_at: new Date().toISOString(), canonical_source: "MODELARK_TO_DRIVE" } });
      report.push({ id: asset.id, filename: asset.filename, persona_id: personaId, status: "ARCHIVED_DRIVE", drive_file_id: uploaded.id, drive_path: [...target.path, String(asset.filename)].join("/") });
    }
    return Response.json({ ok: true, execute, total: report.length, assigned: report.filter((item) => item.persona_id).length, archived: report.filter((item) => item.status === "ARCHIVED_DRIVE").length, report });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
