import sharp from "sharp";
import personas from "../../config/personas.json" with { type: "json" };
import { personaConfigSchema } from "../../src/domain";
import {
  buildImagePrompt,
  assertGenerationBudget,
  generatedAssetName,
  ModelArkSeedreamProvider,
  personaAssetFolder,
  withImageRetry,
  type ImageGenerationInput,
  type ImageGenerationProvider,
} from "../../src/image-generation/core";
import { visualReferenceSchema } from "../../src/visual-references";
import { SupabaseAssetStorage } from "../../src/storage/asset-storage";
import { supabase } from "./supabase";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";

const BUCKET = "cortifree-assets";

function settings() {
  return {
    enabled: process.env.IMAGE_GENERATION_ENABLED === "true",
    apiKey: process.env.MODELARK_API_KEY,
    model: process.env.MODELARK_MODEL_ID,
    maxRetries: Math.min(3, Math.max(1, Number(process.env.IMAGE_GENERATION_MAX_RETRIES ?? 3))),
    dailyCapUsd: Math.max(0, Number(process.env.IMAGE_GENERATION_DAILY_CAP_USD ?? 0)),
    unitCostUsd: Math.max(0, Number(process.env.IMAGE_GENERATION_UNIT_COST_USD ?? 0)),
  };
}

async function queryOne<T>(resource: string): Promise<T> {
  const response = await supabase(resource);
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json() as T[];
  if (!rows[0]) throw new Error("Required record not found");
  return rows[0];
}

async function patchJob(id: string, values: Record<string, unknown>) {
  const resource = "image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(id);
  const response = await supabase(resource, {
    method: "PATCH", body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await response.text());
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

  const existingResponse = await supabase("assets?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&persona_id=eq." + options.personaId + "&source_type=eq.persona_generated&select=filename");
  const existing = existingResponse.ok ? (await existingResponse.json() as Array<{ filename: string }>).map((item) => item.filename) : [];
  const filename = generatedAssetName(options.personaName, options.category, existing);
  const folder = personaAssetFolder(options.category);
  const storagePath = "personas/" + options.personaId + "/" + folder + "/" + filename;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage is not configured");
  const storage = new SupabaseAssetStorage({ url, serviceRoleKey: key, bucket: BUCKET });
  const { publicUrl } = await storage.putIfAbsent({ storagePath, bytes: new Uint8Array(jpeg), contentType: "image/jpeg" });
  const row = {
    workspace_id: CORTIFREE_WORKSPACE_ID, path: "supabase://" + BUCKET + "/" + storagePath, relative_path: storagePath, filename,
    category: options.category, subcategory: options.scene.toLowerCase().replace(/[^a-z0-9]+/g, "_"), persona_id: options.personaId,
    source_type: "persona_generated", width: metadata.width, height: metadata.height,
    hash: options.jobId + ":" + jpeg.length, storage_bucket: BUCKET, storage_path: storagePath, public_url: publicUrl,
    orientation: metadata.width === metadata.height ? "square" : metadata.height > metadata.width ? "portrait" : "landscape",
    framing: options.reference.framing || "medium", activity: options.scene, mood: options.reference.mood.join(" ") || "natural",
    colors: [], tags: [...new Set([options.category, options.scene, ...options.reference.tags])],
    metadata: { generation_job_id: options.jobId, visual_reference_id: options.reference.id },
    scene: options.scene, pose: options.reference.pose, outfit: options.reference.outfit, environment: options.reference.environment,
    lighting: options.reference.lighting, good_for: options.reference.good_for, enabled: true,
  };
  const insert = await supabase("assets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
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
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const usageResponse = await supabase("image_generation_usage?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&created_at=gte." + encodeURIComponent(dayStart.toISOString()) + "&select=estimated_cost_usd");
    if (!usageResponse.ok) throw new Error("Cannot verify daily image generation budget");
    const usage = await usageResponse.json() as Array<{ estimated_cost_usd: number }>;
    assertGenerationBudget({
      spentTodayUsd: usage.reduce((total, row) => total + Number(row.estimated_cost_usd ?? 0), 0),
      unitCostUsd: current.unitCostUsd,
      dailyCapUsd: current.dailyCapUsd,
    });
  }
  const job = await queryOne<Record<string, unknown>>("image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(jobId) + "&select=*");
  if (!["PENDING", "RETRY", "FAILED"].includes(String(job.status))) throw new Error("Job cannot run from " + job.status);
  await patchJob(jobId, { status: "RUNNING", started_at: new Date().toISOString(), last_error: null });
  try {
    const persona = personaConfigSchema.parse(personas.find((item) => item.id === job.persona_id));
    const master = await queryOne<{ id: string | number; public_url: string }>("assets?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + job.master_asset_id + "&source_type=eq.persona_master&select=id,public_url");
    const reference = visualReferenceSchema.parse(await queryOne("visual_references?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(String(job.visual_reference_id)) + "&enabled=eq.true&select=*"));
    const referenceUrl = reference.thumbnail_url || (reference.storage_path?.startsWith("http") ? reference.storage_path : null);
    if (!master.public_url) throw new Error("Persona MASTER is not available through Supabase Storage");
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
    await supabase("image_generation_usage", { method: "POST", body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, job_id: jobId, persona_id: persona.id, provider: provider.name, model: result.model, images_generated: 1, estimated_cost_usd: current.unitCostUsd }) });
    return asset;
  } catch (error) {
    await patchJob(jobId, { status: "FAILED", last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000), finished_at: new Date().toISOString() });
    throw error;
  }
}

export function getImageGenerationStatus() {
  const current = settings();
  return { configured: Boolean(current.apiKey && current.model), enabled: current.enabled, provider: "ModelArk / Seedream", model: current.model ?? null, maxRetries: current.maxRetries, dailyCapUsd: current.dailyCapUsd, unitCostUsd: current.unitCostUsd };
}
