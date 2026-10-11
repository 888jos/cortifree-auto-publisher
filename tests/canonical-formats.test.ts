import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalLayoutFor } from "../app/lib/canonical-layout.js";
import { getSlideGeometry } from "../app/lib/layout-geometry.js";
import { educationalAssetSlideForSlot, generationCategory, gridAssetSlideForSlot } from "../app/lib/render-carousel.js";
import { getHookGenerationPlan } from "../app/lib/hook-selector.js";
import { rankingAssetCountForSlide } from "../app/lib/render-carousel.js";
import { ACTIVE_FORMAT_IDS, contentFormats } from "../src/content/formats.js";

describe("canonical carousel formats", () => {
  it("keeps six formats active while preserving legacy render compatibility", () => {
    assert.equal(canonicalLayoutFor("F01_LIFESTYLE_GUIDE"), "lifestyle-3stack");
    assert.equal(canonicalLayoutFor("F03_ROUTINE_TIMELINE"), "routine-timeline");
    assert.equal(canonicalLayoutFor("F04_AESTHETIC_EDUCATIONAL"), "three-rect-educational");
    assert.equal(canonicalLayoutFor("F05_INTERACTIVE_CHECKLIST"), "interactive-checklist");
    assert.equal(canonicalLayoutFor("F07_RANKING"), "ranking");
    assert.equal(canonicalLayoutFor("F08_2X2"), "grid-2x2");
  });

  it("exposes exactly the six active formats", () => {
    assert.deepEqual([...ACTIVE_FORMAT_IDS], ["F01_LIFESTYLE_GUIDE","F03_ROUTINE_TIMELINE","F04_AESTHETIC_EDUCATIONAL","F05_INTERACTIVE_CHECKLIST","F07_RANKING","F08_2X2"]);
    assert.deepEqual(contentFormats.map((format) => format.id), [...ACTIVE_FORMAT_IDS]);
  });

  it("enforces F03 routine hierarchy with small body copy and dominant hook", () => {
    const cover = getSlideGeometry(
      { layout: "routine-timeline", position: 1, role: "HOOK", headline: "morning routine", body: "6:00 - 7:15" },
      true,
      false,
      {},
    );
    const body = getSlideGeometry(
      { layout: "routine-timeline", position: 2, role: "TIP", headline: "6:00 - 6:10 · wake up", body: "" },
      false,
      false,
      {},
    );
    assert.equal(cover.text.hookSize, 76);
    assert.equal(cover.text.headlineWeight, 800);
    // The hook stays dominant; step text is phone-readable and centred.
    assert.equal(body.text.routineTimeSize, 42);
    assert.equal(body.text.headlineSize, 52);
    assert.equal(body.text.bodySize, 34);
    assert.ok(cover.text.hookSize > body.text.headlineSize);
    assert.equal(body.text.x + body.text.width / 2, 540);
    assert.equal(body.text.maxBodyLines, 2);
  });

  it("splits an older two-scene F08 visual intent into per-photo scenes", () => {
    const slide = {
      position: 3,
      role: "TIP",
      layout: "grid-2x2",
      headline: "keep skincare very boring",
      body: "simple routine",
      assetType: "stock",
      assetQuery: "two skincare photos",
      visualIntent: "Exactly two unique photos repeated diagonally: a woman applying moisturizer at a bathroom sink, plus a close-up of simple skincare essentials on the counter.",
    };
    const primary = gridAssetSlideForSlot(slide, 0);
    const secondary = gridAssetSlideForSlot(slide, 1);
    assert.match(primary.visualIntent, /woman applying moisturizer/i);
    assert.doesNotMatch(primary.visualIntent, /essentials on the counter/i);
    assert.match(secondary.visualIntent, /skincare essentials on the counter/i);
    assert.equal(secondary.assetType, "stock");
  });

  it("classifies grooming copy as self-care without matching incidental substrings like 'eat' in 'neatly'", () => {
    const base = { position: 2, role: "TIP", layout: "grid-2x2", body: "", assetType: "persona" };
    assert.equal(generationCategory({
      ...base,
      headline: "choose one hair default",
      assetQuery: "woman making a low bun",
      visualIntent: "close-up of a claw clip and neatly gathered hair",
    }), "self_care");
    assert.equal(generationCategory({
      ...base,
      headline: "eat the easiest breakfast",
      assetQuery: "simple breakfast in a kitchen",
      visualIntent: "woman eating yogurt and fruit",
    }), "food");
  });

  it("splits F04 three-image visual intent into slot-specific asset queries", () => {
    const slide = {
      position: 2,
      role: "MISTAKE",
      layout: "three-rect-educational",
      headline: "make notifications wait",
      body: "HOW TO | turn off noise | check later",
      assetType: "stock",
      assetQuery: "three useful visuals",
      visualIntent: "Three differentiated visuals: top-left proof/example of a phone face down beside a laptop; bottom-left support visual of a hand changing notification settings; bottom-right support visual of a quiet desk with the phone away.",
    };
    const primary = educationalAssetSlideForSlot(slide, 0);
    const supportA = educationalAssetSlideForSlot(slide, 1);
    const supportB = educationalAssetSlideForSlot(slide, 2);
    assert.match(primary.visualIntent, /phone face down beside a laptop/i);
    assert.doesNotMatch(primary.visualIntent, /hand changing notification/i);
    assert.match(supportA.visualIntent, /hand changing notification settings/i);
    assert.equal(supportA.assetType, "stock");
    assert.match(supportB.visualIntent, /quiet desk with the phone away/i);
  });

  it("keeps F05 as a compact Notes-style checklist with readable mobile type", () => {
    const cover = getSlideGeometry(
      { layout: "interactive-checklist", position: 1, role: "HOOK", headline: "i thought this was normal", body: "" },
      true,
      false,
      {},
    );
    const body = getSlideGeometry(
      { layout: "interactive-checklist", position: 2, role: "TIP", headline: "Make mornings feel less rushed", body: "wait before checking messages | do one thing for yourself first | leave enough time to eat | keep the first part simple" },
      false,
      false,
      {},
    );
    assert.equal(cover.text.hookSize, 50);
    assert.equal(body.text.headlineSize, 52);
    assert.equal(body.text.bodySize, 40);
    assert.equal(body.text.maxBodyLines, 6);
    assert.equal(body.text.checklistPanelWidth, 778);
    assert.equal(body.text.checklistPanelHeight, 940);
  });

  it("uses images only on the F07 cover and keeps ranking body/final slides truly text-only", () => {
    assert.equal(rankingAssetCountForSlide({ position: 1, role: "HOOK" }), 2);
    assert.equal(rankingAssetCountForSlide({ position: 2, role: "TIP" }), 0);
    assert.equal(rankingAssetCountForSlide({ position: 7, role: "TAKEAWAY" }), 0);
  });

  it("keeps F07 tier slides bold, readable and horizontally composed", () => {
    const cover = getSlideGeometry(
      { layout: "ranking", position: 1, role: "HOOK", headline: "sleep habits tier list", body: "backed by evidence" },
      true,
      false,
      {},
    );
    const body = getSlideGeometry(
      { layout: "ranking", position: 2, role: "TIP", headline: "S · CONSISTENT SLEEP", body: "Strong practical evidence." },
      false,
      false,
      {},
    );
    assert.equal(cover.text.hookSize, 62);
    assert.equal(cover.text.bodySize, 36);
    // Phone-readable tier slides, block centred in the slide.
    assert.equal(body.text.rankingScoreSize, 96);
    assert.equal(body.text.headlineSize, 58);
    assert.equal(body.text.bodySize, 40);
    assert.ok(body.text.rankingScoreY >= 300);
    assert.equal(body.text.width, 930);
  });

  it("routes hook generation to canonical formats while keeping concepts separate", () => {
    const routine = getHookGenerationPlan({ category: "Morning & night", text: "my realistic night routine" });
    assert.equal(routine.formatId, "F03_ROUTINE_TIMELINE");
    assert.equal(routine.conceptType, "C12_NIGHT_ROUTINE");
    assert.equal(routine.layout, "routine-timeline");

    const checklist = getHookGenerationPlan({ category: "Weekly & seasonal reset", text: "save this reset checklist" });
    assert.equal(checklist.formatId, "F05_INTERACTIVE_CHECKLIST");
    assert.equal(checklist.layout, "interactive-checklist");
  });
});
