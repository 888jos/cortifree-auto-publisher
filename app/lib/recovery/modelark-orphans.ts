import crypto from "node:crypto";
import sharp from "sharp";
import { dataBackend } from "../data-backend";
import { getAIConfig } from "../ai/config";
import { getOpenAIClient } from "../ai/openai-client";
import { listDriveChildren, uploadDriveFile } from "../google/drive";
import { generatedAssetName, personaAssetFolder } from "../../../src/image-generation/core";

const WORKSPACE_ID = "cortifree";
const PERSONAS_ROOT = process.env.GOOGLE_DRIVE_PERSONAS_FOLDER_ID || "1cnDHDfAGgwOxTT_kJsZNpnRHvB5sY6Ps";
const BUCKET = "cortifree-assets";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const PERSONA_NAMES: Record<string, string> = {
  P01: "EMMA", P02: "LILY", P03: "MAYA", P04: "NORA",
  P05: "GRACE", P06: "AVA", P07: "CHLOE", P08: "ISABELA",
  P09: "CAMILA", P10: "HANA", P11: "ZOEY", P12: "ELIANA",
  P13: "JADE", P14: "SOFIA", P15: "MIA", P16: "OLIVIA",
};

const CATEGORIES = new Set(["home", "fitness", "outdoors", "self_care", "food", "work_study", "other"]);

type Row = Record<string, unknown>;

type RecoveryRow = {
  usage_id: string;
  persona_id: string;
  usage_at: string;
  object_name: string;
  md5?: string | null;
  bytes?: number | null;
  status: string;
};

type Classification = {
  category: string;
  scene: string;
  visual_description: string;
  activity: string;
  setting: string;
  framing: string;
  mood: string;
  visible_objects: string[];
  visible_actions: string[];
  people_visibility: string;
  body_parts_visible: string[];
  composition: string;
  camera_angle: string;
  lighting: string;
  dominant_colors: string[];
  text_in_image: string;
};

async function rows(resource: string) {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

async function patchManifest(usageId: string, body: Row) {
  const response = await dataBackend(
    `image_recovery_manifest?workspace_id=eq.${WORKSPACE_ID}&usage_id=eq.${encodeURIComponent(usageId)}`,
    { method: "PATCH", body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) },
  );
  if (!response.ok) throw new Error(await response.text());
}

function storageUrl(objectName: string) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL is not configured");
  const encoded = objectName.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

function cleanText(value: unknown, fallback = "", max = 500) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, max);
}

function cleanList(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, "", 80)).filter(Boolean).slice(0, maxItems);
}

async function classifyImage(imageUrl: string): Promise<Classification> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getAIConfig().OPENAI_MODEL_PRIMARY,
    store: false,
    max_output_tokens: 500,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Classify this CortiFree fictional-persona lifestyle image for archival.",
            "Return ONE JSON object only, with no markdown.",
            "category must be exactly one of: home, fitness, outdoors, self_care, food, work_study, other.",
            "Use home for bedroom/living/home interiors; fitness for workout/gym/yoga/pilates/running when exercise is the focus;",
            "outdoors for street/park/beach/hike/travel/outdoor lifestyle; self_care for skincare/beauty/bath/wellness;",
            "food for cooking/eating/drinks when food is the focus; work_study for desk/laptop/studying/office; otherwise other.",
            "scene should be a concise 2-6 word lowercase snake_case description, e.g. night_cozy_bedroom or gym_mirror_selfie.",
            "Also return visual_description, activity, setting, framing, mood, visible_objects[], visible_actions[], people_visibility, body_parts_visible[], composition, camera_angle, lighting, dominant_colors[], text_in_image.",
            "Do not infer identity, ethnicity, health, or sensitive attributes. Describe only visible scene content.",
          ].join("\n"),
        },
        { type: "input_image", image_url: imageUrl, detail: "low" },
      ],
    }],
  });

  const raw = response.output_text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Vision classifier returned no JSON: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const requested = cleanText(parsed.category, "other", 30).toLowerCase();
  const category = CATEGORIES.has(requested) ? requested : "other";

  return {
    category,
    scene: cleanText(parsed.scene, "recovered_lifestyle", 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    visual_description: cleanText(parsed.visual_description, "Recovered ModelArk lifestyle image", 800),
    activity: cleanText(parsed.activity, "lifestyle", 100),
    setting: cleanText(parsed.setting, "", 120),
    framing: cleanText(parsed.framing, "medium", 80),
    mood: cleanText(parsed.mood, "calm", 80),
    visible_objects: cleanList(parsed.visible_objects),
    visible_actions: cleanList(parsed.visible_actions),
    people_visibility: cleanText(parsed.people_visibility, "person_visible", 80),
    body_parts_visible: cleanList(parsed.body_parts_visible),
    composition: cleanText(parsed.composition, "", 120),
    camera_angle: cleanText(parsed.camera_angle, "", 80),
    lighting: cleanText(parsed.lighting, "", 120),
    dominant_colors: cleanList(parsed.dominant_colors, 8),
    text_in_image: cleanText(parsed.text_in_image, "none", 120),
  };
}

