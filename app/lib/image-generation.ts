import sharp from "sharp";
import {
  assertGenerationBudget,
  buildImagePrompt,
  generatedAssetName,
  ModelArkSeedreamProvider,
  personaAssetFolder,
  withImageRetry,
  isProviderAccountBlockedError,
  type ImageGenerationInput,
  type ImageGenerationProvider,
} from "../../src/image-generation/core";
import { isAutomaticVisualReference, visualReferenceSchema } from "../../src/visual-references";
import { uploadFile } from "./storage";
import { backendMode, dataBackend } from "./data-backend";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";
import { loadRuntimePersonaConfigs } from "../../src/runtime/config";

const BUCKET = "cortifree-assets";

function settings() {
  return {
    enabled: process.env.IMAGE_GENERATION_ENABLED === "true",
    apiKey: process.env.MODELARK_API_KEY,
    model: process.env.MODELARK_MODEL_ID,
    maxRetries: Math.min(3, Math.max(1, Number(process.env.IMAGE_GENERATION_MAX_RETRIES ?? 3))),
    dailyCapUsd: Math.max(0, Number(process.env.IMAGE_GENERATION_DAILY_CAP_USD ?? 0)),
    monthlyCapUsd: Math.max(0, Number(process.env.IMAGE_GENERATION_MONTHLY_CAP_USD ?? 50)),
    unitCostUsd: Math.max(0, Number(process.env.IMAGE_GENERATION_UNIT_COST_USD ?? 0)),
  };
}

async function queryOne<T>(resource: string): Promise<T> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json() as T[];
  if (!rows[0]) throw new Error("Required record not found");
  return rows[0];
}

