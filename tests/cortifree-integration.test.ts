import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ACTIVE_FORMAT_IDS } from "../src/content/formats.js";
import {
  CORTIFREE_FORMAT_INTEGRATION,
  cortifreeClaimReason,
  cortifreeIntegrationIssues,
  planCortifreeIntegration,
} from "../src/content/cortifree-integration.js";
import { generateCarousel, tidyChecklistBody } from "../app/lib/ai/carousel-generator.js";
import { CAROUSEL_GENERATOR_INSTRUCTIONS } from "../app/lib/ai/prompts.js";
import { carouselSpecSchema, type CarouselSpec } from "../app/lib/ai/schemas.js";
import { validateCarouselSpec } from "../app/lib/ai/validation.js";
import type { CarouselGeneratorInput } from "../app/lib/ai/types.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

const patterns = [
  { data: { integration_id: "CF_INT_01", integration_type: "HABIT_IN_LIST", weight_pct: 25, intensity: 1, active: "TRUE", allowed_screen_categories: "breathing|stress_reset" } },
  { data: { integration_id: "CF_INT_03", integration_type: "ROUTINE_STEP", weight_pct: 15, intensity: 2, active: "TRUE", allowed_screen_categories: "sleep|routine|breathing" } },
  { data: { integration_id: "CF_INT_06", integration_type: "BEFORE_AFTER", weight_pct: 7, intensity: 3, active: "TRUE" } },
  { data: { integration_id: "CF_INT_10", integration_type: "PRODUCT_LED", weight_pct: 90, intensity: 5, active: "TRUE" } },
  { data: { integration_id: "CF_INT_11", integration_type: "ROUTINE_STEP", weight_pct: 99, intensity: 4, active: "FALSE" } },
];
const screens = [
  { id: 1935, filename: "CF_APP_SCREEN_05_BREATHING_LIBRARY_01.jpeg", subcategory: "breathing_library" },
  { id: 1934, filename: "CF_APP_SCREEN_06_MEDITATION_LIBRARY_01.jpeg", subcategory: "meditation_library" },
];

describe("CortiFree integration plan", () => {
  it("integrates CortiFree on every active format by default, with a format-specific placement", () => {
    for (const formatId of ACTIVE_FORMAT_IDS) {
      const plan = planCortifreeIntegration({ seed: `slot:${formatId}`, formatId, patterns, appScreens: screens });
      assert.equal(plan.required, true, formatId);
      assert.equal(plan.mention, "cortifree");
      assert.ok(plan.placement && plan.placement.length > 40, formatId);
      assert.ok(CORTIFREE_FORMAT_INTEGRATION[formatId]!.types.includes(plan.integration_type ?? ""), `${formatId}:${plan.integration_type}`);
      // Product-led posts stay out of the default rotation.
      assert.notEqual(plan.integration_type, "PRODUCT_LED");
    }
    assert.equal(planCortifreeIntegration({ seed: "x", formatId: "F02_LEGACY" }).required, false);
  });

  it("uses the format's own pattern, ignores inactive rows and falls back without a Sheet bank", () => {
    for (let index = 0; index < 20; index += 1) {
      const routine = planCortifreeIntegration({ seed: `r${index}`, formatId: "F03_ROUTINE_TIMELINE", patterns });
      assert.equal(routine.integration_type, "ROUTINE_STEP");
      assert.equal(routine.intensity, 2, "the inactive ROUTINE_STEP row is never picked");
    }
    const bare = planCortifreeIntegration({ seed: "bare", formatId: "F08_2X2" });
    assert.equal(bare.integration_type, "BEFORE_AFTER");
    assert.equal(bare.screenshot_required, false);
  });

  it("adds an official screenshot only on formats with a photo slot, at the configured rate", () => {
    const shot = planCortifreeIntegration({ seed: "s", formatId: "F03_ROUTINE_TIMELINE", patterns, appScreens: screens, screenshotRatio: 1 });
    assert.equal(shot.screenshot_required, true);
    assert.equal(shot.app_screen_category, "breathing", "the pattern's screen list narrows the choice");
    assert.equal(shot.app_screen_asset_id, "1935");
    for (const formatId of ["F05_INTERACTIVE_CHECKLIST", "F07_RANKING"]) {
      assert.equal(planCortifreeIntegration({ seed: "s", formatId, patterns, appScreens: screens, screenshotRatio: 1 }).screenshot_required, false, formatId);
    }
    assert.equal(planCortifreeIntegration({ seed: "s", formatId: "F01_LIFESTYLE_GUIDE", patterns, appScreens: screens, screenshotRatio: 0 }).screenshot_required, false);
    assert.equal(planCortifreeIntegration({ seed: "s", formatId: "F01_LIFESTYLE_GUIDE", patterns, appScreens: [], screenshotRatio: 1 }).screenshot_required, false);
  });

  it("can be lowered from the Sheet with cortifree_integration_ratio", () => {
    const off = ACTIVE_FORMAT_IDS.map((formatId) => planCortifreeIntegration({ seed: formatId, formatId, integrationRatio: 0 }));
    assert.ok(off.every((plan) => !plan.required));
    const half = Array.from({ length: 200 }, (_, index) => planCortifreeIntegration({ seed: `h${index}`, formatId: "F01_LIFESTYLE_GUIDE", integrationRatio: 0.5 }));
    const share = half.filter((plan) => plan.required).length / half.length;
    assert.ok(share > 0.35 && share < 0.65, String(share));
  });
});

