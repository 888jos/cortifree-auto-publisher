import type { CarouselGeneratorInput } from "./types";
import { getAIConfig } from "./config";
import { createFallbackCarousel } from "./fallback";
import { requestStructured, type StructuredResult } from "./openai-client";
import { buildGeneratorInput, CAROUSEL_GENERATOR_INSTRUCTIONS, CAROUSEL_GENERATOR_PROMPT_VERSION } from "./prompts";
import { carouselSpecSchema, type CarouselReview, type CarouselSpec } from "./schemas";
import { reviewCarouselDraft, shouldRunQA } from "./carousel-reviewer";
import { assertWithinMonthlyCap, getMonthlyUsage, logAIUsage } from "./usage";
import { assertKnownModelPricing } from "./pricing";
import { assertValidCarouselSpec, validateCarouselSpec } from "./validation";
import { hasDashPunctuation, stripDashPunctuation } from "./dashes";
import { fixHashtags, nativeCase, nativeStyleIssues, titleHookReason } from "./native-style";
import { plainLanguageEdit } from "./plain-language";

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
// A Notes row holds about 70 characters on two lines at the 40px item size.
const NOTES_ITEM_TARGET = 70;

/**
 * Deterministic F05 list repair, so a single overlong item or a seventh item
 * no longer blocks the whole carousel after the model's rewrites: drop an
 * overlong aside in parentheses, then drop items still too long while at least
 * four remain, and keep six at most.
 */
export function tidyChecklistBody(body: string) {
  let items = body.split(/\s*(?:\||\n|;)\s*/).map((item) => item.trim()).filter(Boolean);
  if (!items.length) return body;
  items = items.map((item) => item.length > NOTES_ITEM_TARGET ? item.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim() || item : item);
  for (let index = items.length - 1; index >= 0 && items.length > 4; index -= 1) {
    if (items[index]!.length > NOTES_ITEM_TARGET) items.splice(index, 1);
  }
  return items.slice(0, 6).join(" | ");
}

