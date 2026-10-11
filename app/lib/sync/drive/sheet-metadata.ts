import type { Row } from "./upsert";
import type { WalkedFile } from "./walk";

// Mapping from the taxonomy Sheets (08_STOCK_ASSETS, 08_VISUAL_REFS) and
// Drive filenames to runtime asset/reference metadata.

export function split(value: unknown) {
  return String(value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
}
export function visualList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "").split(/[|,]/).map((item) => item.trim()).filter(Boolean);
}
export function canonicalArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).sort() : [];
}
export function sameCanonicalValue(left: unknown, right: unknown) {
  return JSON.stringify(canonicalArray(left)) === JSON.stringify(canonicalArray(right));
}
export function sameTimestamp(left: unknown, right: unknown) {
  const leftText = String(left ?? "").trim();
  const rightText = String(right ?? "").trim();
  if (!leftText || !rightText) return leftText === rightText;
  const leftTime = Date.parse(leftText);
  const rightTime = Date.parse(rightText);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? leftTime === rightTime : leftText === rightText;
}

export function sheetReviewStatus(row: Row) {
  return String(row.review_status ?? "").trim().toUpperCase();
}
export function sheetQaFlag(row: Row) {
  return String(row.qa_flag ?? "").trim().toUpperCase();
}
export function visualTaggingSchema(row: Row) {
  const explicit = String(row.visual_tagging_schema ?? "").trim();
  if (explicit) return explicit;
  const status = String(row.visual_review_status ?? row.review_status ?? "").trim().toUpperCase();
  return status === "IMAGE_INSPECTED_V2" ? "observable_v2" : status === "IMAGE_INSPECTED_V1" ? "observable_v1" : "";
}
export function sheetSelectable(row: Row) {
  return row.enabled !== false && !["DUPLICATE", "REVIEW"].includes(sheetReviewStatus(row)) && sheetQaFlag(row) !== "MULTI_PERSON_AUTO_DISABLED";
}
export function runtimeMetadata(row: Row) {
  const metadata = row.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Row : {};
}

export function appScreenDescriptor(filename: string) {
  const normalized = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^CF_APP_SCREEN_\d+_/i, "")
    .replace(/_\d+$/i, "")
    .toLowerCase();
  const tags = [...new Set([
    "cortifree", "app", "screenshot", "official",
    ...normalized.split(/[^a-z0-9]+/).filter(Boolean),
  ])];
  return {
    subcategory: normalized || "app_screen",
    tags,
    description: `Official CortiFree app screenshot: ${normalized.replace(/_/g, " ")}`,
  };
}

// 08_STOCK_ASSETS row -> asset columns, for an asset already in Supabase.
// Vision V2 review fields on the existing row win over the Sheet.
export function stockSheetRepairFields(row: Row, existing: Row, expectedCategory: string, expectedSubcategory: string, existingIsVisionV2: boolean): Row {
  return {
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
    visual_tagging_schema: visualTaggingSchema(row),
    visual_review_status: row.visual_review_status ?? "",
    visual_reviewed_at: row.visual_reviewed_at ?? null,
    tags: split(row.tags),
    good_for: split(row.good_for_pillars),
    enabled: row.enabled !== false,
    canonical_updated_at: existing.drive_modified_time ?? existing.canonical_updated_at ?? null,
    synced_at: new Date().toISOString(),
    source_hash: existing.drive_md5 ?? existing.source_hash ?? null,
    sync_status: "SYNCED",
    sync_error: null,
    metadata: { ...runtimeMetadata(existing), canonical_source: "08_STOCK_ASSETS", sheet_sync_status: row.sync_status ?? null, visual_tagging_schema: existingIsVisionV2 ? "observable_v2" : visualTaggingSchema(row), visual_review_status: existingIsVisionV2 ? "IMAGE_INSPECTED_V2" : row.visual_review_status ?? "", visual_reviewed_at: existingIsVisionV2 ? existing.visual_reviewed_at ?? runtimeMetadata(existing).visual_reviewed_at ?? null : row.visual_reviewed_at ?? null },
    indexed_at: new Date().toISOString(),
  };
}

