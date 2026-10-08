import type { CarouselGeneratorInput } from "./types";
import { getAIConfig } from "./config";
import { createFallbackCarousel } from "./fallback";
import { requestStructured, type StructuredResult } from "./openai-client";
import { buildGeneratorInput, CAROUSEL_GENERATOR_INSTRUCTIONS, CAROUSEL_GENERATOR_PROMPT_VERSION } from "./prompts";
import { carouselSpecSchema, type CarouselReview, type CarouselSpec } from "./schemas";
import { reviewCarouselDraft, shouldRunQA } from "./carousel-reviewer";
import { assertWithinMonthlyCap, getMonthlyUsage, logAIUsage } from "./usage";
import { assertKnownModelPricing } from "./pricing";
import { assertValidCarouselSpec } from "./validation";
import { hasDashPunctuation, stripDashPunctuation } from "./dashes";

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
  // Consumer-facing copy never ships dash punctuation, even if every repair
  // pass still used it.
  const copy = (value: string) => stripDashPunctuation(cleanGeneratedString(value));
  return {
    ...spec,
    title: copy(spec.title),
    topic: cleanGeneratedString(spec.topic),
    angle: cleanGeneratedString(spec.angle),
    hook: copy(spec.hook),
    caption: copy(spec.caption),
    slides: spec.slides.map((slide) => ({
      ...slide,
      headline: copy(slide.headline),
      body: copy(slide.body),
      visualIntent: cleanGeneratedString(slide.visualIntent),
      assetQuery: cleanGeneratedString(slide.assetQuery),
    })),
  };
}

const referenceWords = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
function shingles(value: string, size: number) {
  const words = referenceWords(value);
  const out = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) out.add(words.slice(index, index + size).join(" "));
  return out;
}

/**
 * Returns the first phrase the draft lifted from a reference or recent post:
 * a 5-word run in the hook, or two distinct 7-word runs anywhere in the copy.
 * Ordinary short phrases ("close the laptop") never trigger it.
 */
export function copiedReferencePhrase(spec: CarouselSpec, references: string[]): string | null {
  const hookRefs = new Set<string>();
  const copyRefs = new Set<string>();
  for (const reference of references) {
    for (const shingle of shingles(reference, 5)) hookRefs.add(shingle);
    for (const shingle of shingles(reference, 7)) copyRefs.add(shingle);
  }
  for (const shingle of shingles(spec.hook, 5)) if (hookRefs.has(shingle)) return shingle;
  const copied = new Set<string>();
  for (const field of [spec.caption, ...spec.slides.flatMap((slide) => [slide.headline, slide.body])]) {
    for (const shingle of shingles(field, 7)) if (copyRefs.has(shingle)) copied.add(shingle);
  }
  return copied.size >= 2 ? [...copied][0]! : null;
}

