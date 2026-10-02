import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { generateCarousel } from "../app/lib/ai/carousel-generator.js";
import { scoreGenericity } from "../app/lib/ai/genericity.js";
import { CAROUSEL_GENERATOR_INSTRUCTIONS } from "../app/lib/ai/prompts.js";
import { createFallbackCarousel } from "../app/lib/ai/fallback.js";
import { withRetry } from "../app/lib/ai/openai-client.js";
import { estimateCostUsd } from "../app/lib/ai/pricing.js";
import { carouselSpecSchema } from "../app/lib/ai/schemas.js";
import { shouldRunQA } from "../app/lib/ai/carousel-reviewer.js";
import { assertWithinMonthlyCap, MonthlyCapExceededError } from "../app/lib/ai/usage.js";
import { validateCarouselSpec } from "../app/lib/ai/validation.js";
import { makeTextOverlay } from "../app/lib/render-carousel.js";
import { connectedPlatforms, filterUploadPostProfiles, normalizeUploadPostResults, parseUploadPostProfiles, pickAssignedUploadPostProfile } from "../app/lib/upload-post.js";
import type { CarouselGeneratorInput } from "../app/lib/ai/types.js";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

const baseInput: CarouselGeneratorInput = {
  carouselType: "F04_AESTHETIC_EDUCATIONAL",
  layout: "single-image",
  persona: "P01",
  language: "en",
  market: "US",
  references: [{ id: "ref-1", title: "Gentle routine reference", slideCount: 7 }],
  recentCarousels: [],
  requestedSlideCount: 7,
  ctaMode: "save",
};

function validSpec(language: "en" | "fr" = "en") {
  const copy = language === "fr"
    ? [["Une routine plus douce", "Des idées simples pour ralentir."], ["Lumière du jour", "Ouvre les rideaux quelques minutes."], ["Petit-déjeuner simple", "Choisis un repas qui te rassasie."], ["Pause sans écran", "Accorde-toi une vraie coupure."], ["Marche facile", "Bouge sans objectif de performance."], ["Soirée plus calme", "Baisse les lumières progressivement."], ["Garde une seule idée", "Sauvegarde et commence petit."]]
    : [["A softer everyday routine", "Simple ideas for a less rushed day."], ["Start with daylight", "Open the curtains for a few minutes."], ["Keep breakfast simple", "Choose a meal that feels satisfying."], ["Take a screen-free pause", "Give yourself one real break."], ["Try an easy walk", "Move without a performance goal."], ["Make evenings quieter", "Dim the lights as the day winds down."], ["Keep one idea", "Save this and start small."]];
  return carouselSpecSchema.parse({
    title: copy[0]![0], topic: copy[0]![0], angle: language === "fr" ? "Des habitudes réalistes sans promesse médicale." : "Realistic habits without medical promises.",
    hook: copy[0]![0], language, caption: language === "fr" ? "Sauvegarde pour plus tard." : "Save this for later.", ctaType: "save",
    slides: copy.map(([headline, body], index) => ({
      position: index + 1, role: index === 0 ? "HOOK" : index === copy.length - 1 ? "CTA" : "TIP",
      layout: "single-image", headline, body, visualIntent: "Calm everyday lifestyle scene with negative space", assetType: "stock", assetQuery: `wellness lifestyle ${index + 1}`,
    })),
  });
}

