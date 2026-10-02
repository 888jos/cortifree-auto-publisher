import { dataBackend } from "../data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../workspace";
import { listDriveChildren, searchDriveFiles, uploadDriveFile } from "../google/drive";
import { personaAssetFolder } from "../../../src/image-generation/core";
import { visualPersonaIdFor } from "../asset-selector";

const VISUAL_POOLS_ROOT = process.env.GOOGLE_DRIVE_VISUAL_POOLS_FOLDER_ID || "1f9ExgxZR_uKr6Rf4xVyAkvKWoNKUEenB";
const VISUAL_POOLS_ROOT_NAME = "RUNTIME_8_VISUAL_POOLS_2026-10-02";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const PERSONA_RE = /^(P\d{2})/i;
const PERSONA_BY_NAME: Record<string, string> = {
  EMMA: "P01", LILY: "P02", MAYA: "P03", NORA: "P04",
  GRACE: "P05", AVA: "P06", CHLOE: "P07", ISABELA: "P08",
  CAMILA: "P09", HANA: "P10", ZOEY: "P11", ELIANA: "P12",
  JADE: "P13", SOFIA: "P14", MIA: "P15", OLIVIA: "P16",
};

type Row = Record<string, unknown>;
type FolderNode = { id: string; path: string[] };

async function rows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function patchAsset(id: string, row: Row) {
  const response = await dataBackend(
    `assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(row) },
  );
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
  return Object.entries(PERSONA_BY_NAME).find(([name]) => filename.includes(`${name}_MASTER`))?.[1] ?? null;
}

function personaIdFromFolderPath(path: string[]) {
  for (const part of path) {
    const direct = part.match(PERSONA_RE)?.[1]?.toUpperCase();
    if (direct) return direct;
    const normalized = part.toUpperCase().replace(/[^A-Z]/g, "");
    if (PERSONA_BY_NAME[normalized]) return PERSONA_BY_NAME[normalized];
  }
  return null;
}

function categoryFolder(category: unknown) {
  return personaAssetFolder(String(category ?? "other"));
}

export async function syncPersonaGeneratedAssetsToDrive(options: { execute?: boolean } = {}) {
  const execute = Boolean(options.execute);
  const [assets, rootedFolders] = await Promise.all([
    rows(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&source_type=eq.persona_generated&select=id,filename,category,persona_id,public_url,metadata,enabled,drive_file_id,drive_path&limit=5000`),
    folders(VISUAL_POOLS_ROOT),
  ]);

  const folderTree = rootedFolders;

  const personaFolders = new Map<string, FolderNode>();
  for (const item of folderTree) {
    if (item.path.length !== 1) continue;
    const id = personaIdFromFolderPath(item.path);
    if (id && visualPersonaIdFor(id) === id && !personaFolders.has(id)) personaFolders.set(id, item);
  }

  const report: Row[] = [];
  for (const asset of assets) {
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? asset.metadata as Row
      : {};
    if (asset.enabled === false) {
      report.push({ id: asset.id, filename: asset.filename, status: "SKIPPED_DISABLED" });
      continue;
    }

    const personaId = String(asset.persona_id ?? "").match(/^P\d{2}$/i)?.[0]?.toUpperCase()
      ?? personaIdFromMaster((metadata.input_image_1 as Row | undefined)?.filename);

    if (!personaId) {
      report.push({ id: asset.id, filename: asset.filename, status: "UNASSIGNED_NO_MASTER" });
      continue;
    }

    const visualPersonaId = visualPersonaIdFor(personaId);
    if (!visualPersonaId) {
      report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "VISUAL_PERSONA_UNRESOLVED" });
      continue;
    }

    // Historical assets generated with a now-merged-away face stay in legacy storage.
    // Relabeling P04/Nora as P01/Emma (etc.) would corrupt identity continuity.
    if (personaId !== visualPersonaId) {
      report.push({
        id: asset.id,
        filename: asset.filename,
        persona_id: visualPersonaId,
        visual_persona_id: visualPersonaId,
        status: "SKIPPED_LEGACY_NONCANONICAL",
      });
      continue;
    }

    const personaFolder = personaFolders.get(visualPersonaId);
    if (!personaFolder) {
      if (execute && !asset.persona_id) {
        await patchAsset(String(asset.id), {
          persona_id: visualPersonaId,
          metadata: {
            ...metadata,
            reconciled_from_master: (metadata.input_image_1 as Row | undefined)?.filename ?? null,
            reconciled_at: new Date().toISOString(),
            drive_archive_status: "PENDING_FOLDER_ACCESS",
          },
        });
        report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "ATTRIBUTED_PENDING_DRIVE" });
      } else {
        report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "PERSONA_FOLDER_NOT_FOUND" });
      }
      continue;
    }

    const targetName = categoryFolder(asset.category);
    const target = folderTree.find((item) =>
      item.path.length === personaFolder.path.length + 1
      && item.path.slice(0, personaFolder.path.length).join("/") === personaFolder.path.join("/")
      && item.path.at(-1) === targetName
    );
    if (!target) {
      report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "CATEGORY_FOLDER_NOT_FOUND", target: targetName });
      continue;
    }

    const storedDriveFileId = String(asset.drive_file_id ?? metadata.drive_file_id ?? "").trim();
    const storedDrivePath = String(asset.drive_path ?? metadata.drive_path ?? "").trim();
    const alreadyInRuntimePool = Boolean(storedDriveFileId) && storedDrivePath.startsWith(`${VISUAL_POOLS_ROOT_NAME}/`);
    if (alreadyInRuntimePool) {
      report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "ALREADY_IN_DRIVE", drive_file_id: storedDriveFileId });
      continue;
    }

    if (!execute) {
      report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "READY_TO_ARCHIVE", target: [...target.path].join("/") });
      continue;
    }

    const attribution = {
      persona_id: visualPersonaId,
      metadata: {
        ...metadata,
        reconciled_from_master: (metadata.input_image_1 as Row | undefined)?.filename ?? null,
        reconciled_at: new Date().toISOString(),
      },
    };
    await patchAsset(String(asset.id), attribution);

    if (!asset.public_url) {
      report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "ATTRIBUTED_NOT_ARCHIVED" });
      continue;
    }

    const image = await fetch(String(asset.public_url), { signal: AbortSignal.timeout(30_000) });
    if (!image.ok) {
      report.push({ id: asset.id, filename: asset.filename, persona_id: visualPersonaId, status: "SOURCE_DOWNLOAD_FAILED", http_status: image.status });
      continue;
    }

    try {
      const existingDriveFile = (await listDriveChildren(target.id))
        .find((item) => item.name === String(asset.filename) && item.mimeType !== FOLDER_MIME);
      const uploaded = existingDriveFile ?? await uploadDriveFile({
        name: String(asset.filename),
        parentId: target.id,
        bytes: new Uint8Array(await image.arrayBuffer()),
        mimeType: image.headers.get("content-type") || "image/jpeg",
      });
      const canonicalDrivePath = [VISUAL_POOLS_ROOT_NAME, ...target.path, String(asset.filename)].join("/");
      const archivedAt = new Date().toISOString();
      await patchAsset(String(asset.id), {
        ...attribution,
        drive_file_id: uploaded.id,
        drive_path: canonicalDrivePath,
        canonical_updated_at: archivedAt,
        metadata: {
          ...attribution.metadata,
          drive_file_id: uploaded.id,
          drive_path: canonicalDrivePath,
          drive_archived_at: archivedAt,
          canonical_source: "MODELARK_TO_DRIVE",
        },
      });
      report.push({
        id: asset.id,
        filename: asset.filename,
        persona_id: visualPersonaId,
        status: "ARCHIVED_DRIVE",
        drive_file_id: uploaded.id,
        drive_path: canonicalDrivePath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await patchAsset(String(asset.id), {
        ...attribution,
        metadata: {
          ...attribution.metadata,
          drive_archive_status: "BLOCKED_SERVICE_ACCOUNT_STORAGE_QUOTA",
          drive_archive_error: message.slice(0, 500),
        },
      });
      report.push({
        id: asset.id,
        filename: asset.filename,
        persona_id: visualPersonaId,
        status: "DRIVE_UPLOAD_BLOCKED",
        error: message.slice(0, 500),
      });
    }
  }

  return {
    ok: true,
    execute,
    drive_root: VISUAL_POOLS_ROOT,
    drive_root_name: VISUAL_POOLS_ROOT_NAME,
    discovered_persona_folders: personaFolders.size,
    folder_tree_count: folderTree.length,
    total: report.length,
    assigned: report.filter((item) => item.persona_id).length,
    archived: report.filter((item) => item.status === "ARCHIVED_DRIVE").length,
    report,
  };
}
