import { dataBackend } from "./data-backend";
import type { CarouselGeneratorInput } from "./ai/types";
import type { GenerateCarouselResult } from "./ai/carousel-generator";
import { assertCortiFreeAccountId, assertCortiFreeCarouselId, CORTIFREE_ACCOUNT_ID, CORTIFREE_WORKSPACE_ID } from "./workspace";

export async function getRecentCarousels(limit = 6) {
  try {
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&account_id=like.CF_*&select=id,topic,angle,spec&order=created_at.desc&limit=${limit}`);
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
  if (input.requireCanonicalContext && (!input.accountId || !input.personaId || !input.topicId || !input.hookId || !input.formatId || !input.editorialContext || Object.keys(input.editorialContext).length === 0)) {
    throw new Error("CANONICAL_CONTEXT_REQUIRED: refusing to save a carousel without editorial linkage");
  }
  const accountId = options.accountId || CORTIFREE_ACCOUNT_ID;
  assertCortiFreeCarouselId(id);
  assertCortiFreeAccountId(accountId);
  const row = {
    id,
    workspace_id: CORTIFREE_WORKSPACE_ID,
    account_id: accountId,
    persona_id: options.personaId || "P01",
    language: result.spec.language,
    content_type: input.carouselType,
    topic: result.spec.topic,
    angle: result.spec.angle,
    caption: result.spec.caption,
    cta_type: result.spec.ctaType,
    topic_id: input.topicId ?? null,
    hook_id: input.hookId ?? null,
    format_id: input.formatId ?? input.carouselType,
    editorial_context: input.editorialContext ?? {},
    brand_integration_id: input.editorialContext?.brand_integration?.required ? "CORTIFREE_APP" : null,
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
        prompt_version: "carousel-generator-v2-canonical",
      },
    },
  };

  const response = await dataBackend("carousels", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!response.ok) throw new Error(await response.text());
  const saved = await response.json() as Array<typeof row>;
  return saved[0] ?? row;
}