async function targetFolder(personaId: string, category: string) {
  const personaName = PERSONA_NAMES[personaId];
  if (!personaName) throw new Error(`Unknown persona ${personaId}`);

  const root = await listDriveChildren(PERSONAS_ROOT);
  const personaFolder = root.find((item) => item.mimeType === FOLDER_MIME && item.name.toUpperCase() === personaName);
  if (!personaFolder) throw new Error(`Drive persona folder not found for ${personaId} ${personaName}`);

  const folderName = personaAssetFolder(category);
  const children = await listDriveChildren(personaFolder.id);
  const categoryFolder = children.find((item) => item.mimeType === FOLDER_MIME && item.name === folderName);
  if (!categoryFolder) throw new Error(`Drive category folder ${folderName} not found for ${personaName}`);

  return { personaName, personaFolder, categoryFolder, folderName };
}

async function insertRecoveredAsset(options: {
  row: RecoveryRow;
  classification: Classification;
  filename: string;
  driveFileId: string;
  drivePath: string;
  width: number;
  height: number;
  imageUrl: string;
}) {
  const now = new Date().toISOString();
  const body = {
    category: options.classification.category,
    filename: options.filename,
    drive_path: options.drivePath,
    metadata: {
      recovery_manifest_usage_id: options.row.usage_id,
      recovered_from: "orphaned_modelark_storage_object",
      recovered_at: now,
      drive_file_id: options.driveFileId,
      drive_path: options.drivePath,
      source_hash: options.row.md5 ?? null,
      canonical_source: "MODELARK_RECOVERY_TO_DRIVE",
    },
    persona_id: options.row.persona_id,
    source_type: "persona_generated",
    width: options.width,
    height: options.height,
    hash: options.row.md5 ?? null,
    enabled: true,
    storage_bucket: BUCKET,
    storage_path: options.row.object_name,
    public_url: options.imageUrl,
    orientation: options.height >= options.width ? "portrait" : "landscape",
    framing: options.classification.framing,
    activity: options.classification.activity,
    mood: options.classification.mood,
    colors: options.classification.dominant_colors,
    tags: ["recovered_modelark", options.classification.category, options.classification.scene],
    workspace_id: WORKSPACE_ID,
    scene: options.classification.scene,
    pose: "",
    outfit: "",
    environment: options.classification.setting,
    lighting: options.classification.lighting,
    good_for: [options.classification.category],
    visual_description: options.classification.visual_description,
    visible_objects: options.classification.visible_objects,
    visible_actions: options.classification.visible_actions,
    setting: options.classification.setting,
    people_visibility: options.classification.people_visibility,
    body_parts_visible: options.classification.body_parts_visible,
    composition: options.classification.composition,
    camera_angle: options.classification.camera_angle,
    dominant_colors: options.classification.dominant_colors,
    text_in_image: options.classification.text_in_image,
    specific_details: options.classification.visual_description,
    visual_tagging_schema: "RECOVERY_V1",
    visual_review_status: "AI_RECOVERY_CLASSIFIED_V1",
    visual_reviewed_at: now,
    drive_file_id: options.driveFileId,
    drive_md5: options.row.md5 ?? null,
    canonical_updated_at: now,
    synced_at: now,
    source_hash: options.row.md5 ?? null,
    sync_status: "INDEXED_SUPABASE",
  };

  const response = await dataBackend("assets", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Recovered asset insert failed: ${await response.text()}`);
  const inserted = await response.json() as Row[];
  return inserted[0] ?? null;
}

async function processOne(row: RecoveryRow) {
  if (!row.object_name) throw new Error("Manifest row has no storage object");
  const imageUrl = storageUrl(row.object_name);

  const existing = row.md5
    ? await rows(`assets?workspace_id=eq.${WORKSPACE_ID}&source_hash=eq.${encodeURIComponent(row.md5)}&select=id,filename,category,scene,drive_file_id,drive_path&limit=1`)
    : [];
  if (existing[0]?.drive_file_id) {
    await patchManifest(row.usage_id, {
      status: "ALREADY_IN_DRIVE",
      category: existing[0].category ?? null,
      scene: existing[0].scene ?? null,
      existing_asset_id: existing[0].id ?? null,
      existing_drive_file_id: existing[0].drive_file_id ?? null,
      existing_filename: existing[0].filename ?? null,
      recovered_drive_file_id: existing[0].drive_file_id ?? null,
      recovered_drive_path: existing[0].drive_path ?? null,
      notes: "Exact source_hash already indexed with a Drive file.",
    });
    return { usage_id: row.usage_id, status: "ALREADY_IN_DRIVE" };
  }

  const source = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!source.ok) throw new Error(`Storage download failed ${source.status}`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const [classification, metadata] = await Promise.all([
    classifyImage(imageUrl),
    sharp(bytes).metadata(),
  ]);

  const folder = await targetFolder(row.persona_id, classification.category);
  const targetChildren = await listDriveChildren(folder.categoryFolder.id);

  let driveFile = row.md5
    ? targetChildren.find((item) => item.mimeType !== FOLDER_MIME && item.md5Checksum?.toLowerCase() === row.md5?.toLowerCase())
    : undefined;

  const filename = driveFile?.name ?? generatedAssetName(
    folder.personaName,
    classification.category,
    targetChildren.filter((item) => item.mimeType !== FOLDER_MIME).map((item) => item.name),
  );

  if (!driveFile) {
    driveFile = await uploadDriveFile({
      name: filename,
      parentId: folder.categoryFolder.id,
      bytes: new Uint8Array(bytes),
      mimeType: source.headers.get("content-type") || "image/jpeg",
    });
  }

  const drivePath = `${folder.personaName}/${folder.folderName}/${filename}`;
  const asset = await insertRecoveredAsset({
    row,
    classification,
    filename,
    driveFileId: driveFile.id,
    drivePath,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    imageUrl,
  });

  await patchManifest(row.usage_id, {
    category: classification.category,
    scene: classification.scene,
    status: "RECOVERED",
    recovered_drive_file_id: driveFile.id,
    recovered_drive_path: drivePath,
    notes: classification.visual_description,
  });

  return {
    usage_id: row.usage_id,
    persona_id: row.persona_id,
    status: "RECOVERED",
    category: classification.category,
    scene: classification.scene,
    filename,
    drive_file_id: driveFile.id,
    drive_path: drivePath,
    asset_id: asset?.id ?? null,
  };
}

export async function recoverModelArkOrphans(options: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(8, Math.trunc(options.limit ?? 3)));
  const pending = await rows(
    `image_recovery_manifest?workspace_id=eq.${WORKSPACE_ID}&status=eq.PENDING_SCENE&order=usage_at.asc&limit=${limit}`,
  ) as RecoveryRow[];

  const report: Row[] = [];
  for (const row of pending) {
    try {
      report.push(await processOne(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await patchManifest(row.usage_id, {
        status: "RECOVERY_FAILED",
        notes: message.slice(0, 1000),
      }).catch(() => undefined);
      report.push({ usage_id: row.usage_id, persona_id: row.persona_id, status: "RECOVERY_FAILED", error: message.slice(0, 500) });
    }
  }

  const [remainingRows, failedRows, recoveredRows] = await Promise.all([
    rows(`image_recovery_manifest?workspace_id=eq.${WORKSPACE_ID}&status=eq.PENDING_SCENE&select=usage_id&limit=5000`),
    rows(`image_recovery_manifest?workspace_id=eq.${WORKSPACE_ID}&status=eq.RECOVERY_FAILED&select=usage_id&limit=5000`),
    rows(`image_recovery_manifest?workspace_id=eq.${WORKSPACE_ID}&status=eq.RECOVERED&select=usage_id&limit=5000`),
  ]);

  return {
    ok: true,
    requested: pending.length,
    recovered_this_run: report.filter((item) => item.status === "RECOVERED").length,
    failed_this_run: report.filter((item) => item.status === "RECOVERY_FAILED").length,
    remaining: remainingRows.length,
    failed_total: failedRows.length,
    recovered_total: recoveredRows.length,
    report,
  };
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function authorizeRecoveryToken(token: string) {
  if (!token) return { ok: false as const, reason: "missing_token" };
  const latest = await rows("system_logs?stage=eq.IMAGE_RECOVERY_NONCE&status=eq.ACTIVE&order=created_at.desc&limit=1");
  const row = latest[0];
  if (!row) return { ok: false as const, reason: "no_active_nonce" };
  const createdAt = Date.parse(String(row.created_at ?? ""));
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 60 * 60 * 1000) {
    return { ok: false as const, reason: "expired_nonce" };
  }
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Row : {};
  const expected = cleanText(metadata.token_hash, "", 128);
  const actual = tokenHash(token);
  if (!expected || expected.length !== actual.length) return { ok: false as const, reason: "invalid_token" };
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return { ok: false as const, reason: "invalid_token" };
  return { ok: true as const, logId: String(row.id ?? "") };
}

export async function completeRecoveryToken(logId: string) {
  if (!logId) return;
  await dataBackend(`system_logs?id=eq.${encodeURIComponent(logId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "COMPLETE", metadata: { completed_at: new Date().toISOString() } }),
  });
}
