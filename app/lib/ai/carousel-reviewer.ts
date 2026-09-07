import { getAIConfig } from "./config";
import { CAROUSEL_REVIEWER_INSTRUCTIONS, CAROUSEL_REVIEWER_PROMPT_VERSION } from "./prompts";
import { carouselReviewSchema, carouselSpecSchema, type CarouselReview, type CarouselSpec } from "./schemas";
import { requestStructured } from "./openai-client";
import { logAIUsage } from "./usage";
import { validateCarouselSpec } from "./validation";

export function shouldRunQA(sampleRate: number, random = Math.random): boolean {
  return sampleRate > 0 && random() < sampleRate;
}

export async function reviewCarouselDraft(
  spec: CarouselSpec,
  context: { carouselId?: string; expectedSlideCount: number; language: "en" | "fr"; layout: string },
): Promise<CarouselReview> {
  const config = getAIConfig();
  const deterministicIssues = validateCarouselSpec(spec, { slideCount: context.expectedSlideCount, language: context.language, layout: context.layout });
  if (deterministicIssues.some((issue) => issue.severity === "major")) {
    return { approved: false, score: 0, issues: deterministicIssues.map((issue) => ({ ...issue, slidePosition: issue.slidePosition ?? null })), correctedSpec: null };
  }

  try {
    const result = await requestStructured({
      model: config.OPENAI_MODEL_QA,
      schema: carouselReviewSchema,
      schemaName: "cortifree_carousel_review",
      instructions: CAROUSEL_REVIEWER_INSTRUCTIONS,
      input: `${CAROUSEL_REVIEWER_PROMPT_VERSION}\nEXPECTED LAYOUT: ${context.layout}\nDRAFT\n${JSON.stringify(carouselSpecSchema.parse(spec))}`,
      maxOutputTokens: 3_000,
    });
    await logAIUsage({ operation: "carousel.review", model: config.OPENAI_MODEL_QA, carouselId: context.carouselId, usage: result.usage, success: true });
    return carouselReviewSchema.parse(result.data);
  } catch (error) {
    await logAIUsage({ operation: "carousel.review", model: config.OPENAI_MODEL_QA, carouselId: context.carouselId, success: false, error: error instanceof Error ? error.message : "Unknown QA error" });
    throw error;
  }
}