export function sanitizeGeneratedCarouselSpec(spec: CarouselSpec): CarouselSpec {
  // Consumer-facing copy never ships dash punctuation, even if every repair
  // pass still used it.
  const copy = (value: string) => nativeCase(stripDashPunctuation(cleanGeneratedString(value)));
  // Slide text is drawn with fonts that have no colour emoji (♡ is fine);
  // the caption is posted as text, so it keeps them.
  const slideCopy = (value: string) => copy(value).replace(/(?!♡)\p{Extended_Pictographic}\uFE0F?/gu, "").replace(/\s{2,}/g, " ").trim();
  return {
    ...spec,
    title: slideCopy(spec.title),
    topic: cleanGeneratedString(spec.topic),
    angle: cleanGeneratedString(spec.angle),
    hook: slideCopy(spec.hook),
    caption: fixHashtags(copy(spec.caption)),
    slides: spec.slides.map((slide, index) => ({
      ...slide,
      headline: slideCopy(slide.headline),
      body: slide.layout === "interactive-checklist" && index > 0 ? tidyChecklistBody(slideCopy(slide.body)) : slideCopy(slide.body),
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
  // Low bar on purpose: a higher one made the model force "i" into every item.
  return items.filter((item) => PERSONAL_ITEM.test(item)).length < items.length / 4;
}

function referenceTexts(input: CarouselGeneratorInput) {
  const context = input.editorialContext;
  const examples = [...(context?.golden_examples ?? []), ...(context?.voice_examples ?? [])];
  return [
    ...examples.flatMap((example) => [example.hook, ...example.slides]),
    ...(context?.hook_style_references ?? []),
    ...(context?.operator_edits ?? []).map((edit) => edit.after),
    ...(input.recentCarousels ?? []).map((carousel) => carousel.hook ?? ""),
  ].filter(Boolean);
}

export async function generateCarousel(
  input: CarouselGeneratorInput & { bypassMonthlyCap?: boolean },
  dependencies: {
    structuredRequest?: CarouselStructuredRequest;
    plainLanguageRequest?: Parameters<typeof plainLanguageEdit>[1];
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
    // A draft that passed hard validation but was sent back for style is
    // kept: if the rewrites then fail, generation returns it instead of
    // losing a usable carousel.
    let bestValid: CarouselSpec | null = null;
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
          ? "\nCHECKLIST VOICE REPAIR: The Notes items read like a generic command list. Give a few of them her own touch (first person or a short aside in parentheses, e.g. \"phone charges in the kitchen (i will cave otherwise)\"), keep the rest as short plain notes, 4-12 words each, 4-5 items per Note."
          : "";
        const nativeRepair = /NATIVE_STYLE/.test(repairIssues)
          ? "\nNATIVE STYLE REPAIR: It still reads like AI. Cut every body slide to about 6-18 words (one line a girl would type), list items to 12 words max, remove \"not X, just Y\" / \"X, not Y\" constructions and neat punchline closers, and vary sentence shapes: do not explain every action with \"..., so i...\". Say it the way she would say it to a friend."
          : "";
        const routineRepair = /ROUTINE_STEP_|ROUTINE_THAT_GIRL/.test(repairIssues)
          ? "\nF03 STEP REPAIR: Each step after the time is ONE simple action a photo can show, 2-6 words, said the way a girl types it: \"walk around the block\", \"make a protein + fiber dinner\", \"eat dinner at the table\", \"shower and skincare\", \"stretch on my mat\", \"read in bed\". No second clause (before/after/until/then), no detail nobody needs (\"with one pan\"), no task with nothing to see (\"save my work\"). Its assetQuery and visualIntent show her DOING that action, nothing else. No \"that girl\" unless the post is about that trend."
          : "";
        const dashRepair = /DASH_PUNCTUATION/.test(repairIssues)
          ? "\nDASH REPAIR: Remove every em dash, en dash and spaced hyphen used as punctuation. Use a comma, a colon, a new short sentence, or \" / \" like a person typing on her phone. Hyphens inside words (low-effort) and F03 time ranges stay."
          : "";
        const originalityRepair = /COPIED_REFERENCE/.test(repairIssues)
          ? "\nORIGINALITY REPAIR: The draft reused wording from a reference or a recent post (quoted in the reasons). Keep the same voice, but write a different hook and your own item wording. Never reuse a reference's hook, items or sentences."
          : "";
        const titleHookRepair = /TITLE_HOOK/.test(repairIssues)
          ? "\nHOOK REPAIR: The hook reads like a blog or Pinterest title that labels the content. Rewrite ONLY the hook (and slide 1 headline) as something a girl would actually say on TikTok: a confession, a specific moment, a strong opinion, a \"you\" call-out or a real question about the same topic. Name the concrete moment instead of a vague feeling."
          : "";
        const specificityRepair =/Too few concrete behaviors or details|Copy has no creator point of view|GENERICITY/i.test(repairIssues)
          ? "\nSPECIFICITY REPAIR: Replace vague wellness language with observable actions, objects, settings and realistic tradeoffs tied to this exact territory. For creator-led formats use natural first-person framing where it fits. For F07 ranking, keep the copy text-first and explain each concrete item's practical reason instead of forcing diary language."
          : "";
        const result = await request({
          model: config.OPENAI_MODEL_PRIMARY,
          schema: carouselSpecSchema,
          schemaName: "cortifree_carousel_spec",
          instructions: `${CAROUSEL_GENERATOR_INSTRUCTIONS}\n\nEXACT STRUCTURE: Return exactly ${input.requestedSlideCount} slides. The slides array length is not flexible.${attempt > 1 ? `\n\nCORRECTION PASS: The previous draft was rejected for these exact blocking reasons: ${repairIssues}. Rewrite the entire JSON. Preserve the requested format and exact slide count, but remove unsafe health claims, placeholders, duplicates, and malformed structure. Do not treat minor visual/copy polish as a blocker.${slideCountRepair}${scriptRepair}${checklistRepair}${specificityRepair}${originalityRepair}${checklistVoiceRepair}${dashRepair}${nativeRepair}${routineRepair}${titleHookRepair}${/Unsafe health claim/i.test(repairIssues) ? "\nHEALTH-SAFETY REWRITE: Strip all treatment, cure, diagnosis, guaranteed-outcome, hormone-fixing and disease-management language. Do not use condition words such as anxiety, insomnia, burnout, acne, panic attacks, sleep disorder or fatigue in a treatment/diagnosis frame. For breathing, walking, sleep routines, light exposure or other wellness habits, describe only the concrete behavior and a cautious first-person or general relaxation/routine benefit, e.g. a pause cue, a wind-down cue, or something that may feel calming. Never imply it treats a condition or proves a cortisol/hormone state." : ""}` : ""}`,
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
        // Style rewrites (dashes, copying, voice, length) only use the first
        // two attempts; the rest are kept for hard validation failures, so a
        // style nudge can never exhaust generation.
        const styleAttempt = attempt <= 2;
        const candidate = sanitizeGeneratedCarouselSpec(parsed);
        assertValidCarouselSpec(candidate, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
        bestValid = candidate;
        // Ask for a natural rewrite first; sanitizing is only the safety net.
        const dashed = [parsed.hook, parsed.caption, ...parsed.slides.flatMap((slide) => [slide.headline, slide.body])].some(hasDashPunctuation);
        if (dashed && styleAttempt) throw new Error("DASH_PUNCTUATION: copy uses dashes as punctuation");
        // Copying a reference is worth a rewrite, but never a dead end: the
        // last attempt is kept even if it still echoes a reference.
        const copied = copiedReferencePhrase(candidate, referenceTexts(input));
        if (copied && styleAttempt) throw new Error(`COPIED_REFERENCE: "${copied}"`);
        if (isVoicelessChecklist(candidate) && styleAttempt) throw new Error("VOICELESS_CHECKLIST: most Notes items are bare commands");
        const generic = validateCarouselSpec(candidate, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout }).find((issue) => issue.code === "GENERICITY");
        if (generic && styleAttempt) throw new Error(`GENERICITY: ${generic.message}`);
        const styleIssues = nativeStyleIssues(candidate);
        if (styleIssues.length && styleAttempt) throw new Error(`NATIVE_STYLE: ${styleIssues.join("; ")}`);
        const titleHook = titleHookReason(candidate.hook);
        if (titleHook && styleAttempt) throw new Error(`TITLE_HOOK: "${candidate.hook}" ${titleHook}`);
        spec = candidate;
        break;
      } catch (error) {
        lastValidationError = error;
        if (attempt === maxAttempts) {
          if (bestValid) { spec = bestValid; break; }
          throw error;
        }
      }
    }
    if (!spec) throw lastValidationError ?? new Error("OpenAI returned no usable carousel");
    // Clarity pass: rewrite figurative lines ("my brain is actually online")
    // into plain concrete wording. Any failure keeps the validated draft.
    const plainRequest = dependencies.plainLanguageRequest ?? (dependencies.structuredRequest ? undefined : requestStructured);
    if (plainRequest) {
      try {
        const plain = await plainLanguageEdit(spec, plainRequest, config.OPENAI_MODEL_PRIMARY);
        usage = {
          inputTokens: usage.inputTokens + plain.usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens + plain.usage.cachedInputTokens,
          outputTokens: usage.outputTokens + plain.usage.outputTokens,
        };
        if (plain.spec) {
          const edited = sanitizeGeneratedCarouselSpec(plain.spec);
          assertValidCarouselSpec(edited, { slideCount: input.requestedSlideCount, language: input.language, layout: input.layout });
          spec = edited;
        }
      } catch (error) {
        console.warn("[ai] plain-language pass skipped", error instanceof Error ? error.message : error);
      }
    }
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