async function patchJob(id: string, values: Record<string, unknown>) {
  const resource = "image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(id);
  const response = await dataBackend(resource, {
    method: "PATCH", body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function spentSinceUsd(since: Date) {
  // Paged: PostgREST caps a single response (1000 rows by default), which would undercount.
  const pageSize = 1000;
  let total = 0;
  for (let offset = 0; ; offset += pageSize) {
    const response = await dataBackend("image_generation_usage?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&created_at=gte." + encodeURIComponent(since.toISOString()) + `&select=estimated_cost_usd&order=id.asc&limit=${pageSize}&offset=${offset}`);
    if (!response.ok) throw new Error("Cannot verify image generation budget");
    const rows = await response.json() as Array<{ estimated_cost_usd: number }>;
    total += rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
    if (rows.length < pageSize) return total;
  }
}

// Fails closed: without a real unit cost the recorded spend stays at $0 and no cap can ever trip.
async function assertImageBudget(current: ReturnType<typeof settings>) {
  if (!(current.unitCostUsd > 0)) throw new Error("IMAGE_GENERATION_UNIT_COST_USD must be > 0 for the budget caps to work");
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const spentMonthUsd = await spentSinceUsd(monthStart);
  if (current.monthlyCapUsd <= 0 || spentMonthUsd + current.unitCostUsd > current.monthlyCapUsd) throw new Error(`Monthly ModelArk image budget reached (${spentMonthUsd.toFixed(2)} / ${current.monthlyCapUsd.toFixed(2)} USD)`);
  // A daily cap of 0 means "no daily limit"; the monthly cap above always applies.
  if (current.dailyCapUsd > 0) {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    assertGenerationBudget({ spentTodayUsd: await spentSinceUsd(dayStart), unitCostUsd: current.unitCostUsd, dailyCapUsd: current.dailyCapUsd });
  }
}

export async function recentImageProviderBlocker(windowMinutes = 15) {
  const since = new Date(Date.now() - Math.max(1, windowMinutes) * 60_000).toISOString();
  const pattern = encodeURIComponent("*AccountOverdueError*");
  const response = await dataBackend(
    "image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID
      + "&status=in.(FAILED,RETRY)"
      + "&updated_at=gte." + encodeURIComponent(since)
      + "&last_error=ilike." + pattern
      + "&select=id,last_error,updated_at"
      + "&order=updated_at.desc&limit=1",
  );
  if (!response.ok) return null;
  const rows = await response.json() as Array<{ id?: string; last_error?: string; updated_at?: string }>;
  const blocker = rows[0];
  if (!blocker || !isProviderAccountBlockedError(blocker.last_error)) return null;
  return {
    id: blocker.id ?? null,
    reason: "overdue_balance",
    updatedAt: blocker.updated_at ?? null,
  };
}

async function outputBytes(result: { url?: string; base64?: string }) {
  if (result.base64) return Buffer.from(result.base64, "base64");
  if (!result.url) throw new Error("Generation result has no image");
  const response = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("Generated image download failed: " + response.status);
  if (Number(response.headers.get("content-length") ?? 0) > 20_971_520) throw new Error("Generated image exceeds 20 MB");
  return Buffer.from(await response.arrayBuffer());
}

async function uploadGeneratedAsset(options: {
  bytes: Buffer; personaId: string; personaName: string; category: string; scene: string;
  reference: ReturnType<typeof visualReferenceSchema.parse>; jobId: string;
}) {
  const metadata = await sharp(options.bytes).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error("Generated image failed decode QA");
  const jpeg = await sharp(options.bytes).rotate().jpeg({ quality: 92 }).toBuffer();
  if (jpeg.length < 8_000) throw new Error("Generated image is unexpectedly small");

  const existingResponse = await dataBackend("assets?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&persona_id=eq." + options.personaId + "&source_type=eq.persona_generated&select=filename");
  const existing = existingResponse.ok ? (await existingResponse.json() as Array<{ filename: string }>).map((item) => item.filename) : [];
  const filename = generatedAssetName(options.personaName, options.category, existing);
  const folder = personaAssetFolder(options.category);
  const storagePath = "personas/" + options.personaId + "/" + folder + "/" + filename;
  const { publicUrl, storageId } = await uploadFile(new Uint8Array(jpeg), "image/jpeg");
  const referenceMetadata = options.reference.metadata ?? {};
  const metadataList = (key: string) => {
    const value = referenceMetadata[key];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === "string" && value.trim()) return value.split(/[|,]/).map((item) => item.trim()).filter(Boolean);
    return [];
  };
  const metadataText = (key: string) => typeof referenceMetadata[key] === "string" ? String(referenceMetadata[key]).trim() : "";
  const setting = metadataText("setting") || options.reference.environment || options.category;
  const composition = metadataText("composition") || options.reference.framing || "person_activity_scene";
  const specificDetails = [
    options.reference.pose,
    options.reference.outfit,
    options.reference.environment,
    ...metadataList("specific_details"),
  ].filter(Boolean);
  const visualDescription = [
    options.scene,
    options.reference.pose ? `pose: ${options.reference.pose}` : "",
    options.reference.outfit ? `outfit: ${options.reference.outfit}` : "",
    options.reference.environment ? `setting: ${options.reference.environment}` : "",
    options.reference.lighting ? `lighting: ${options.reference.lighting}` : "",
  ].filter(Boolean).join(". ");

  const row = {
    workspace_id: CORTIFREE_WORKSPACE_ID, path: `${backendMode()}://${storagePath}`, relative_path: storagePath, filename,
    category: options.category, subcategory: options.scene.toLowerCase().replace(/[^a-z0-9]+/g, "_"), persona_id: options.personaId,
    source_type: "persona_generated", width: metadata.width, height: metadata.height,
    hash: options.jobId + ":" + jpeg.length, storage_bucket: BUCKET, storage_path: storagePath, public_url: publicUrl,
    orientation: metadata.width === metadata.height ? "square" : metadata.height > metadata.width ? "portrait" : "landscape",
    framing: options.reference.framing || "medium", activity: options.scene, mood: options.reference.mood.join(" ") || "natural",
    colors: [], tags: [...new Set([options.category, options.scene, ...options.reference.tags, ...options.reference.good_for])],
    visual_description: visualDescription,
    visible_actions: metadataList("visible_actions"),
    visible_objects: metadataList("visible_objects"),
    setting,
    people_visibility: metadataText("people_visibility") || "full_person",
    body_parts_visible: metadataList("body_parts_visible"),
    composition,
    camera_angle: metadataText("camera_angle"),
    lighting: options.reference.lighting || metadataText("lighting"),
    dominant_colors: metadataList("dominant_colors"),
    text_in_image: metadataText("text_in_image") || "none",
    specific_details: specificDetails.join(" | "),
    visual_tagging_schema: "generated_from_reference_v1",
    visual_review_status: "GENERATED_PERSONA",
    visual_reviewed_at: new Date().toISOString(),
    metadata: {
      generation_job_id: options.jobId,
      visual_reference_id: options.reference.id,
      storage_id: storageId,
      storage_backend: backendMode(),
      generated_visual_metadata: true,
      specific_details: specificDetails,
    },
    scene: options.scene, pose: options.reference.pose, outfit: options.reference.outfit, environment: options.reference.environment,
    good_for: options.reference.good_for, enabled: true,
  };
  const insert = await dataBackend("assets?on_conflict=path", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  if (!insert.ok) throw new Error("Asset index failed: " + (await insert.text()).slice(0, 500));
  const asset = (await insert.json() as Array<{ id: string | number }>)[0];
  if (!asset) throw new Error("Asset index returned no row");
  return { id: asset.id, url: publicUrl, filename, storagePath };
}

export async function processImageGenerationJob(jobId: string, injectedProvider?: ImageGenerationProvider) {
  const current = settings();
  if (!current.enabled && !injectedProvider) throw new Error("IMAGE_GENERATION_ENABLED is false");
  if ((!current.apiKey || !current.model) && !injectedProvider) throw new Error("ModelArk credentials are not configured");
  if (!injectedProvider) {
    const blocker = await recentImageProviderBlocker();
    if (blocker) throw new Error(`MODELARK_PROVIDER_BLOCKED:${blocker.reason}`);
    await assertImageBudget(current);
  }
  const job = await queryOne<Record<string, unknown>>("image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(jobId) + "&select=*");
  if (!["PENDING", "RETRY", "FAILED", "RUNNING"].includes(String(job.status))) throw new Error("Job cannot run from " + job.status);
  await patchJob(jobId, { status: "RUNNING", started_at: new Date().toISOString(), last_error: null });
  try {
    const personas = await loadRuntimePersonaConfigs();
    const persona = personas.find((item) => item.id === job.persona_id);
    if (!persona) throw new Error(`Persona config not found in ${backendMode()} runtime`);
    const master = await queryOne<{ id: string | number; public_url: string }>("assets?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + job.master_asset_id + "&source_type=eq.persona_master&select=id,public_url");
    const reference = visualReferenceSchema.parse(await queryOne("visual_references?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(String(job.visual_reference_id)) + "&enabled=eq.true&select=*"));
    if (!isAutomaticVisualReference(reference)) throw new Error(`VISUAL_REFERENCE_NOT_AUTOMATICALLY_SELECTABLE:${reference.id}`);
    const referenceUrl = reference.thumbnail_url || (reference.storage_path?.startsWith("http") ? reference.storage_path : null);
    if (!master.public_url) throw new Error(`Persona MASTER is not available through ${backendMode()} storage`);
    if (!referenceUrl) throw new Error("Visual reference has no stable accessible image; import a local file or thumbnail first");
    const input = job.input as ImageGenerationInput;
    const prompt = String(job.prompt || buildImagePrompt(persona, reference, input));
    const provider = injectedProvider ?? new ModelArkSeedreamProvider({ apiKey: current.apiKey!, model: current.model! });
    const result = await withImageRetry(
      (attempt) => patchJob(jobId, { attempt_count: attempt }).then(() => provider.generate({ prompt, masterUrl: master.public_url, referenceUrl })),
      { maxAttempts: current.maxRetries },
    );
    const asset = await uploadGeneratedAsset({ bytes: await outputBytes(result), personaId: persona.id, personaName: persona.name, category: String(job.category), scene: String(job.scene), reference, jobId });
    await patchJob(jobId, { status: "DONE", output_asset_id: asset.id, finished_at: new Date().toISOString(), cost_estimate_usd: current.unitCostUsd });
    const usage = await dataBackend("image_generation_usage", { method: "POST", body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, job_id: jobId, persona_id: persona.id, provider: provider.name, model: result.model, images_generated: 1, estimated_cost_usd: current.unitCostUsd }) });
    // The image is already paid for: keep the asset, but make the missing spend visible.
    if (!usage.ok) console.error("[image-generation] usage not recorded; budget caps will undercount", jobId, await usage.text());
    return asset;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
    // A blocked provider account (unpaid balance) is not this job's fault:
    // keep it queued for later instead of losing it.
    if (isProviderAccountBlockedError(error)) {
      await patchJob(jobId, { status: "RETRY", last_error: message, next_attempt_at: new Date(Date.now() + PROVIDER_BLOCKED_RETRY_MS).toISOString() });
    } else {
      await patchJob(jobId, { status: "FAILED", last_error: message, finished_at: new Date().toISOString() });
    }
    throw error;
  }
}

export const PROVIDER_BLOCKED_RETRY_MS = 30 * 60_000;

export function getImageGenerationStatus() {
  const current = settings();
  return { configured: Boolean(current.apiKey && current.model), enabled: current.enabled, provider: "ModelArk / Seedream", model: current.model ?? null, maxRetries: current.maxRetries, dailyCapUsd: current.dailyCapUsd, monthlyCapUsd: current.monthlyCapUsd, unitCostUsd: current.unitCostUsd };
}

/**
 * Pinterest references this persona (a group master) already produced or is
 * producing an image from. A persona never reuses one: it would only make a
 * near-duplicate image. Failed or cancelled jobs do not count.
 */
export async function usedReferenceIdsForPersona(personaId: string) {
  const response = await dataBackend(
    "image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID
      + "&persona_id=eq." + encodeURIComponent(personaId)
      + "&status=in.(PENDING,RETRY,RUNNING,READY,DONE)&visual_reference_id=not.is.null&select=visual_reference_id&limit=10000",
  );
  if (!response.ok) throw new Error(`USED_REFERENCES_LOOKUP_FAILED:${await response.text()}`);
  const rows = await response.json() as Array<{ visual_reference_id?: string | null }>;
  return new Set(rows.map((row) => String(row.visual_reference_id ?? "")).filter(Boolean));
}
