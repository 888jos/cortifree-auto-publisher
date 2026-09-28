import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalLayoutFor } from "../app/lib/canonical-layout.js";
import { FORMAT_CONTRACTS, formatContractFor } from "../app/lib/format-contracts.js";
import { CAROUSEL_GENERATOR_INSTRUCTIONS } from "../app/lib/ai/prompts.js";
import { carouselSpecSchema } from "../app/lib/ai/schemas.js";
import { validateCarouselSpec } from "../app/lib/ai/validation.js";
import { appScreenBlockReason } from "../src/autonomy/preflight.js";
import { selectEditorial } from "../src/autonomy/selection.js";

describe("Editorial P0 architecture", () => {
  it("never interpolates legacy hook formulas into publishable copy", () => {
    const selected = selectEditorial({
      seed: "test",
      accountId: "CF_EN_01",
      personaId: "P01",
      pillarIds: ["PILLAR_STRESS"],
      formatIds: ["F01_LIFESTYLE_GUIDE"],
      topics: [{
        topic_id: "TOPIC_1",
        pillar_id: "PILLAR_STRESS",
        topic: "stressful mornings",
        angle: "Planning intent only",
        eligible_formats: "F01_LIFESTYLE_GUIDE",
        eligible_personas: "P01",
        active: true,
      }],
      hooks: [
        {
          hook_id: "HOOK_LEGACY",
          hook_family: "confession",
          formula: "What I would do for {goal}",
          compatible_formats: "F01_LIFESTYLE_GUIDE",
          compatible_pillars: "PILLAR_STRESS",
          persona_fit: "P01",
          runtime_use: "CONCEPT_ONLY",
          active: true,
        },
        {
          hook_id: "REF_01_01",
          hook_family: "style_reference",
          formula: "little things i've been doing lately to feel more put together...",
          compatible_formats: "F01_LIFESTYLE_GUIDE",
          compatible_pillars: "all",
          persona_fit: "ALL",
          runtime_use: "STYLE_REFERENCE",
          human_status: "REFERENCE_SEED",
          active: true,
        },
      ],
      ctas: [{
        cta_id: "CTA_1",
        cta_family: "save",
        text: "save this",
        compatible_formats: "all",
        active: true,
      }],
      history: [],
    });

    assert.equal(selected.finalHook, "");
    assert.equal(selected.hookFamily, "confession");
    assert.equal(selected.hookReferences.length, 1);
    assert.equal(selected.hookReferences[0]?.id, "REF_01_01");
    assert.doesNotMatch(selected.finalHook, /\{goal\}|What I would do/);
  });

  it("keeps renderer layout and technical contract in one registry", () => {
    assert.equal(canonicalLayoutFor("F01_LIFESTYLE_GUIDE"), FORMAT_CONTRACTS.F01_LIFESTYLE_GUIDE.layout);
    assert.equal(formatContractFor("F05_INTERACTIVE_CHECKLIST").checklistItems, 5);
    assert.equal(formatContractFor("F08_2X2").forceContrast, false);
  });

  it("does not require app screens for editorial-only content", () => {
    assert.equal(appScreenBlockReason(false, 0), null);
    assert.equal(appScreenBlockReason(true, 0), "APP_SCREEN:0/1");
    assert.equal(appScreenBlockReason(true, 1), null);
  });

  it("accepts a natural F01 hook longer than seven words within contract", () => {
    const hook = "little things i've been doing lately to feel more put together";
    const spec = carouselSpecSchema.parse({
      title: "Lifestyle guide",
      topic: "realistic routine",
      angle: "specific habits",
      hook,
      language: "en",
      caption: "A few things that actually fit a normal week.",
      ctaType: "none",
      slides: [
        {
          position: 1,
          role: "HOOK",
          layout: "lifestyle-3stack",
          headline: hook,
          body: "",
          visualIntent: "One candid lifestyle image",
          assetType: "stock",
          assetQuery: "candid morning routine",
        },
        {
          position: 2,
          role: "TAKEAWAY",
          layout: "lifestyle-3stack",
          headline: "eat before coffee",
          body: "Greek yogurt + berries works for me on rushed mornings.",
          visualIntent: "Exactly three views of the same behavior: top person action, middle breakfast scene, bottom detail.",
          assetType: "stock",
          assetQuery: "breakfast yogurt berries",
        },
      ],
    });
    const issues = validateCarouselSpec(spec, { slideCount: 2, language: "en", layout: "lifestyle-3stack" });
    assert.equal(issues.some((issue) => issue.code === "LIFESTYLE_COVER_LENGTH"), false);
  });

  it("rejects F05 bodies that do not contain exactly five items", () => {
    const spec = carouselSpecSchema.parse({
      title: "Checklist",
      topic: "easy breakfast",
      angle: "saveable list",
      hook: "my lazy girl breakfast checklist",
      language: "en",
      caption: "keep this handy",
      ctaType: "none",
      slides: [
        {
          position: 1,
          role: "HOOK",
          layout: "interactive-checklist",
          headline: "my lazy girl breakfast checklist",
          body: "",
          visualIntent: "Candid kitchen photo",
          assetType: "stock",
          assetQuery: "breakfast kitchen",
        },
        {
          position: 2,
          role: "TAKEAWAY",
          layout: "interactive-checklist",
          headline: "Protein",
          body: "eggs | yogurt | tofu | salmon | chicken | lentils",
          visualIntent: "Reuse the same background photo",
          assetType: "stock",
          assetQuery: "same background",
        },
      ],
    });
    const issues = validateCarouselSpec(spec, { slideCount: 2, language: "en", layout: "interactive-checklist" });
    assert.ok(issues.some((issue) => issue.code === "CHECKLIST_OPTIONS"));
  });

  it("does not globally force CortiFree integration in the writer prompt", () => {
    assert.doesNotMatch(CAROUSEL_GENERATOR_INSTRUCTIONS, /Mention the app CortiFree naturally at least once/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /Editorial-only content may contain zero brand mentions/);
  });
});