type Slide = CarouselSpec["slides"][number];
function spec(slides: Array<[string, string]>, caption: string, hook = slides[0]![0]): CarouselSpec {
  return carouselSpecSchema.parse({
    title: hook, topic: "night wind down", angle: "what she does when her brain will not switch off", hook, language: "en", caption, ctaType: "save",
    slides: slides.map(([headline, body], index): Slide => ({
      position: index + 1, role: index === 0 ? "HOOK" : index === slides.length - 1 ? "TAKEAWAY" : "TIP", layout: "single-image",
      headline, body, visualIntent: "cozy bedroom at night with a lamp", assetType: "stock", assetQuery: `bedroom night lamp ${index + 1}`,
    })),
  });
}
const withMention = () => spec([
  ["my brain won't switch off at night so i do this", ""],
  ["phone on the desk at 10", "i leave it charging across the room"],
  ["lamp instead of the big light", "the room feels like bedtime"],
  ["5 min of slow breathing", "i put on the slow breathing session in cortifree with the lights off"],
  ["same playlist every night", "i know what comes next"],
  ["book until i yawn", "paper only, no kindle"],
  ["that's it, nothing fancy", "pick one and try it tonight"],
], "my boring night routine that actually works for me. the breathing one i use is in cortifree");

describe("CortiFree mention checks", () => {
  const plan = { required: true };

  it("accepts one native body mention plus the caption", () => {
    assert.deepEqual(cortifreeIntegrationIssues(withMention(), plan, "F01_LIFESTYLE_GUIDE"), []);
    assert.deepEqual(cortifreeIntegrationIssues(withMention(), { required: false }), []);
  });

  it("flags a missing, repeated, cover or ad-like mention", () => {
    const missing = withMention();
    missing.slides[3]!.body = "i breathe slowly with the lights off";
    missing.caption = "my boring night routine";
    const issues = cortifreeIntegrationIssues(missing, plan);
    assert.ok(issues.some((issue) => /no body slide/.test(issue)));
    assert.ok(issues.some((issue) => /caption/.test(issue)));

    const twice = withMention();
    twice.slides[5]!.body = "then cortifree again for the sleep sounds";
    assert.ok(cortifreeIntegrationIssues(twice, plan).some((issue) => /2 slides/.test(issue)));

    const cover = withMention();
    cover.hook = "how cortifree saved my nights";
    assert.ok(cortifreeIntegrationIssues(cover, plan).some((issue) => /hook\/cover/.test(issue)));

    const ad = withMention();
    ad.caption = "download cortifree, link in bio";
    assert.ok(cortifreeIntegrationIssues(ad, plan).some((issue) => /sounds like an ad/.test(issue)));
  });

  it("keeps the F07 CortiFree item in the better half of a worst-to-best ranking", () => {
    const ranking = withMention();
    ranking.slides[3]!.headline = "C · box breathing in cortifree";
    ranking.slides[3]!.body = "fine but i forget to open it";
    assert.ok(cortifreeIntegrationIssues(ranking, plan, "F07_RANKING").some((issue) => /low tier/.test(issue)));
    ranking.slides[3]!.headline = "A · box breathing in cortifree";
    assert.deepEqual(cortifreeIntegrationIssues(ranking, plan, "F07_RANKING"), []);
  });

  it("blocks a health outcome next to the app name, never the plain topic", () => {
    assert.equal(cortifreeClaimReason("cortifree lowered my cortisol in a week"), "cortifree mention tied to a health outcome");
    assert.ok(cortifreeClaimReason("cortifree fixed my sleep"));
    assert.ok(cortifreeClaimReason("cortifree fixes my sleep"));
    assert.ok(cortifreeClaimReason("the app that treats anxiety: cortifree"));
    assert.equal(cortifreeClaimReason("i do the 4-7-8 one in cortifree before bed"), null);

    const unsafe = withMention();
    unsafe.slides[3]!.body = "cortifree lowers my cortisol before bed";
    assert.ok(validateCarouselSpec(unsafe, { slideCount: 7, language: "en", layout: "single-image" }).some((issue) => issue.code === "HEALTH_CLAIM"));
    const safe = withMention();
    safe.topic = "cortisol and stress at night";
    safe.slides[3]!.headline = "cortisol talk aside, this is my wind down";
    assert.ok(!validateCarouselSpec(safe, { slideCount: 7, language: "en", layout: "single-image" }).some((issue) => issue.code === "HEALTH_CLAIM"));
  });

  it("never drops the CortiFree item when it tidies an F05 Note", () => {
    const tidy = tidyChecklistBody([
      "phone on the desk at 10",
      "5 min of slow breathing in cortifree with the lamp on and the door shut (yes really)",
      "lamp instead of the big light",
      "same playlist every night",
      "book until i yawn",
      "tea before 9",
      "socks on",
    ].join(" | "));
    const items = tidy.split(" | ");
    assert.ok(items.length <= 6);
    assert.ok(items.some((item) => /cortifree/.test(item)));
  });

  it("tells the writer where the mention goes, what is real and what is banned", () => {
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /CORTIFREE INTEGRATION/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /editorialContext\.brand_integration\.placement/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /guided breathing sessions/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /Never invent another feature/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /Never on the hook\/cover/);
  });
});

