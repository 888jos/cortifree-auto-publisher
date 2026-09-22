import { backendMode, dataBackend } from "../data-backend";
import { uploadConvexFile } from "../convex-storage";
import { listDriveChildren, getDriveFile, downloadDriveFile, type DriveFile } from "../google/drive";
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
function visualList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "").split(/[|,]/).map((item) => item.trim()).filter(Boolean);
}
async function walk(folderId: string, path: string[] = [], out: WalkedFile[] = []): Promise<WalkedFile[]> {
  const children = await listDriveChildren(folderId);
  const files = children.filter((child) => child.mimeType !== FOLDER_MIME).map((file) => ({ file, path }));
  out.push(...files);
  const folders = children.filter((child) => child.mimeType === FOLDER_MIME);
  const nested = await Promise.all(folders.map((folder) => walk(folder.id, [...path, folder.name])));
  for (const entries of nested) out.push(...entries);
  return out;
}
async function backendRows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function upsert(table: string, row: Row, conflictFields = ["id"]) {
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
async function patch(table: string, id: string, row: Row) {
  const response = await dataBackend(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(await response.text());
}
function md5Matches(existing: Row | undefined, file: DriveFile) {
  return Boolean(existing?.public_url && file.md5Checksum && existing.drive_md5 === file.md5Checksum);
}
function canonicalArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).sort() : [];
}
function sameCanonicalValue(left: unknown, right: unknown) {
  return JSON.stringify(canonicalArray(left)) === JSON.stringify(canonicalArray(right));
}
async function upload(file: DriveFile) {
  const downloaded = await downloadDriveFile(file.id);
  return await uploadConvexFile(downloaded.bytes, downloaded.contentType || file.mimeType);
}

function sheetReviewStatus(row: Row) {
  return String(row.review_status ?? "").trim().toUpperCase();
}
function sheetQaFlag(row: Row) {
  return String(row.qa_flag ?? "").trim().toUpperCase();
}
function sheetSelectable(row: Row) {
  return row.enabled !== false && !["DUPLICATE", "REVIEW"].includes(sheetReviewStatus(row)) && sheetQaFlag(row) !== "MULTI_PERSON_AUTO_DISABLED";
}
function runtimeMetadata(row: Row) {
  const metadata = row.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Row : {};
}

const syncLocks = new Map<string, Promise<unknown>>();

