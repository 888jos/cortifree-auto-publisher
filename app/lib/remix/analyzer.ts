import { getAIConfig } from "../ai/config";
import { requestStructured } from "../ai/openai-client";
import { logAIUsage } from "../ai/usage";
import { remixAnalysisSchema, type RemixAnalysis, type RemixMaterial } from "./schemas";

const INSTRUCTIONS = `
You analyze a user-supplied TikTok as creative inspiration for CortiFree, a wellness/self-care carousel account.

Your job is to identify the HIGH-LEVEL creative mechanics, not to copy distinctive wording.
- Extract the topic, angle, hook mechanism, slide rhythm, visual pattern, and likely CortiFree carousel format.
- Write a NEW adaptedHook suitable for CortiFree. Do not reproduce the source hook verbatim unless it is purely generic.
- Preserve useful structure (for example checklist, routine, POV, mistakes, story) while making wording and examples original.
- Do not preserve medical claims, diagnoses, guaranteed outcomes, invented percentages, or causal cortisol/hormone claims from the source.
- If source information is sparse, say so through adaptationNotes and infer only a conservative structural plan.
- recommendedSlideCount must be 4-12.
- slideBlueprint describes purpose and visual intent only, not copied slide text.
`.trim();

export async function analyzeRemixSource(material: RemixMaterial): Promise<RemixAnalysis> {
  const config = getAIConfig();
  if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for remix analysis");
  const source = {
    url: material.sourceUrl,
    creator: material.creator,
    caption: material.caption,
    rawText: material.rawText.slice(0, 12_000),
    slides: material.slides.map((slide) => ({ position: slide.position, text: slide.text.slice(0, 500), hasImage: Boolean(slide.imageUrl) })),
    ingestionQuality: material.ingestionQuality,
  };
  const result = await requestStructured({
    model: config.OPENAI_MODEL_PRIMARY,
    schema: remixAnalysisSchema,
    schemaName: "cortifree_remix_analysis",
    instructions: INSTRUCTIONS,
    input: JSON.stringify(source),
    maxOutputTokens: 2_000,
  });
  await logAIUsage({ operation: "remix.analyze:v1", model: config.OPENAI_MODEL_PRIMARY, usage: result.usage, success: true });
  return result.data;
}

export function remixEditorialBrief(analysis: RemixAnalysis) {
  return [
    `Topic: ${analysis.topic}`,
    `Angle: ${analysis.angle}`,
    `Creative mechanics: ${analysis.mechanics.join("; ")}`,
    `Visual rhythm: ${analysis.visualPattern.join("; ") || "not specified"}`,
    `Blueprint: ${analysis.slideBlueprint.map((slide) => `${slide.position}. ${slide.purpose} | ${slide.visualIntent}`).join(" / ")}`,
    "Create an original CortiFree version. Preserve the high-level structure, not the source wording.",
  ].join("\n");
}