describe("CortiFree in generation", () => {
  const input: CarouselGeneratorInput = {
    carouselType: "F01_LIFESTYLE_GUIDE", layout: "single-image", persona: "P01", language: "en", market: "US",
    references: [], recentCarousels: [], requestedSlideCount: 7, ctaMode: "save", formatId: "F01_LIFESTYLE_GUIDE",
    editorialContext: {
      search_query: "night", primary_keyword: "night", secondary_keywords: [], language_profile: "GENZ_GIRLY_US",
      language_version: "v1", trend_terms: [], persona_voice: "", golden_example_ids: [], topic_id: "T_1", hook_id: "DYNAMIC",
      format_id: "F01_LIFESTYLE_GUIDE", account_id: "CF_EN_01", persona_id: "P01",
      brand_integration: planCortifreeIntegration({ seed: "gen", formatId: "F01_LIFESTYLE_GUIDE" }),
    },
  };
  const deps = (drafts: CarouselSpec[], seen: string[]) => ({
    monthlyUsage: async () => ({ costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
    structuredRequest: async (options: { instructions: string }) => {
      seen.push(options.instructions);
      return { data: drafts[Math.min(seen.length - 1, drafts.length - 1)]!, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } };
    },
  });
  const enableAI = () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
  };
  const without = () => {
    const draft = withMention();
    draft.slides[3]!.body = "i breathe slowly with the lights off";
    draft.caption = "my boring night routine that actually works for me";
    return draft;
  };

  it("asks for a CortiFree rewrite when the planned mention is missing", async () => {
    enableAI();
    const seen: string[] = [];
    const result = await generateCarousel(input, deps([without(), withMention()], seen));
    assert.ok(seen.length >= 2);
    assert.match(seen.at(-1)!, /CORTIFREE REPAIR/);
    assert.match(seen.at(-1)!, /never the last slide/, "the repair repeats the format placement");
    assert.ok(result.spec.slides.some((slide) => /cortifree/.test(slide.body)));
    assert.equal(result.warning, null);
  });

  it("keeps the draft but flags it for review when every rewrite still misses CortiFree", async () => {
    enableAI();
    const seen: string[] = [];
    const result = await generateCarousel(input, deps([without()], seen));
    assert.equal(result.source, "openai");
    assert.match(result.warning ?? "", /CORTIFREE_INTEGRATION/);
  });

  it("does not ask for CortiFree when the plan is off", async () => {
    enableAI();
    const seen: string[] = [];
    const off = { ...input, editorialContext: { ...input.editorialContext!, brand_integration: { required: false, mention: "", screenshot_required: false } } };
    const result = await generateCarousel(off, deps([without()], seen));
    assert.ok(seen.every((instructions) => !/CORTIFREE REPAIR/.test(instructions)));
    assert.equal(result.warning, null);
  });
});