// 08_STOCK_ASSETS row + Drive file -> asset columns written on sync.
export function stockCanonicalMetadata(taxonomy: Row, entry: WalkedFile, existing: Row | undefined, category: string, selectable: boolean) {
  return {
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
    visual_tagging_schema: visualTaggingSchema(taxonomy),
    visual_review_status: taxonomy.visual_review_status ?? "",
    visual_reviewed_at: taxonomy.visual_reviewed_at ?? null,
    tags: split(taxonomy.tags),
    good_for: split(taxonomy.good_for_pillars),
    // A reference disabled at runtime (collage output, wrong label) stays off.
    enabled: selectable && !String(runtimeMetadata(existing ?? {}).disabled_reason ?? "").trim(),
    canonical_updated_at: entry.file.modifiedTime ?? null,
    synced_at: new Date().toISOString(),
    source_hash: entry.file.md5Checksum ?? null,
    sync_status: "SYNCED",
    sync_error: null,
    metadata: { ...(existing ? runtimeMetadata(existing) : {}), drive_path: entry.path, stock_key: taxonomy.stock_key ?? null, sheet_sync_status: taxonomy.sync_status ?? null, review_status: taxonomy.review_status ?? null, qa_flag: taxonomy.qa_flag ?? null, visual_tagging_schema: visualTaggingSchema(taxonomy), visual_review_status: taxonomy.visual_review_status ?? "", visual_reviewed_at: taxonomy.visual_reviewed_at ?? null, canonical_source: "08_STOCK_ASSETS" },
    indexed_at: new Date().toISOString(),
  };
}

// 08_VISUAL_REFS row -> expected visual_references columns.
export function visualRefSheetExpected(row: Row): Row {
  return {
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
}

// 08_VISUAL_REFS row + Drive file -> visual_references columns written on sync.
export function visualRefCanonicalMetadata(taxonomy: Row, entry: WalkedFile, existing: Row | undefined, selectable: boolean) {
  return {
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
    metadata: { ...(existing ? runtimeMetadata(existing) : {}), drive_file_id: entry.file.id, drive_path: entry.path, qa_flag: taxonomy.qa_flag ?? null, review_status: taxonomy.review_status ?? null, canonical_source: "08_VISUAL_REFS" },
    enabled: selectable,
    canonical_updated_at: entry.file.modifiedTime ?? null,
    synced_at: new Date().toISOString(),
    source_hash: entry.file.md5Checksum ?? null,
    sync_status: "SYNCED",
    sync_error: null,
    updated_at: new Date().toISOString(),
  };
}

// Drive app screenshot -> asset columns (everything but the storage location).
export function appScreenRow(entry: WalkedFile, current: Row | undefined, syncedAt: string): Row {
  const descriptor = appScreenDescriptor(entry.file.name);
  const metadata = {
    ...(current ? runtimeMetadata(current) : {}),
    drive_file_id: entry.file.id,
    drive_path: ["12_CORTIFREE_APP_SCREENS", ...entry.path, entry.file.name],
    canonical_source: "12_CORTIFREE_APP_SCREENS",
    official_app_screen: true,
  };
  return {
    workspace_id: "cortifree",
    drive_file_id: entry.file.id,
    drive_md5: entry.file.md5Checksum ?? null,
    drive_modified_time: entry.file.modifiedTime ?? null,
    filename: entry.file.name,
    category: "app_ui",
    subcategory: descriptor.subcategory,
    source_type: "app_screenshot",
    enabled: true,
    orientation: "portrait",
    framing: "app_screen",
    activity: "app_ui",
    mood: "calm",
    scene: descriptor.subcategory,
    tags: descriptor.tags,
    good_for: descriptor.tags,
    visual_description: descriptor.description,
    visible_objects: ["phone_ui", "app_screen"],
    visible_actions: [],
    setting: "app_ui",
    people_visibility: "no_person",
    composition: "app_screen",
    camera_angle: "front",
    text_in_image: "official_cortifree_ui",
    specific_details: descriptor.description,
    visual_tagging_schema: "official_app_ui_v1",
    visual_review_status: "OFFICIAL_APP_SCREEN",
    visual_reviewed_at: syncedAt,
    canonical_updated_at: entry.file.modifiedTime ?? null,
    synced_at: syncedAt,
    source_hash: entry.file.md5Checksum ?? null,
    sync_status: "SYNCED",
    sync_error: null,
    metadata,
    indexed_at: syncedAt,
  };
}
