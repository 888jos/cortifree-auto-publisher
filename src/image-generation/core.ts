import { z } from "zod";
import type { PersonaConfig } from "../domain";
import type { VisualReference } from "../visual-references";

export const imageGenerationInputSchema = z.object({
  persona_id: z.string().regex(/^P\d{2}$/), master_asset_id: z.union([z.string(), z.number()]),
  visual_reference_id: z.string(), carousel_id: z.string().nullable().optional(), slide_id: z.string().nullable().optional(),
  scene: z.string().min(3), category: z.string().min(1), framing: z.string().optional(), outfit: z.string().optional(),
  environment: z.string().optional(), prompt_additions: z.string().max(800).optional(),
});
export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;

export interface ImageGenerationProvider {
  readonly name: string;
  generate(input: { prompt: string; masterUrl: string; referenceUrl: string }): Promise<{ url?: string; base64?: string; model: string }>;
}

export const IMAGE_IDENTITY_PROMPT = `Image 1 defines the exact identity of the fictional character. Preserve the fictional character's facial identity, apparent age, hair, skin tone, facial proportions, body type and overall physical appearance. Image 2 is only the visual reference for pose, outfit, setting, composition, camera angle, framing and lighting. Recreate the scene structure from Image 2 while replacing only the primary target person with the fictional persona from Image 1. If Image 2 contains multiple people, face-swap exactly one person: use the most prominent or central person as the target, and preserve every other person's face, hair, skin tone, body, pose and identity exactly as shown. Never face-swap, merge, duplicate or alter the second person's face. Do not copy the identity, skin tone, hair, body type or distinctive physical characteristics of the target person in Image 2. CRITICAL SKIN-CONSISTENCY RULE: all visible skin belonging to the fictional persona must have one continuous, consistent skin tone matching Image 1, including face, ears, neck, shoulders, chest, torso, arms, elbows, hands, legs, knees and feet. Never render a pale, white, lighter or mismatched body next to a dark face; do not lighten exposed skin because of the reference image, lighting or clothing. Create a photorealistic lifestyle image with natural smartphone photography, candid UGC aesthetics, realistic skin texture, subtle imperfections, believable anatomy and natural body proportions. No text. No logos. No watermark. No beauty filter. No glossy editorial fashion campaign look.`;

export function buildImagePrompt(persona: PersonaConfig, reference: VisualReference, input: ImageGenerationInput) {
  return [
    IMAGE_IDENTITY_PROMPT,
    `Persona metadata is secondary to Image 1: ${persona.name}, age ${persona.age}; skin ${persona.physical.skin}; hair ${persona.physical.hair}; eyes ${persona.physical.eyes}; build ${persona.physical.build}; style ${persona.visual_style}.`,
    `Scene: ${input.scene}. Category: ${input.category}.`,
    `Reference instructions: pose ${reference.pose || "preserve from Image 2"}; framing ${input.framing || reference.framing || "preserve"}; outfit ${input.outfit || reference.outfit || "preserve style"}; environment ${input.environment || reference.environment || "preserve"}; lighting ${reference.lighting || "natural"}.`,
    input.prompt_additions ? `Additional instructions: ${input.prompt_additions}` : "",
  ].filter(Boolean).join("\n\n");
}

export function personaAssetFolder(category: string) {
  const mapping: Record<string, string> = { home: "02_HOME", fitness: "03_FITNESS", outdoors: "04_OUTDOORS", self_care: "05_SELF_CARE", food: "06_FOOD", work_study: "07_OTHER", other: "07_OTHER" };
  return mapping[category] ?? "07_OTHER";
}

export function generatedAssetName(personaName: string, category: string, existing: string[]) {
  const stem = category === "home" ? "HOME" : category === "self_care" ? "SELFCARE" : category.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
  const prefix = `${personaName.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_${stem}_`;
  for (let index = 1; index < 10_000; index += 1) {
    const filename = `${prefix}${String(index).padStart(3, "0")}.jpg`;
    if (!existing.some((item) => item.toUpperCase() === filename.toUpperCase())) return filename;
  }
  throw new Error("No generated asset filename available");
}

export function batchGenerationCount(personas: number, scenes: number, variations: number) {
  const count = personas * scenes * variations;
  if (![personas, scenes, variations].every(Number.isInteger) || personas < 1 || scenes < 1 || variations < 1 || variations > 3) throw new Error("Invalid batch selection");
  if (count > 100) throw new Error("Batch safety limit is 100 images");
  return count;
}

export function assertGenerationBudget(options: { spentTodayUsd: number; unitCostUsd: number; dailyCapUsd: number }) {
  const { spentTodayUsd, unitCostUsd, dailyCapUsd } = options;
  if (![spentTodayUsd, unitCostUsd, dailyCapUsd].every(Number.isFinite) || spentTodayUsd < 0 || unitCostUsd < 0 || dailyCapUsd < 0) {
    throw new Error("Invalid image generation budget");
  }
  if (dailyCapUsd === 0) throw new Error("IMAGE_GENERATION_DAILY_CAP_USD is 0; generation spending is disabled");
  if (spentTodayUsd + unitCostUsd > dailyCapUsd) throw new Error("Daily image generation cost cap reached");
}

export async function withImageRetry<T>(operation: (attempt: number) => Promise<T>, options: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const maxAttempts = Math.min(3, Math.max(1, options.maxAttempts ?? 3));
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try { return await operation(attempt); } catch (error) {
      lastError = error;
      const retryable = error instanceof Error && /429|timeout|fetch failed|5\d\d|temporar/i.test(error.message);
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(300 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export class ModelArkSeedreamProvider implements ImageGenerationProvider {
  readonly name = "modelark_seedream";
  constructor(private readonly options: { apiKey: string; model: string; baseUrl?: string }) {}
  async generate(input: { prompt: string; masterUrl: string; referenceUrl: string }) {
    const response = await fetch(`${this.options.baseUrl ?? "https://ark.ap-southeast.bytepluses.com/api/v3"}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.options.model, prompt: input.prompt, image: [input.masterUrl, input.referenceUrl], size: "1K", response_format: "url", watermark: false, stream: false }),
      signal: AbortSignal.timeout(75_000),
    });
    if (!response.ok) throw new Error(`ModelArk ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    const image = payload.data?.[0];
    if (!image?.url && !image?.b64_json) throw new Error("ModelArk returned no image");
    return { url: image.url, base64: image.b64_json, model: this.options.model };
  }
}
