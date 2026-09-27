import type { CarouselGeneratorInput } from "./types";
import { getAIConfig } from "./config";
import { createFallbackCarousel } from "./fallback";
import { requestStructured, type StructuredResult } from "./openai-client";
import { buildGeneratorInput, CAROUSEL_GENERATOR_INSTRUCTIONS, CAROUSEL_GENERATOR_PROMPT_VERSION } from "./prompts";
import { carouselSpecSchema, type CarouselReview, type CarouselSpec } from "./schemas";
import { reviewCarouselDraft, shouldRunQA } from "./carousel-reviewer";
import { assertWithinMonthlyCap, getMonthlyUsage, logAIUsage } from "./usage";
import { assertValidCarouselSpec } from "./validation";

export type GenerateCarouselResult = {
  spec: CarouselSpec;
  source: "openai" | "fallback";
  model: string | null;
  generatedAt: string;
  warning: string | null;
  qa: CarouselReview | null;
};

export class CanonicalGenerationBlockedError extends Error {
  constructor(reason: string) {
    super(`GENERATION_BLOCKED:${reason}`);
    this.name = "CanonicalGenerationBlockedError";
  }
}

type CarouselStructuredRequest = (options: {
  model: string;
  schema: typeof carouselSpecSchema;
  schemaName: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}) => Promise<StructuredResult<CarouselSpec>>;

function pinPreferredHook(spec: CarouselSpec, preferredHook?: string): CarouselSpec {
  if (!preferredHook) return spec;
  return carouselSpecSchema.parse({
    ...spec,
    hook: preferredHook,
    slides: spec.slides.map((slide, index) => index === 0 ? { ...slide, headline: preferredHook } : slide),
  });
}

export async function generateCarousel(
  input: CarouselGeneratorInput & { bypassMonthlyCap?: boolean },
  dependencies: {
    structuredRequest?: CarouselStructuredRequest;
    monthlyUsage?: typeof getMonthlyUsage;
    random?: () => number;
  } = {},
  context: { carouselId?: string } = {},
): Promise<GenerateCarouselResult> {
  const config = getAIConfig();
  const generatedAt = new Date().toISOString();
  if (input.requireCanonicalContext && (!input.accountId || !input.personaId || !input.topicId || !input.hookId || !input.formatId || !input.editorialContext)) {
    throw new CanonicalGenerationBlockedError("mandatory editorial context is incomplete");
  }
  const fallback = (reason: string): GenerateCarouselResult => ({
    spec: createFallbackCarousel(input), source: "fallback", model: null, generatedAt, warning: `AI generation unavailable - fallback used. ${reason}`, qa: null,
  });

  if (!config.AI_GENERATION_ENABLED) {
    if (input.requireCanonicalContext) throw new CanonicalGenerationBlockedError("AI_GENERATION_ENABLED=false");
    return fallback("AI_GENERATION_ENABLED=false");
  }
  if (!config.OPENAI_API_KEY) {
    if (input.requireCanonicalContext) throw new CanonicalGenerationBlockedError("OPENAI_API_KEY is missing");
    return fallback("OPENAI_API_KEY is missing");
  }

  const monthly = await (dependencies.monthlyUsage ?? getMonthlyUsage)();
  assertWithinMonthlyCap(monthly.costUsd, config.OPENAI_MAX_MONTHLY_USD, input.bypassMonthlyCap === true);

  const request: CarouselStructuredRequest = dependencies.structuredRequest ?? requestStructured;
  try {
    let spec: CarouselSpec | null = null;
    let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let lastValidationError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const repairIssues = lastValidationError instanceof Error ? lastValidationError.message : "";
        const result = await request({
          model: config.OPENAI_MODEL_PRIMARY,
          schema: carouselSpecSchema,
          schemaName: "cortifree_carousel_spec",
          instructions: `${CAROUSEL_GENERATOR_INSTRUCTIONS}${attempt > 1 ? `\n\nCORRECTION PASS: The previous draft was rejected for these exact blocking reasons: ${repairIssues}. Rewrite the entire JSON. Preserve the requested format and slide count, but remove unsafe health claims, placeholders, duplicates, and malformed structure. Do not treat minor visual/copy polish as a blocker.` : ""}`,
          input: buildGeneratorInput(input),
          maxOutputTokens: 3_200,
        });
        usage = {
          inputTokens: usage.inputTokens + result.usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens + result.usage.cachedInputTokens,
          outputTokens: usage.outputTokens + result.usage.outputTokens,
        };
        const candidate = carouselSpecSchema.parse(result.data);
        assertValidCarouselSpec(candidate, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        spec = candidate;
        break;
      } catch (error) {
        lastValidationError = error;
        if (attempt === 3) throw error;
      }
    }
    if (!spec) throw lastValidationError ?? new Error("OpenAI returned no usable carousel");
    await logAIUsage({ operation: `carousel.generate:${CAROUSEL_GENERATOR_PROMPT_VERSION}`, model: config.OPENAI_MODEL_PRIMARY, carouselId: context.carouselId, usage, success: true });

    let qa: CarouselReview | null = null;
    if (config.OPENAI_QA_ENABLED && shouldRunQA(config.OPENAI_QA_SAMPLE_RATE, dependencies.random)) {
      qa = await reviewCarouselDraft(spec, { carouselId: context.carouselId, expectedSlideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
      // AI QA is advisory. Deterministic safety/structure checks above decide
      // whether a draft can proceed; editorial preferences belong in review.
      if (!qa.approved && !qa.correctedSpec) {
        return { spec: pinPreferredHook(spec, input.preferredHook), source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: `AI QA review required: ${qa.issues.map((issue) => issue.message).slice(0, 2).join("; ")}`, qa };
      }
      if (qa.correctedSpec) {
        assertValidCarouselSpec(qa.correctedSpec, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        return { spec: pinPreferredHook(qa.correctedSpec, input.preferredHook), source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: null, qa };
      }
    }
    return { spec: pinPreferredHook(spec, input.preferredHook), source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: null, qa };
  } catch (error) {
    await logAIUsage({ operation: `carousel.generate:${CAROUSEL_GENERATOR_PROMPT_VERSION}`, model: config.OPENAI_MODEL_PRIMARY, carouselId: context.carouselId, success: false, error: error instanceof Error ? error.message : "Unknown generation error" });
    if (input.requireCanonicalContext) throw new CanonicalGenerationBlockedError(error instanceof Error ? error.message : "OpenAI request failed");
    return fallback(error instanceof Error ? error.message : "OpenAI request failed");
  }
}
