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

function normalizedHookTokens(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[“”"'’‘….,!?♡()+\-–—/:;]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hookSimilarity(a: string, b: string) {
  const left = new Set(normalizedHookTokens(a));
  const right = new Set(normalizedHookTokens(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

export function hookNoveltyIssue(input: CarouselGeneratorInput, hook: string) {
  const normalized = normalizedHookTokens(hook).join(" ");
  const references = input.editorialContext?.hook_references ?? [];
  for (const reference of references) {
    const referenceNormalized = normalizedHookTokens(reference.text).join(" ");
    if (normalized === referenceNormalized || hookSimilarity(hook, reference.text) >= 0.82) {
      return `HOOK_TOO_SIMILAR_TO_REFERENCE:${reference.id}`;
    }
  }
  for (const recent of input.recentCarousels) {
    if (!recent.hook) continue;
    const recentNormalized = normalizedHookTokens(recent.hook).join(" ");
    if (normalized === recentNormalized || hookSimilarity(hook, recent.hook) >= 0.78) {
      return `HOOK_TOO_SIMILAR_TO_RECENT:${recent.id}`;
    }
  }
  return null;
}

function assertHookNovelty(input: CarouselGeneratorInput, spec: CarouselSpec) {
  const candidates = [spec.hook, spec.slides[0]?.headline].filter((value): value is string => Boolean(value));
  for (const hook of candidates) {
    const issue = hookNoveltyIssue(input, hook);
    if (issue) throw new Error(issue);
  }
}

function applyManualPreferredHook(spec: CarouselSpec, input: CarouselGeneratorInput): CarouselSpec {
  if (!input.preferredHook || input.requireCanonicalContext) return spec;
  return carouselSpecSchema.parse({
    ...spec,
    hook: input.preferredHook,
    slides: spec.slides.map((slide, index) => index === 0 ? { ...slide, headline: input.preferredHook! } : slide),
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
          instructions: `${CAROUSEL_GENERATOR_INSTRUCTIONS}${attempt > 1 ? `\n\nCORRECTION PASS: The previous draft was rejected for these exact blocking reasons: ${repairIssues}. Rewrite the entire JSON. Preserve the requested format and slide count, but remove unsafe health claims, placeholders, duplicates, and malformed structure. Do not treat minor visual/copy polish as a blocker.${/Unsafe health claim/i.test(repairIssues) ? "\nHEALTH-SAFETY REWRITE: Strip all treatment, cure, diagnosis, guaranteed-outcome, hormone-fixing and disease-management language. Do not use condition words such as anxiety, insomnia, burnout, acne, panic attacks, sleep disorder or fatigue in a treatment/diagnosis frame. For breathing, walking, sleep routines, light exposure or other wellness habits, describe only the concrete behavior and a cautious first-person or general relaxation/routine benefit, e.g. a pause cue, a wind-down cue, or something that may feel calming. Never imply it treats a condition or proves a cortisol/hormone state." : ""}` : ""}`,
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
        assertHookNovelty(input, candidate);
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
    if (config.OPENAI_QA_ENABLED && (input.requireCanonicalContext || shouldRunQA(config.OPENAI_QA_SAMPLE_RATE, dependencies.random))) {
      qa = await reviewCarouselDraft(spec, { carouselId: context.carouselId, expectedSlideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
      // AI QA is advisory. Deterministic safety/structure checks above decide
      // whether a draft can proceed; editorial preferences belong in review.
      if (!qa.approved && !qa.correctedSpec) {
        if (input.requireCanonicalContext) {
          throw new CanonicalGenerationBlockedError(`AI_QA_REJECTED:${qa.issues.map((issue) => issue.message).slice(0, 3).join("; ")}`);
        }
        return { spec: applyManualPreferredHook(spec, input), source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: `AI QA review required: ${qa.issues.map((issue) => issue.message).slice(0, 2).join("; ")}`, qa };
      }
      if (qa.correctedSpec) {
        assertValidCarouselSpec(qa.correctedSpec, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        assertHookNovelty(input, qa.correctedSpec);
        return { spec: applyManualPreferredHook(qa.correctedSpec, input), source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: null, qa };
      }
    }
    return { spec: applyManualPreferredHook(spec, input), source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: null, qa };
  } catch (error) {
    await logAIUsage({ operation: `carousel.generate:${CAROUSEL_GENERATOR_PROMPT_VERSION}`, model: config.OPENAI_MODEL_PRIMARY, carouselId: context.carouselId, success: false, error: error instanceof Error ? error.message : "Unknown generation error" });
    if (input.requireCanonicalContext) throw new CanonicalGenerationBlockedError(error instanceof Error ? error.message : "OpenAI request failed");
    return fallback(error instanceof Error ? error.message : "OpenAI request failed");
  }
}
