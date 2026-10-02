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

const invisibleFormatChars = /[\u200B-\u200F\u2060-\u206F\uFEFF]/g;
function cleanGeneratedString(value: string) {
  return value.replace(invisibleFormatChars, "");
}
export function sanitizeGeneratedCarouselSpec(spec: CarouselSpec): CarouselSpec {
  return {
    ...spec,
    title: cleanGeneratedString(spec.title),
    topic: cleanGeneratedString(spec.topic),
    angle: cleanGeneratedString(spec.angle),
    hook: cleanGeneratedString(spec.hook),
    caption: cleanGeneratedString(spec.caption),
    slides: spec.slides.map((slide) => ({
      ...slide,
      headline: cleanGeneratedString(slide.headline),
      body: cleanGeneratedString(slide.body),
      visualIntent: cleanGeneratedString(slide.visualIntent),
      assetQuery: cleanGeneratedString(slide.assetQuery),
    })),
  };
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
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const repairIssues = lastValidationError instanceof Error ? lastValidationError.message : "";
        const slideCountRepair = /Expected\s+\d+\s+slides/i.test(repairIssues)
          ? `\nSLIDE-COUNT REPAIR: The slides array MUST contain exactly ${input.requestedSlideCount} objects, with positions 1 through ${input.requestedSlideCount}. Count them before returning JSON. Keep slide 1 as HOOK and slide ${input.requestedSlideCount} as the final TAKEAWAY/CTA.`
          : "";
        const scriptRepair = /stray non-Latin|UNEXPECTED_SCRIPT/i.test(repairIssues)
          ? "\nSCRIPT REPAIR: Retype every string field in clean English Latin script, including assetQuery and visualIntent. Do not copy Cyrillic, Han/CJK, Hiragana, Katakana, Hangul, Devanagari, Arabic, Hebrew, Thai or Bengali characters from prior text. Remove hidden or stray copied characters."
          : "";
        const checklistRepair = /F05 Notes body must contain 4-6 complete useful list items|CHECKLIST_OPTIONS/i.test(repairIssues)
          ? "\nF05 CHECKLIST REPAIR: Every body Note after the cover must contain exactly 5 complete useful checklist items separated by exactly four ' | ' delimiters. Each item is one clear behavior, choice or principle. Do not use pipe characters inside an item."
          : "";
        const specificityRepair = /Too few concrete behaviors or details|Copy has no creator point of view|GENERICITY/i.test(repairIssues)
          ? "\nSPECIFICITY REPAIR: Replace vague wellness language with observable actions, objects, settings and realistic tradeoffs tied to this exact territory. For creator-led formats use natural first-person framing where it fits. For F07 ranking, keep the copy text-first and explain each concrete item's practical reason instead of forcing diary language."
          : "";
        const result = await request({
          model: config.OPENAI_MODEL_PRIMARY,
          schema: carouselSpecSchema,
          schemaName: "cortifree_carousel_spec",
          instructions: `${CAROUSEL_GENERATOR_INSTRUCTIONS}\n\nEXACT STRUCTURE: Return exactly ${input.requestedSlideCount} slides. The slides array length is not flexible.${attempt > 1 ? `\n\nCORRECTION PASS: The previous draft was rejected for these exact blocking reasons: ${repairIssues}. Rewrite the entire JSON. Preserve the requested format and exact slide count, but remove unsafe health claims, placeholders, duplicates, and malformed structure. Do not treat minor visual/copy polish as a blocker.${slideCountRepair}${scriptRepair}${checklistRepair}${specificityRepair}${/Unsafe health claim/i.test(repairIssues) ? "\nHEALTH-SAFETY REWRITE: Strip all treatment, cure, diagnosis, guaranteed-outcome, hormone-fixing and disease-management language. Do not use condition words such as anxiety, insomnia, burnout, acne, panic attacks, sleep disorder or fatigue in a treatment/diagnosis frame. For breathing, walking, sleep routines, light exposure or other wellness habits, describe only the concrete behavior and a cautious first-person or general relaxation/routine benefit, e.g. a pause cue, a wind-down cue, or something that may feel calming. Never imply it treats a condition or proves a cortisol/hormone state." : ""}` : ""}`,
          input: buildGeneratorInput(input),
          maxOutputTokens: 3_200,
        });
        usage = {
          inputTokens: usage.inputTokens + result.usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens + result.usage.cachedInputTokens,
          outputTokens: usage.outputTokens + result.usage.outputTokens,
        };
        const candidate = sanitizeGeneratedCarouselSpec(carouselSpecSchema.parse(result.data));
        assertValidCarouselSpec(candidate, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        spec = candidate;
        break;
      } catch (error) {
        lastValidationError = error;
        if (attempt === maxAttempts) throw error;
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
        return { spec: spec, source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: `AI QA review required: ${qa.issues.map((issue) => issue.message).slice(0, 2).join("; ")}`, qa };
      }
      if (qa.correctedSpec) {
        const corrected = sanitizeGeneratedCarouselSpec(qa.correctedSpec);
        assertValidCarouselSpec(corrected, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        return { spec: corrected, source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: null, qa };
      }
    }
    return { spec: spec, source: "openai", model: config.OPENAI_MODEL_PRIMARY, generatedAt, warning: null, qa };
  } catch (error) {
    await logAIUsage({ operation: `carousel.generate:${CAROUSEL_GENERATOR_PROMPT_VERSION}`, model: config.OPENAI_MODEL_PRIMARY, carouselId: context.carouselId, success: false, error: error instanceof Error ? error.message : "Unknown generation error" });
    if (input.requireCanonicalContext) throw new CanonicalGenerationBlockedError(error instanceof Error ? error.message : "OpenAI request failed");
    return fallback(error instanceof Error ? error.message : "OpenAI request failed");
  }
}