describe("CortiFree AI schemas and generation", () => {
  it("accepts a valid structured carousel and rejects invalid structured output", () => {
    assert.equal(carouselSpecSchema.parse(validSpec()).slides.length, 7);
    assert.throws(() => carouselSpecSchema.parse({ title: "missing fields" }));
  });

  it("returns a valid mocked OpenAI generation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const result = await generateCarousel(baseInput, {
      monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
      structuredRequest: async () => ({ data: validSpec(), usage: { inputTokens: 1_000, cachedInputTokens: 200, outputTokens: 500 } }),
    });
    assert.equal(result.source, "openai");
    assert.equal(result.spec.slides[0]?.role, "HOOK");
  });

  it("rejects unsafe health claims before AI QA", () => {
    const unsafe = validSpec();
    unsafe.slides[2]!.body = "This lowers cortisol by 35% in one week.";
    const issues = validateCarouselSpec(unsafe, { slideCount: 7, language: "en", layout: "single-image" });
    assert.ok(issues.some((issue) => issue.code === "HEALTH_CLAIM" && issue.severity === "major"));
  });

  it("does not mistake ordinary 'treating' language or safety disclaimers for medical claims", () => {
    const safe = validSpec();
    safe.hook = "I stopped treating my commute like a full-time job";
    safe.slides[0]!.headline = safe.hook;
    safe.slides[1]!.body = "This is general wellness context, not a diagnosis.";
    const issues = validateCarouselSpec(safe, { slideCount: 7, language: "en", layout: "single-image" });
    assert.equal(issues.some((issue) => issue.code === "HEALTH_CLAIM"), false);
  });

  it("rejects stray non-Latin or replacement glyphs anywhere in English visual prompts", () => {
    const devanagari = validSpec();
    devanagari.slides[1]!.assetQuery = "simple breakfast with fruit फल on a kitchen table";
    const devanagariIssues = validateCarouselSpec(devanagari, { slideCount: 7, language: "en", layout: "single-image" });
    assert.ok(devanagariIssues.some((issue) => issue.code === "UNEXPECTED_SCRIPT"));

    const corrupted = validSpec();
    corrupted.slides[2]!.visualIntent = "quiet desk with phone off the home� screen";
    const corruptedIssues = validateCarouselSpec(corrupted, { slideCount: 7, language: "en", layout: "single-image" });
    assert.ok(corruptedIssues.some((issue) => issue.code === "UNEXPECTED_SCRIPT"));
  });

  it("strips invisible Unicode formatting marks before accepting generated copy", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const dirty = validSpec();
    dirty.hook = "a softer\u200B everyday routine";
    dirty.slides[0]!.headline = dirty.hook;
    dirty.slides[1]!.assetQuery = "simple\u200C breakfast on a kitchen table";
    dirty.slides[2]!.visualIntent = "quiet desk\u2060 with natural light";
    const result = await generateCarousel(baseInput, {
      monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
      structuredRequest: async () => ({ data: dirty, usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 } }),
    });
    assert.equal(result.source, "openai");
    assert.equal(result.spec.hook, "a softer everyday routine");
    assert.equal(result.spec.slides[1]!.assetQuery, "simple breakfast on a kitchen table");
    assert.equal(result.spec.slides[2]!.visualIntent, "quiet desk with natural light");
  });

  it("adds script-specific repair instructions after a non-Latin generation rejection", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const dirty = validSpec();
    dirty.slides[1]!.assetQuery = "simple breakfast with fruit फल on a kitchen table";
    const seenInstructions: string[] = [];
    let calls = 0;
    const result = await generateCarousel(baseInput, {
      monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
      structuredRequest: async (options) => {
        seenInstructions.push(options.instructions);
        calls += 1;
        return {
          data: calls === 1 ? dirty : validSpec(),
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
        };
      },
    });
    assert.equal(result.source, "openai");
    assert.equal(calls, 2);
    assert.doesNotMatch(seenInstructions[0] ?? "", /SCRIPT REPAIR/);
    assert.match(seenInstructions[1] ?? "", /SCRIPT REPAIR/);
    assert.match(seenInstructions[1] ?? "", /assetQuery and visualIntent/);
  });

  it("adds an exact F05 item-count repair after a checklist rejection", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const seenInstructions: string[] = [];
    let calls = 0;
    const result = await generateCarousel(baseInput, {
      monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
      structuredRequest: async (options) => {
        seenInstructions.push(options.instructions);
        calls += 1;
        if (calls === 1) throw new Error("F05 Notes body must contain 4-6 complete useful list items");
        return {
          data: validSpec(),
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
        };
      },
    });
    assert.equal(result.source, "openai");
    assert.equal(calls, 2);
    assert.match(seenInstructions[1] ?? "", /F05 CHECKLIST REPAIR/);
    assert.match(seenInstructions[1] ?? "", /exactly 5 complete useful checklist items/);
  });

  it("requires the selected canonical renderer layout", () => {
    const spec = validSpec();
    spec.slides.forEach((slide) => { slide.layout = "grid-2x2"; });
    const issues = validateCarouselSpec(spec, { slideCount: 7, language: "en", layout: "single-image" });
    assert.equal(issues.some((issue) => issue.code === "LAYOUT"), true);
  });

  it("renders text without a background card", () => {
    const slide = validSpec().slides[0]!;
    const svg = makeTextOverlay(slide, {
      text: { x: 100, y: 400, width: 880, headlineColor: "#24312c", bodyColor: "#5f6d66" },
    }).toString();
    assert.doesNotMatch(svg, /<rect\b/);
    assert.match(svg, />A softer everyday routine</);
  });

  it("reads Upload-Post profiles and connected platforms", () => {
    const profiles = parseUploadPostProfiles({ profiles: [
      { username: "empty", social_accounts: { tiktok: "" } },
      { username: "cortifree", social_accounts: { tiktok: { display_name: "CortiFree" }, instagram: null } },
    ] });
    assert.deepEqual(connectedPlatforms(profiles[1]!), ["tiktok"]);
  });

  it("keeps Cocorise profiles outside the CortiFree publishing boundary", () => {
    const profiles = parseUploadPostProfiles({ profiles: [
      { username: "cocorise-01", social_accounts: { tiktok: { display_name: "Cocorise" } } },
      { username: "cortifree-01", social_accounts: { tiktok: { display_name: "CortiFree" } } },
    ] });
    const allowed = filterUploadPostProfiles(profiles, ["cortifree-01"]);
    assert.deepEqual(allowed.map((profile) => profile.username), ["cortifree-01"]);
    assert.equal(pickAssignedUploadPostProfile(profiles, "tiktok", undefined), undefined);
    assert.equal(pickAssignedUploadPostProfile(allowed, "tiktok", "cocorise-01"), undefined);
    assert.equal(pickAssignedUploadPostProfile(allowed, "tiktok", "cortifree-01"), "cortifree-01");
  });

  it("normalizes Upload-Post results returned as arrays or platform maps", () => {
    assert.deepEqual(normalizeUploadPostResults({ results: [{ platform: "tiktok", success: true }] }), [{ platform: "tiktok", success: true }]);
    assert.deepEqual(normalizeUploadPostResults({ results: { tiktok: { success: true, url: "https://example.com/post" } } }), [
      { platform: "tiktok", success: true, url: "https://example.com/post" },
    ]);
  });

  it("falls back when unconfigured, on API failure, and on invalid model copy", async () => {
    delete process.env.OPENAI_API_KEY;
    assert.equal((await generateCarousel(baseInput)).source, "fallback");

    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const dependencies = { monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }) };
    const apiFailure = await generateCarousel(baseInput, { ...dependencies, structuredRequest: async () => { throw new Error("401 unauthorized"); } });
    assert.equal(apiFailure.source, "fallback");

    const unsafe = validSpec();
    unsafe.caption = "Guaranteed to balance your hormones.";
    const invalidCopy = await generateCarousel(baseInput, { ...dependencies, structuredRequest: async () => ({ data: unsafe, usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 } }) });
    assert.equal(invalidCopy.source, "fallback");
  });

  it("gives health-specific rewrite instructions after a deterministic health rejection", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const unsafe = validSpec();
    unsafe.slides[2]!.body = "This breathing habit treats anxiety.";
    const seenInstructions: string[] = [];
    let calls = 0;
    const result = await generateCarousel(baseInput, {
      monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
      structuredRequest: async (options) => {
        seenInstructions.push(options.instructions);
        calls += 1;
        return {
          data: calls === 1 ? unsafe : validSpec(),
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
        };
      },
    });
    assert.equal(result.source, "openai");
    assert.equal(calls, 2);
    assert.doesNotMatch(seenInstructions[0] ?? "", /HEALTH-SAFETY REWRITE/);
    assert.match(seenInstructions[1] ?? "", /HEALTH-SAFETY REWRITE/);
    assert.match(seenInstructions[1] ?? "", /pause cue/);
  });

  it("uses a fourth targeted repair when the model repeatedly misses the exact slide count", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    const wrongCount = validSpec();
    wrongCount.slides = wrongCount.slides.slice(0, 6);
    const seenInstructions: string[] = [];
    let calls = 0;
    const result = await generateCarousel(baseInput, {
      monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
      structuredRequest: async (options) => {
        calls += 1;
        seenInstructions.push(options.instructions);
        return {
          data: calls < 4 ? structuredClone(wrongCount) : validSpec(),
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
        };
      },
    });
    assert.equal(result.source, "openai");
    assert.equal(calls, 4);
    assert.match(seenInstructions[0] ?? "", /Return exactly 7 slides/);
    assert.match(seenInstructions[1] ?? "", /SLIDE-COUNT REPAIR/);
    assert.match(seenInstructions[3] ?? "", /positions 1 through 7/);
  });

  it("retries retryable failures with exponential retry boundaries", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Request timed out");
      return "ok";
    }, { attempts: 3, sleep: async () => undefined });
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("enforces the monthly cap and calculates cached-token pricing", () => {
    assert.throws(() => assertWithinMonthlyCap(15, 15), MonthlyCapExceededError);
    assert.doesNotThrow(() => assertWithinMonthlyCap(15, 15, true));
    assert.equal(estimateCostUsd("gpt-5.6-luna", { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 1_000_000 }), 1.31);
  });

  it("samples QA at the configured rate", () => {
    assert.equal(shouldRunQA(0.2, () => 0.19), true);
    assert.equal(shouldRunQA(0.2, () => 0.2), false);
    assert.equal(shouldRunQA(0, () => 0), false);
  });

  it("produces valid deterministic EN and FR output", () => {
    const en = createFallbackCarousel(baseInput);
    const fr = createFallbackCarousel({ ...baseInput, language: "fr", market: "FR" });
    assert.equal(en.language, "en");
    assert.equal(fr.language, "fr");
    assert.equal(en.slides.length, 7);
    assert.equal(fr.slides.length, 7);
    assert.doesNotMatch(fr.caption, /Save this/i);
  });

  it("produces an F03 fallback matching the real TikTok routine reference", () => {
    const routineInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F03_ROUTINE_TIMELINE",
      layout: "routine-timeline",
      requestedSlideCount: 7,
      preferredHook: "my realistic low-stress morning routine",
    };
    const routine = createFallbackCarousel(routineInput);
    assert.equal(routine.slides[0]?.layout, "routine-timeline");
    assert.match(routine.slides[0]?.body ?? "", /^6:00\s*-\s*7:15$/);
    assert.match(routine.slides[1]?.headline ?? "", /^6:00\s*-\s*6:05\s*·/);
    assert.equal(routine.slides.at(-1)?.role, "STEP");
    assert.match(routine.slides.at(-1)?.headline ?? "", /^7:10\s*-\s*7:15\s*·/);
    assert.ok(routine.slides.slice(1).every((slide) => slide.body.length <= 90));
    const issues = validateCarouselSpec(routine, { slideCount: 7, language: "en", layout: "routine-timeline" });
    assert.equal(issues.some((issue) => issue.code === "ROUTINE_TIME_RANGE" || issue.code === "ROUTINE_BODY_LENGTH" || issue.code === "LAYOUT"), false);
  });

  it("rejects F03 when the timeline becomes an errands-and-messages itinerary", () => {
    const routineInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F03_ROUTINE_TIMELINE",
      layout: "routine-timeline",
      requestedSlideCount: 7,
      preferredHook: "my low-stress afternoon routine",
    };
    const routine = createFallbackCarousel(routineInput);
    routine.slides[2]!.headline = "10:30 - 10:45 · take a call outside";
    routine.slides[3]!.headline = "12:15 - 12:35 · run a grocery errand";
    const issues = validateCarouselSpec(routine, { slideCount: 7, language: "en", layout: "routine-timeline" });
    assert.equal(issues.some((issue) => issue.code === "ROUTINE_ITINERARY_DRIFT" && issue.severity === "major"), true);
  });

  it("produces a canonical F05 Notes-style master-list fallback", () => {
    const checklistInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F05_INTERACTIVE_CHECKLIST",
      layout: "interactive-checklist",
      requestedSlideCount: 8,
      preferredHook: "I want to eat better but I don’t know where to start",
    };
    const checklist = createFallbackCarousel(checklistInput);
    assert.equal(checklist.slides.length, 8);
    assert.ok(checklist.slides.every((slide) => slide.layout === "interactive-checklist"));
    assert.equal(checklist.slides[0]?.body, "");
    assert.ok(checklist.slides.slice(1).every((slide) => {
      const choices = slide.body.split("|").map((item) => item.trim()).filter(Boolean);
      return choices.length >= 4 && choices.length <= 6;
    }));
    assert.ok(checklist.slides.slice(1).every((slide) => slide.role === "CHECKLIST"));
    assert.ok(checklist.slides.slice(1).every((slide) => slide.headline.trim().split(/\s+/).length >= 3));
    const issues = validateCarouselSpec(checklist, { slideCount: 8, language: "en", layout: "interactive-checklist" });
    assert.equal(issues.some((issue) => issue.code.startsWith("CHECKLIST_") || issue.code === "LAYOUT"), false);
  });

  it("preserves complete F05 checklist copy beyond the old 280-character ceiling", () => {
    const checklistInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F05_INTERACTIVE_CHECKLIST",
      layout: "interactive-checklist",
      requestedSlideCount: 8,
    };
    const checklist = createFallbackCarousel(checklistInput);
    const items = [
      "turn off notifications you never act on and keep only the people you actually need to hear from",
      "leave distracting apps somewhere less immediate so opening them becomes an intentional choice",
      "give yourself one part of the morning where you do not have to check or answer anything",
      "decide when you will come back to messages instead of letting every new alert choose the timing",
      "notice which apps leave you more drained than before you opened them and shorten those sessions",
    ];
    assert.ok(items.every((item) => item.length <= 96));
    const body = items.join(" | ");
    assert.ok(body.length > 280);
    checklist.slides[1]!.headline = "Make your phone less demanding";
    checklist.slides[1]!.body = body;
    const parsed = carouselSpecSchema.parse(checklist);
    assert.equal(parsed.slides[1]!.body, body);
    assert.ok(parsed.slides[1]!.body.length > 280);
    const issues = validateCarouselSpec(parsed, { slideCount: 8, language: "en", layout: "interactive-checklist" });
    assert.equal(issues.some((issue) => issue.code === "BODY_LENGTH" || issue.code === "CHECKLIST_OPTION_LENGTH"), false);
  });

  it("produces a canonical F01 lifestyle three-stack fallback", () => {
    const lifestyleInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F01_LIFESTYLE_GUIDE",
      layout: "lifestyle-3stack",
      requestedSlideCount: 8,
      preferredHook: "become better this summer",
    };
    const lifestyle = createFallbackCarousel(lifestyleInput);
    assert.equal(lifestyle.slides.length, 8);
    assert.ok(lifestyle.slides.every((slide) => slide.layout === "lifestyle-3stack"));
    assert.equal(lifestyle.slides[0]?.headline, "become better this summer");
    assert.ok(lifestyle.slides.slice(1).every((slide) => /three|3/i.test(slide.visualIntent)));
    assert.ok(lifestyle.slides.slice(1).every((slide) => /same behavior|same habit/i.test(slide.visualIntent)));
    assert.ok(lifestyle.slides.slice(1).every((slide) => slide.body.trim().split(/\s+/).length <= 32));
    assert.equal(lifestyle.slides.at(-1)?.role, "TAKEAWAY");
    const issues = validateCarouselSpec(lifestyle, { slideCount: 8, language: "en", layout: "lifestyle-3stack" });
    assert.equal(issues.some((issue) => issue.code.startsWith("LIFESTYLE_") || issue.code === "LAYOUT"), false);
  });

  it("does not require creator POV or action-verb density for F07 tier lists", () => {
    const rankingInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F07_RANKING",
      layout: "ranking",
      requestedSlideCount: 7,
    };
    const ranking = createFallbackCarousel(rankingInput);
    ranking.title = "morning phone habits ranked";
    ranking.topic = "morning phone habits";
    ranking.angle = "ranked by practicality";
    ranking.hook = "morning phone habits tier list";
    ranking.caption = "ranked by how practical each habit is";
    ranking.slides.forEach((slide, index) => {
      if (index === 0) {
        slide.headline = "morning phone habits tier list";
        slide.body = "";
      } else {
        slide.headline = ["S · phone outside the bedroom", "A · social apps after breakfast", "B · notifications muted", "C · app limits", "D · total morning ban", "F · phone under the pillow"][index - 1] ?? "B · simple boundary";
        slide.body = "Useful for a clear reason, with an obvious tradeoff. Practicality matters more than sounding personal.";
      }
    });
    const genericity = scoreGenericity(ranking);
    assert.equal(genericity.issues.some((issue) => issue.code === "LOW_CONCRETENESS"), false);
    assert.equal(genericity.issues.some((issue) => issue.code === "NO_CREATOR_POINT_OF_VIEW"), false);
    const issues = validateCarouselSpec(ranking, { slideCount: 7, language: "en", layout: "ranking" });
    assert.equal(issues.some((issue) => issue.code === "GENERICITY"), false);
  });

  it("keeps F04 section labels aligned with the validator", () => {
    const f04Block = CAROUSEL_GENERATOR_INSTRUCTIONS.match(/F04_AESTHETIC_EDUCATIONAL:[\s\S]*?F05_INTERACTIVE_CHECKLIST:/)?.[0] ?? "";
    assert.match(f04Block, /BENEFITS, HOW TO, WHY IT HELPS, WHAT TO USE, MISTAKES/);
    assert.doesNotMatch(f04Block, /MISTAKES, TAKEAWAY/);
  });

  it("produces a canonical F07 meaning-first tier-list fallback", () => {
    const rankingInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F07_RANKING",
      layout: "ranking",
      requestedSlideCount: 9,
    };
    const ranking = createFallbackCarousel(rankingInput);
    assert.equal(ranking.slides.length, 9);
    assert.ok(ranking.slides.every((slide) => slide.layout === "ranking"));
    assert.match(ranking.slides[0]?.headline ?? "", /TIER LIST/i);
    assert.ok(ranking.slides.slice(1, -1).every((slide) => /^(SS\+|[FDCBAS])\s*[·•|—–:\-]/i.test(slide.headline)));
    assert.ok(ranking.slides.slice(1, -1).every((slide) => !/\d+(?:\.\d+)?\/10/.test(slide.headline)));
    assert.doesNotMatch(ranking.slides.at(-1)?.headline ?? "", /reset|CortiFree/i);
    const issues = validateCarouselSpec(ranking, { slideCount: 9, language: "en", layout: "ranking" });
    assert.equal(issues.some((issue) => issue.code.startsWith("RANKING_") || issue.code === "LAYOUT"), false);
  });

  it("produces a canonical F02 asymmetric editorial fallback", () => {
    const editorialInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F02_EDITORIAL_COLLAGE",
      layout: "editorial-asym-hero",
      requestedSlideCount: 6,
      preferredHook: "your low-stress glow-up guide",
    };
    const editorial = createFallbackCarousel(editorialInput);
    assert.equal(editorial.slides.length, 6);
    assert.ok(editorial.slides.every((slide) => slide.layout === "editorial-asym-hero"));
    assert.ok(editorial.slides.every((slide) => slide.assetType === "stock"));
    assert.ok(editorial.slides.every((slide) => slide.body.length <= 150));
    const issues = validateCarouselSpec(editorial, { slideCount: 6, language: "en", layout: "editorial-asym-hero" });
    assert.equal(issues.some((issue) => issue.code === "LAYOUT" || issue.code === "EDITORIAL_BODY_LENGTH"), false);
  });

  it("produces a canonical F04 educational checklist board fallback", () => {
    const educationalInput: CarouselGeneratorInput = {
      ...baseInput,
      carouselType: "F04_AESTHETIC_EDUCATIONAL",
      layout: "three-rect-educational",
      requestedSlideCount: 6,
    };
    const educational = createFallbackCarousel(educationalInput);
    assert.equal(educational.slides.length, 6);
    assert.ok(educational.slides.every((slide) => slide.layout === "three-rect-educational"));
    assert.match(educational.slides[0]?.headline ?? "", /BREATHTAKING/i);
    assert.ok((educational.slides[0]?.body.length ?? 99) <= 24);
    assert.ok(educational.slides.slice(1).every((slide) => {
      const parts = slide.body.split("|").map((item) => item.trim()).filter(Boolean);
      return /^(BENEFITS|HOW TO|WHY IT HELPS|WHAT TO USE|MISTAKES)$/.test(parts[0] ?? "")
        && parts.length >= 4
        && parts.length <= 6
        && slide.headline.length <= 28
        && /proof|result|example/i.test(slide.visualIntent)
        && /tool|product|ingredient|support/i.test(slide.visualIntent);
    }));
    assert.equal(educational.slides.at(-1)?.assetType, "stock");
    const issues = validateCarouselSpec(educational, { slideCount: 6, language: "en", layout: "three-rect-educational" });
    assert.equal(issues.some((issue) => issue.code.startsWith("EDU_") || issue.code === "LAYOUT"), false);

    const paragraph = structuredClone(educational);
    paragraph.slides[1]!.body = "BENEFITS | This is a long explanatory sentence. It keeps going with another sentence. And then becomes an essay.";
    const paragraphIssues = validateCarouselSpec(paragraph, { slideCount: 6, language: "en", layout: "three-rect-educational" });
    assert.ok(paragraphIssues.some((issue) => issue.code === "EDU_BULLET_COUNT" || issue.code === "EDU_PARAGRAPH"));
  });
});
