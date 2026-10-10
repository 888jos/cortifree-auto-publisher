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

// Seedream 5.0 kept the reference person's face with the previous, softer
// wording; this directive version (validated on live jobs, 2026-10-10)
// produces a face recognisable as the master. The skin paragraph fixes the
// airbrushed, too-smooth "AI" skin the operator flagged, without adding acne.
export const IMAGE_IDENTITY_PROMPT = `Put the woman from Image 1 into the photo from Image 2. Image 2 gives ONLY the scene: pose, body position, hands, clothing, setting, camera angle, framing and light. Image 1 gives the person: her exact face (eye shape, eyebrows, nose, lips, jawline, face shape), her skin tone on every visible body part, and her hair colour, length and texture. The face in the result must clearly be the woman from Image 1, recognisable at a glance; do not keep any facial feature, skin tone or hair of the person in Image 2. If Image 2 shows several people, replace only the most prominent one and leave everyone else exactly as they are. Her skin tone must be the same from face to hands, arms and legs; never lighten or darken her body to match Image 2. Real, unretouched skin like an ordinary phone photo: visible pores, slightly uneven tone, faint natural redness around the nose and cheeks, light under-eye shadows, a natural matte finish with only a little shine. No airbrushed, glowing, glossy or porcelain skin, no smoothing. Keep imperfections subtle: no acne, no heavy blemishes. Match the camera quality of Image 2: a real smartphone photo with slight softness, mild grain and imperfect exposure, not studio-sharp or HD-perfect. Candid UGC, believable anatomy, no beauty filter, no glossy editorial look, no text, no logo, no watermark.`;

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
      // Status codes are matched only where the provider puts them ("ModelArk 503: ..."), not anywhere in the body.
      const retryable = error instanceof Error && /^ModelArk (?:429|5\d\d)\b|timeout|fetch failed|temporar/i.test(error.message);
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(300 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

// Seedream 5.0 rejects "1K": sizes are "2k"/"3k"/"4k" or WIDTHxHEIGHT.
// 1728x2160 is the carousel's 4:5 portrait at about 2K.
export const MODELARK_IMAGE_SIZE = process.env.MODELARK_IMAGE_SIZE?.trim() || "1728x2160";

export class ModelArkSeedreamProvider implements ImageGenerationProvider {
  readonly name = "modelark_seedream";
  constructor(private readonly options: { apiKey: string; model: string; baseUrl?: string; size?: string }) {}
  async generate(input: { prompt: string; masterUrl: string; referenceUrl: string }) {
    const response = await fetch(`${this.options.baseUrl ?? "https://ark.ap-southeast.bytepluses.com/api/v3"}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.options.model, prompt: input.prompt, image: [input.masterUrl, input.referenceUrl], size: this.options.size ?? MODELARK_IMAGE_SIZE, response_format: "url", watermark: false, stream: false }),
      signal: AbortSignal.timeout(75_000),
    });
    if (!response.ok) throw new Error(`ModelArk ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    const image = payload.data?.[0];
    if (!image?.url && !image?.b64_json) throw new Error("ModelArk returned no image");
    return { url: image.url, base64: image.b64_json, model: this.options.model };
  }
}


export function isProviderAccountBlockedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /AccountOverdueError|overdue[ _]balance|insufficient balance|billing.*(?:blocked|overdue)|ModelArk\s+403\b|MODELARK_PROVIDER_BLOCKED/i.test(message);
}

export function isPermanentImageGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return isProviderAccountBlockedError(error)
    || /InputImageSensitiveContentDetected|SensitiveContent|ModelArk\s+400\b|BadRequest|content\s*policy|moderation/i.test(message);
}
