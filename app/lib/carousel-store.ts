import { supabase } from "./supabase.js";
import type { CarouselGeneratorInput } from "./ai/types";
import type { GenerateCarouselResult } from "./ai/carousel-generator";

export async function getRecentCarousels(limit = 6) {
  try {
    const response = await supabase(`carousels?select=id,topic,angle,spec&order=created_at.desc&limit=${limit}`);
    if (!response.ok) return [];
    const rows = await response.json() as Array<{ id: string; topic: string; angle: string; spec?: { hook?: string } }>;
    return rows.map((row) => ({ id: row.id, topic: row.topic, angle: row.angle, hook: row.spec?.hook })).filter((row) => row.topic && row.angle);
  } catch {
    return [];
  }
}

export async function saveGeneratedCarousel(options: {
  id: string;
  input: CarouselGeneratorInput;
  result: GenerateCarouselResult;
  accountId?: string;
  personaId?: string;
}) {
  const { id, input, result } = options;
  const row = {
    id,
    account_id: options.accountId || "CF_EN_01",
    persona_id: options.personaId || "P01",
    language: result.spec.language,
    content_type: input.carouselType,
    topic: result.spec.topic,
    angle: result.spec.angle,
    caption: result.spec.caption,
    cta_type: result.spec.ctaType,
    status: "DRAFT",
    spec: {
      slides: result.spec.slides.length,
      carousel_type: input.carouselType,
      model_id: input.layout,
      layout: input.layout,
      hook: result.spec.hook,
      title: result.spec.title,
      references: input.references,
      generated_slides: result.spec.slides,
      ai_generation: {
        source: result.source,
        model: result.model,
        generated_at: result.generatedAt,
        qa_reviewed: result.qa !== null,
        qa_score: result.qa?.score ?? null,
        prompt_version: "carousel-generator-v1",
      },
    },
  };

  const response = await supabase("carousels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!response.ok) throw new Error(await response.text());
  const saved = await response.json() as Array<typeof row>;
  return saved[0] ?? row;
}