async function syncGoogleDriveToBackendUnlocked(options: { limit?: number; offset?: number; scope?: "all" | "visual_refs" | "visual_refs_missing" | "assets" | "stock" | "stock_missing" } = {}) {
  const limit = Math.max(1, Math.min(250, options.limit ?? Number(process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 40)));
  const offset = Math.max(0, options.offset ?? 0);
  const scope = options.scope ?? "all";
  const refTaxonomyPromise = readSheetObjects("08_VISUAL_REFS", "A1:X300");
  const refTreePromise = scope === "visual_refs" || scope === "visual_refs_missing" || scope === "assets" || scope === "stock" || scope === "stock_missing"
    ? Promise.resolve([])
    : walk(VISUAL_REFS_ROOT);
  const [stockTaxonomy, refTaxonomy, stockTree, personaTree, refTree, existingAssets, existingRefs] = await Promise.all([
    scope === "visual_refs" ? Promise.resolve([]) : readSheetObjects("08_STOCK_ASSETS", "A1:AH500"),
    refTaxonomyPromise,
    scope === "visual_refs" || scope === "visual_refs_missing" || scope === "assets" || scope === "stock" || scope === "stock_missing" ? Promise.resolve([]) : walk(STOCK_ROOT),
    scope === "visual_refs" || scope === "visual_refs_missing" || scope === "stock" || scope === "stock_missing" ? Promise.resolve([]) : walk(PERSONAS_ROOT),
    refTreePromise,
    scope === "visual_refs" ? Promise.resolve([]) : backendRows("assets?select=*&limit=5000"),
    backendRows("visual_references?select=*&limit=5000"),
  ]);
  const stockByDrive = new Map(stockTaxonomy.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const refsByDrive = new Map(refTaxonomy.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const assetByDrive = new Map(existingAssets.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const assetByFilename = new Map(existingAssets.filter((row) => row.filename).map((row) => [String(row.filename).trim().toLowerCase(), row]));
  const assetByMd5 = new Map(existingAssets.filter((row) => row.drive_md5).map((row) => [String(row.drive_md5), row]));
  const refByDrive = new Map(existingRefs.filter((row) => row.drive_file_id).map((row) => [String(row.drive_file_id), row]));
  const refById = new Map(existingRefs.filter((row) => row.id).map((row) => [String(row.id), row]));
  const refByHash = new Map<string, Row>();
  for (const row of existingRefs.filter((item) => item.file_hash)) {
    const hash = String(row.file_hash);
    const current = refByHash.get(hash);
    const rank = (candidate: Row) => candidate.enabled === true && !["DUPLICATE", "REVIEW"].includes(String(runtimeMetadata(candidate).review_status ?? "").toUpperCase()) && String(runtimeMetadata(candidate).qa_flag ?? "").toUpperCase() !== "MULTI_PERSON_AUTO_DISABLED" ? 0 : 1;
    if (!current || rank(row) < rank(current)) refByHash.set(hash, row);
  }
  let uploaded = 0;
  let skipped = 0;
  let metadataRepaired = 0;
  let duplicatesSkipped = 0;
  const resolvedRefIds = new Set<string>();
  let failed = 0;
  const failures: Array<{ id: string; name: string; error: string }> = [];

  // Stock is canonical in 08_STOCK_ASSETS. For an assets-only run, avoid a
  // second full Drive tree walk: repair metadata in place and fetch only
  // canonical rows that are genuinely missing from runtime storage.
  const stockEntries: WalkedFile[] = scope === "stock_missing"
    ? (await Promise.all(stockTaxonomy.filter((row) => row.drive_file_id && !assetByDrive.has(String(row.drive_file_id)) && !assetByFilename.has(String(row.filename ?? "").trim().toLowerCase()) && !assetByMd5.has(String(row.drive_md5 ?? row.md5 ?? ""))).map(async (row) => {
      try {
        return { file: await getDriveFile(String(row.drive_file_id)), path: [String(row.category || "uncategorized")] };
      } catch (error) {
        failures.push({ id: String(row.drive_file_id), name: String(row.filename ?? "stock_asset"), error: error instanceof Error ? error.message : "Drive file lookup failed" });
        return null;
      }
    }))).filter((entry): entry is WalkedFile => Boolean(entry))
    : stockTree;

  const visualRefEntries: WalkedFile[] = scope === "visual_refs_missing"
    ? (await Promise.all(refTaxonomy.filter((row) => row.drive_file_id && !refById.has(String(row.ref_id))).slice(offset, offset + limit).map(async (row) => {
      try {
        return { file: await getDriveFile(String(row.drive_file_id)), path: [String(row.carousel_use || row.category || "hero_misc")] };
      } catch (error) {
        failures.push({ id: String(row.drive_file_id), name: String(row.ref_id ?? "visual_reference"), error: error instanceof Error ? error.message : "Drive file lookup failed" });
        return null;
      }
    }))).filter((entry): entry is WalkedFile => Boolean(entry))
    : refTree;

  if (scope === "visual_refs" || scope === "visual_refs_missing") {
    const refRepairs = refTaxonomy.map((row) => {
      const existing = refById.get(String(row.ref_id ?? ""));
      if (!existing) return null;
      const expected: Row = {
        category: row.carousel_use || row.category || "hero_misc",
        source_url: row.source_url ?? null,
        source_platform: row.source_platform || "manual",
        pose: row.pose_detail || row.pose_group || "",
        framing: row.framing_group || "",
        outfit: row.outfit_group || "",
        environment: row.decor_group || "",
        lighting: row.lighting_group || "",
        mood: split(row.mood_palette),
        orientation: row.orientation || "portrait",
        tags: split(row.tags),
        good_for: split(row.preferred_pillars),
        enabled: sheetSelectable(row),
        metadata: { qa_flag: row.qa_flag ?? null, review_status: row.review_status ?? null, canonical_source: "08_VISUAL_REFS" },
      };
      const changed = String(existing.category ?? "") !== String(expected.category)
        || String(existing.pose ?? "") !== String(expected.pose)
        || String(existing.framing ?? "") !== String(expected.framing)
        || String(existing.outfit ?? "") !== String(expected.outfit)
        || String(existing.environment ?? "") !== String(expected.environment)
        || String(existing.lighting ?? "") !== String(expected.lighting)
        || existing.enabled !== expected.enabled
        || !sameCanonicalValue(existing.tags, expected.tags)
        || !sameCanonicalValue(existing.good_for, expected.good_for);
      return changed ? { id: String(existing.id), expected } : null;
    }).filter((repair): repair is { id: string; expected: Row } => Boolean(repair));
    for (let index = 0; index < refRepairs.length; index += 20) {
      const batch = refRepairs.slice(index, index + 20);
      await Promise.all(batch.map(({ id, expected }) => patch("visual_references", id, { ...expected, updated_at: new Date().toISOString() })));
      metadataRepaired += batch.length;
    }
  }

  if (scope === "assets" || scope === "stock" || scope === "stock_missing") {
    const repairs: Array<{ id: string; row: Row; existing: Row; expectedCategory: string; expectedSubcategory: string }> = [];
    for (const row of stockTaxonomy) {
      const existing = row.drive_file_id
        ? assetByDrive.get(String(row.drive_file_id)) ?? assetByFilename.get(String(row.filename ?? "").trim().toLowerCase()) ?? assetByMd5.get(String(row.drive_md5 ?? row.md5 ?? ""))
        : assetByFilename.get(String(row.filename ?? "").trim().toLowerCase()) ?? assetByMd5.get(String(row.drive_md5 ?? row.md5 ?? ""));
      if (!existing || !row.drive_file_id) continue;
      const expectedCategory = String(row.category || existing.category || "uncategorized");
      const expectedSubcategory = String(row.scene || row.category || existing.subcategory || "uncategorized");
      const metadataNeedsRepair = String(existing.category ?? "") !== expectedCategory
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
        || String(existing.visual_tagging_schema ?? "") !== String(row.visual_tagging_schema ?? "")
        || String(existing.visual_review_status ?? "") !== String(row.visual_review_status ?? "")
        || String(existing.visual_reviewed_at ?? "") !== String(row.visual_reviewed_at ?? "")
        || !sameCanonicalValue(existing.tags, split(row.tags))
        || !sameCanonicalValue(existing.good_for, split(row.good_for_pillars));
      if (!metadataNeedsRepair) continue;
      repairs.push({ id: String(existing.id), row, existing, expectedCategory, expectedSubcategory });
    }
    for (let index = 0; index < repairs.length; index += 20) {
      const batch = repairs.slice(index, index + 20);
      await Promise.all(batch.map(async ({ id, row, existing, expectedCategory, expectedSubcategory }) => {
        await patch("assets", id, {
          category: expectedCategory,
          subcategory: expectedSubcategory,
          scene: row.scene ?? "",
          framing: row.framing ?? "",
          activity: row.activity ?? "",
          mood: row.mood ?? "",
          visual_description: row.visual_description ?? "",
          visible_objects: visualList(row.visible_objects),
          visible_actions: visualList(row.visible_actions),
          setting: row.setting ?? "",
          people_visibility: row.people_visibility ?? "",
          body_parts_visible: visualList(row.body_parts_visible),
          composition: row.composition ?? "",
          camera_angle: row.camera_angle ?? "",
          lighting: row.lighting ?? "",
          dominant_colors: visualList(row.dominant_colors),
          text_in_image: row.text_in_image ?? "",
          specific_details: row.specific_details ?? "",
          visual_tagging_schema: row.visual_tagging_schema ?? "",
          visual_review_status: row.visual_review_status ?? "",
          visual_reviewed_at: row.visual_reviewed_at ?? null,
          tags: split(row.tags),
          good_for: split(row.good_for_pillars),
          enabled: row.enabled !== false,
          metadata: { ...runtimeMetadata(existing), canonical_source: "08_STOCK_ASSETS", sheet_sync_status: row.sync_status ?? null, visual_tagging_schema: row.visual_tagging_schema ?? "", visual_review_status: row.visual_review_status ?? "", visual_reviewed_at: row.visual_reviewed_at ?? null },
          indexed_at: new Date().toISOString(),
        });
      }));
      metadataRepaired += batch.length;
    }
  }

  async function syncStock(entry: WalkedFile) {
    if (!isImage(entry.file) || uploaded >= limit) return;
    const taxonomy = stockByDrive.get(entry.file.id) ?? {};
    const existing = assetByDrive.get(entry.file.id)
      ?? assetByFilename.get(entry.file.name.trim().toLowerCase())
      ?? (entry.file.md5Checksum ? assetByMd5.get(entry.file.md5Checksum) : undefined);
    const category = String(taxonomy.category || entry.path[0] || "uncategorized");
    const selectable = sheetSelectable(taxonomy);
    const canonicalMetadata = {
      category,
      subcategory: taxonomy.scene || category,
      scene: taxonomy.scene ?? null,
      framing: taxonomy.framing ?? null,
      activity: taxonomy.activity ?? null,
      mood: taxonomy.mood ?? null,
      visual_description: taxonomy.visual_description ?? "",
      visible_objects: visualList(taxonomy.visible_objects),
      visible_actions: visualList(taxonomy.visible_actions),
      setting: taxonomy.setting ?? "",
      people_visibility: taxonomy.people_visibility ?? "",
      body_parts_visible: visualList(taxonomy.body_parts_visible),
      composition: taxonomy.composition ?? "",
      camera_angle: taxonomy.camera_angle ?? "",
      lighting: taxonomy.lighting ?? "",
      dominant_colors: visualList(taxonomy.dominant_colors),
      text_in_image: taxonomy.text_in_image ?? "",
      specific_details: taxonomy.specific_details ?? "",
      visual_tagging_schema: taxonomy.visual_tagging_schema ?? "",
      visual_review_status: taxonomy.visual_review_status ?? "",
      visual_reviewed_at: taxonomy.visual_reviewed_at ?? null,
      tags: split(taxonomy.tags),
      good_for: split(taxonomy.good_for_pillars),
      enabled: selectable,
      metadata: { drive_path: entry.path, stock_key: taxonomy.stock_key ?? null, sheet_sync_status: taxonomy.sync_status ?? null, review_status: taxonomy.review_status ?? null, qa_flag: taxonomy.qa_flag ?? null, visual_tagging_schema: taxonomy.visual_tagging_schema ?? "", visual_review_status: taxonomy.visual_review_status ?? "", visual_reviewed_at: taxonomy.visual_reviewed_at ?? null, canonical_source: "08_STOCK_ASSETS" },
      indexed_at: new Date().toISOString(),
    };
    if (existing && (md5Matches(existing, entry.file) || existing.filename === entry.file.name || existing.drive_file_id === entry.file.id)) {
      await patch("assets", String(existing.id), {
        ...canonicalMetadata,
        drive_file_id: existing.drive_file_id ?? entry.file.id,
        drive_md5: existing.drive_md5 ?? entry.file.md5Checksum ?? null,
        drive_modified_time: entry.file.modifiedTime ?? existing.drive_modified_time ?? null,
      });
      metadataRepaired += 1;
      skipped += 1;
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
      storage_bucket: backendMode(),
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
    const reviewStatus = sheetReviewStatus(taxonomy);
    const qaFlag = sheetQaFlag(taxonomy);
    const selectable = sheetSelectable(taxonomy);
    const refId = String(taxonomy.ref_id ?? "");
    const canonicalMetadata = {
      category: taxonomy.carousel_use || entry.path[0] || "hero_misc",
      source_url: taxonomy.source_url ?? null,
      source_platform: taxonomy.source_platform || "manual",
      pose: taxonomy.pose_detail || taxonomy.pose_group || "",
      framing: taxonomy.framing_group || "",
      outfit: taxonomy.outfit_group || "",
      environment: taxonomy.decor_group || "",
      lighting: taxonomy.lighting_group || "",
      mood: split(taxonomy.mood_palette),
      orientation: taxonomy.orientation || "portrait",
      tags: split(taxonomy.tags),
      good_for: split(taxonomy.preferred_pillars),
      metadata: { drive_file_id: entry.file.id, drive_path: entry.path, qa_flag: taxonomy.qa_flag ?? null, review_status: taxonomy.review_status ?? null, canonical_source: "08_VISUAL_REFS" },
      enabled: selectable,
      updated_at: new Date().toISOString(),
    };
    if (reviewStatus === "DUPLICATE" || qaFlag === "MULTI_PERSON_AUTO_DISABLED") {
      if (existing?.id) await patch("visual_references", String(existing.id), { ...canonicalMetadata, enabled: false });
      duplicatesSkipped += 1;
      skipped += 1;
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
      if (!metadataNeedsRepair && existing.enabled === canonicalMetadata.enabled) { if (refId) resolvedRefIds.add(refId); skipped += 1; return; }
      await patch("visual_references", String(existing.id), { ...canonicalMetadata, drive_file_id: entry.file.id });
      if (refId) resolvedRefIds.add(refId);
      metadataRepaired += 1;
      skipped += 1;
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
          duplicatesSkipped += 1;
          skipped += 1;
          return;
        }
        await patch("visual_references", String(canonical.id), { ...canonicalMetadata, drive_file_id: entry.file.id });
        if (refId) resolvedRefIds.add(refId);
        metadataRepaired += 1;
        skipped += 1;
        return;
      }
    }
    const storage = await upload(entry.file);
    await upsert("visual_references", {
      id: taxonomy.ref_id || `VR_DRIVE_${entry.file.id}`,
      workspace_id: "cortifree",
      storage_path: storage.publicUrl,
      ...canonicalMetadata,
      thumbnail_url: storage.publicUrl,
      file_hash: entry.file.md5Checksum ?? null,
      drive_file_id: entry.file.id,
    }, ["workspace_id", "drive_file_id"]);
    if (refId) resolvedRefIds.add(refId);
    uploaded += 1;
  }

  const tasks: Array<() => Promise<void>> = scope === "visual_refs" || scope === "visual_refs_missing"
    ? visualRefEntries.map((entry) => () => syncReference(entry))
    : scope === "assets" || scope === "stock" || scope === "stock_missing"
      ? [...personaTree.map((entry) => () => syncPersona(entry)), ...stockEntries.map((entry) => () => syncStock(entry))]
      : [
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

  const stockAuditRows = stockTaxonomy.map((row) => {
    const existing = row.drive_file_id
      ? assetByDrive.get(String(row.drive_file_id)) ?? assetByFilename.get(String(row.filename ?? "").trim().toLowerCase()) ?? assetByMd5.get(String(row.drive_md5 ?? row.md5 ?? ""))
      : assetByFilename.get(String(row.filename ?? "").trim().toLowerCase()) ?? assetByMd5.get(String(row.drive_md5 ?? row.md5 ?? ""));
    return { row, existing, status: existing ? `INDEXED_${backendMode().toUpperCase()}` : "DRIVE_ONLY_NEEDS_SYNC" };
  });
  const visualAuditRows = refTaxonomy.map((row) => {
    const existing = row.ref_id ? refById.get(String(row.ref_id)) : undefined;
    const byHash = row.file_hash ? refByHash.get(String(row.file_hash)) : undefined;
    const resolved = row.ref_id ? resolvedRefIds.has(String(row.ref_id)) : false;
    return { row, existing: existing ?? byHash, status: existing || byHash || resolved ? `INDEXED_${backendMode().toUpperCase()}` : "DRIVE_ONLY_NEEDS_SYNC" };
  });
  const statusCounts = (items: Array<{ status: string }>) => items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  const result = {
    id: `SYNC_DRIVE_${Date.now()}`,
    workspace_id: "cortifree",
    event: backendMode() === "supabase" ? "DRIVE_TO_SUPABASE" : "DRIVE_TO_CONVEX",
    status: failed ? "PARTIAL" : "SUCCESS",
    uploaded,
    skipped,
    duplicates_skipped: duplicatesSkipped,
    metadata_repaired: metadataRepaired,
    failed,
    remaining_hint: Math.max(0, (scope === "visual_refs" ? refTree : [...stockTree, ...personaTree, ...refTree]).filter((x) => isImage(x.file)).length - skipped - uploaded),
    scope,
    failures: failures.slice(0, 20),
    audit: {
      sheet_count: scope === "visual_refs" || scope === "visual_refs_missing" ? refTaxonomy.length : stockTaxonomy.length,
      drive_count: scope === "visual_refs" || scope === "visual_refs_missing"
        ? refTaxonomy.filter((row) => row.drive_file_id).length
        : stockTree.length ? stockTree.filter((entry) => isImage(entry.file)).length : stockTaxonomy.filter((row) => row.drive_file_id).length,
      runtime_count: scope === "visual_refs" || scope === "visual_refs_missing" ? existingRefs.length : existingAssets.filter((row) => row.source_type === "stock").length,
      missing_runtime: scope === "visual_refs" || scope === "visual_refs_missing"
        ? refTaxonomy.filter((row) => row.ref_id && !refById.has(String(row.ref_id)) && !refByHash.has(String(row.file_hash ?? "")) && !resolvedRefIds.has(String(row.ref_id)) && sheetSelectable(row)).length
        : stockTaxonomy.filter((row) => row.drive_file_id && !assetByDrive.has(String(row.drive_file_id)) && !assetByFilename.has(String(row.filename ?? "").trim().toLowerCase()) && !assetByMd5.has(String(row.drive_md5 ?? row.md5 ?? ""))).length,
      duplicates_skipped: duplicatesSkipped,
      metadata_repaired: metadataRepaired,
      uploaded,
      stock_drive_images: scope === "assets" || scope === "stock" || scope === "stock_missing" ? stockTaxonomy.length : stockTree.filter((entry) => isImage(entry.file)).length,
      stock_sheet_rows: stockTaxonomy.length,
      stock_sheet_columns: Object.keys(stockTaxonomy[0] ?? {}),
      stock_sheet_sample: stockTaxonomy[0] ?? null,
      stock_status_counts: statusCounts(stockAuditRows),
      stock_drive_only_rows: stockAuditRows.filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC").map(({ row }) => String(row.stock_key ?? row.drive_file_id ?? "unknown")),
      stock_runtime_missing_rows: stockAuditRows.filter((item) => item.status === "DRIVE_ONLY_NEEDS_SYNC").map(({ row }) => String(row.stock_key ?? row.drive_file_id)),
      visual_ref_status_counts: statusCounts(visualAuditRows),
      visual_ref_drive_images: scope === "visual_refs" || scope === "visual_refs_missing" ? refTaxonomy.length : refTree.filter((entry) => isImage(entry.file)).length,
      visual_ref_sheet_rows: refTaxonomy.length,
      visual_ref_runtime_missing_rows: refTaxonomy.filter((row) => row.ref_id && !refById.has(String(row.ref_id))).map((row) => String(row.ref_id)),
      canonical_metadata_repaired: metadataRepaired,
    },
    finished_at: new Date().toISOString(),
  };
  const logResponse = await dataBackend("system_logs", {
    method: "POST",
    body: JSON.stringify({ created_at: result.finished_at, stage: result.event, status: result.status, metadata: result }),
  });
  if (!logResponse.ok) throw new Error(`Sync log write failed: ${await logResponse.text()}`);
  return result;
}

/** Serialize syncs per scope in one process; database unique keys protect
 * concurrent Vercel instances and retries across processes. */
export async function syncGoogleDriveToConvex(options: { limit?: number; offset?: number; scope?: "all" | "visual_refs" | "visual_refs_missing" | "assets" | "stock" | "stock_missing" } = {}) {
  const key = `${backendMode()}:${options.scope ?? "all"}`;
  const previous = syncLocks.get(key) ?? Promise.resolve();
  const current = previous.then(() => syncGoogleDriveToBackendUnlocked(options));
  syncLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (syncLocks.get(key) === current) syncLocks.delete(key);
  }
}