const PERSONAL_ITEM = /\b(i|i'm|i’m|i've|i’ve|my|me)\b|\(/i;

/**
 * F05 Notes slides drift into a generic command list. Returns true when fewer
 * than half of the checklist items carry her voice (first person or an aside).
 */
export function isVoicelessChecklist(spec: CarouselSpec) {
  const items = spec.slides
    .filter((slide) => slide.layout === "interactive-checklist" && slide.role !== "HOOK")
    .flatMap((slide) => slide.body.split(/\s*\|\s*/).map((item) => item.trim()).filter(Boolean));
  if (items.length < 4) return false;
  return items.filter((item) => PERSONAL_ITEM.test(item)).length < items.length / 2;
}

function referenceTexts(input: CarouselGeneratorInput) {
  const context = input.editorialContext;
  const examples = [...(context?.golden_examples ?? []), ...(context?.voice_examples ?? [])];
  return [
    ...examples.flatMap((example) => [example.hook, ...example.slides]),
    ...(context?.hook_style_references ?? []),
    ...(input.recentCarousels ?? []).map((carousel) => carousel.hook ?? ""),
  ].filter(Boolean);
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

  assertKnownModelPricing(config.OPENAI_MODEL_PRIMARY);
  const monthly = await (dependencies.monthlyUsage ?? getMonthlyUsage)();
  assertWithinMonthlyCap(monthly.costUsd, config.OPENAI_MAX_MONTHLY_USD, input.bypassMonthlyCap === true);

  const request: CarouselStructuredRequest = dependencies.structuredRequest ?? requestStructured;
  // Tokens from rejected attempts are still billed, so they are logged on failure too.
  let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let usageLogged = false;
  try {
    let spec: CarouselSpec | null = null;
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
        const checklistVoiceRepair = /VOICELESS_CHECKLIST/.test(repairIssues)
          ? "\nCHECKLIST VOICE REPAIR: The Notes items read like a generic command list. Rewrite them as her own notes: at least half in first person or with a short aside in parentheses (e.g. \"phone charges in the kitchen (i will cave otherwise)\"), 4-12 words each, 4-5 items per Note."
          : "";
        const dashRepair = /DASH_PUNCTUATION/.test(repairIssues)
          ? "\nDASH REPAIR: Remove every em dash, en dash and spaced hyphen used as punctuation. Use a comma, a colon, a new short sentence, or \" / \" like a person typing on her phone. Hyphens inside words (low-effort) and F03 time ranges stay."
          : "";
        const originalityRepair = /COPIED_REFERENCE/.test(repairIssues)
          ? "\nORIGINALITY REPAIR: The draft reused wording from a reference or a recent post (quoted in the reasons). Keep the same voice, but write a different hook and your own item wording. Never reuse a reference's hook, items or sentences."
          : "";
        const specificityRepair = /Too few concrete behaviors or details|Copy has no creator point of view|GENERICITY/i.test(repairIssues)
          ? "\nSPECIFICITY REPAIR: Replace vague wellness language with observable actions, objects, settings and realistic tradeoffs tied to this exact territory. For creator-led formats use natural first-person framing where it fits. For F07 ranking, keep the copy text-first and explain each concrete item's practical reason instead of forcing diary language."
          : "";
        const result = await request({
          model: config.OPENAI_MODEL_PRIMARY,
          schema: carouselSpecSchema,
          schemaName: "cortifree_carousel_spec",
          instructions: `${CAROUSEL_GENERATOR_INSTRUCTIONS}\n\nEXACT STRUCTURE: Return exactly ${input.requestedSlideCount} slides. The slides array length is not flexible.${attempt > 1 ? `\n\nCORRECTION PASS: The previous draft was rejected for these exact blocking reasons: ${repairIssues}. Rewrite the entire JSON. Preserve the requested format and exact slide count, but remove unsafe health claims, placeholders, duplicates, and malformed structure. Do not treat minor visual/copy polish as a blocker.${slideCountRepair}${scriptRepair}${checklistRepair}${specificityRepair}${originalityRepair}${checklistVoiceRepair}${dashRepair}${/Unsafe health claim/i.test(repairIssues) ? "\nHEALTH-SAFETY REWRITE: Strip all treatment, cure, diagnosis, guaranteed-outcome, hormone-fixing and disease-management language. Do not use condition words such as anxiety, insomnia, burnout, acne, panic attacks, sleep disorder or fatigue in a treatment/diagnosis frame. For breathing, walking, sleep routines, light exposure or other wellness habits, describe only the concrete behavior and a cautious first-person or general relaxation/routine benefit, e.g. a pause cue, a wind-down cue, or something that may feel calming. Never imply it treats a condition or proves a cortisol/hormone state." : ""}` : ""}`,
          input: buildGeneratorInput(input),
          // Voice-rich copy plus visual fields overflowed 3.2k and truncated assetQuery.
          maxOutputTokens: 4_800,
        });
        usage = {
          inputTokens: usage.inputTokens + result.usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens + result.usage.cachedInputTokens,
          outputTokens: usage.outputTokens + result.usage.outputTokens,
        };
        const parsed = carouselSpecSchema.parse(result.data);
        // Ask for a natural rewrite first; sanitizing is only the safety net.
        const dashed = [parsed.hook, parsed.caption, ...parsed.slides.flatMap((slide) => [slide.headline, slide.body])].some(hasDashPunctuation);
        if (dashed && attempt < maxAttempts) throw new Error("DASH_PUNCTUATION: copy uses dashes as punctuation");
        const candidate = sanitizeGeneratedCarouselSpec(parsed);
        assertValidCarouselSpec(candidate, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        // Copying a reference is worth a rewrite, but never a dead end: the
        // last attempt is kept even if it still echoes a reference.
        const copied = copiedReferencePhrase(candidate, referenceTexts(input));
        if (copied && attempt < maxAttempts) throw new Error(`COPIED_REFERENCE: "${copied}"`);
        if (isVoicelessChecklist(candidate) && attempt < maxAttempts) throw new Error("VOICELESS_CHECKLIST: most Notes items are bare commands");
        spec = candidate;
        break;
      } catch (error) {
        lastValidationError = error;
        if (attempt === maxAttempts) throw error;
      }
    }
    if (!spec) throw lastValidationError ?? new Error("OpenAI returned no usable carousel");
    await logAIUsage({ operation: `carousel.generate:${CAROUSEL_GENERATOR_PROMPT_VERSION}`, model: config.OPENAI_MODEL_PRIMARY, carouselId: context.carouselId, usage, success: true });
    usageLogged = true;

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
    if (!usageLogged) await logAIUsage({ operation: `carousel.generate:${CAROUSEL_GENERATOR_PROMPT_VERSION}`, model: config.OPENAI_MODEL_PRIMARY, carouselId: context.carouselId, usage, success: false, error: error instanceof Error ? error.message : "Unknown generation error" });
    if (input.requireCanonicalContext) throw new CanonicalGenerationBlockedError(error instanceof Error ? error.message : "OpenAI request failed");
    return fallback(error instanceof Error ? error.message : "OpenAI request failed");
  }
}
