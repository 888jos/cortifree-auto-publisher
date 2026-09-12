import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { generateCarousel } from "../app/lib/ai/carousel-generator.js";
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
  carouselType: "C11_HORMONE_EDUCATION",
  layout: "symptom-map",
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
      layout: "symptom-map", headline, body, visualIntent: "Calm everyday lifestyle scene with negative space", assetType: "stock", assetQuery: `wellness lifestyle ${index + 1}`,
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
    const issues = validateCarouselSpec(unsafe, { slideCount: 7, language: "en", layout: "symptom-map" });
    assert.ok(issues.some((issue) => issue.code === "HEALTH_CLAIM" && issue.severity === "major"));
  });

  it("accepts the visual layout alias returned for a selected model", () => {
    const spec = validSpec();
    spec.slides.forEach((slide) => { slide.layout = "bubbles"; });
    const issues = validateCarouselSpec(spec, { slideCount: 7, language: "en", layout: "symptom-map" });
    assert.equal(issues.some((issue) => issue.code === "LAYOUT"), false);
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
});
