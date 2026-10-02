import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    assert.equal(body.text.routineTimeSize, 28);
    assert.equal(body.text.headlineSize, 30);
    assert.equal(body.text.bodySize, 20);
    assert.equal(body.text.maxBodyLines, 2);
  });

  it("keeps F03 asset selection unique across routine steps until the pool is exhausted", () => {
    const renderer = readFileSync(new URL("../app/lib/render-carousel.ts", import.meta.url), "utf8");
    const routineBlock = renderer.match(/if \(input\.layout === "routine-timeline"\)[\s\S]*?\n\s*}\n\s*if \(input\.layout !== "grid-2x2"/)?.[0] ?? "";
    assert.match(routineBlock, /usedRoutineAssets/);
    assert.match(routineBlock, /excludedAssetIds: new Set\(\[\.\.\.recentHookAssetIds, \.\.\.usedRoutineAssets\]\)/);
    assert.doesNotMatch(routineBlock, /excludedAssetIds:\s*recentHookAssetIds/);
  });

  it("splits F08 visual intent into two per-slide sources before diagonal repetition", () => {
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

  it("keeps F05 Notes backgrounds contextual without depending on ModelArk repair", () => {
    const renderer = readFileSync(new URL("../app/lib/render-carousel.ts", import.meta.url), "utf8");
    assert.match(renderer, /function checklistBackgroundFallbackSlide/);
    assert.match(renderer, /slides: \[checklistBackgroundFallbackSlide\(slide\)\]/);
    assert.match(renderer, /input\.layout !== "interactive-checklist"/);
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
    assert.equal(body.text.headlineSize, 38);
    assert.equal(body.text.bodySize, 23);
    assert.equal(body.text.maxBodyLines, 6);
    assert.equal(body.text.checklistPanelWidth, 778);
    assert.equal(body.text.checklistPanelHeight, 940);
  });

  it("uses images only on the F07 cover and keeps ranking body/final slides truly text-only", () => {
    assert.equal(rankingAssetCountForSlide({ position: 1, role: "HOOK" }), 2);
    assert.equal(rankingAssetCountForSlide({ position: 2, role: "TIP" }), 0);
    assert.equal(rankingAssetCountForSlide({ position: 7, role: "TAKEAWAY" }), 0);
  });

  it("falls back to a text-first F07 cover instead of generating decorative imagery", () => {
    const renderer = readFileSync(new URL("../app/lib/render-carousel.ts", import.meta.url), "utf8");
    assert.match(renderer, /if \(input\.layout === "ranking"\) return undefined/);
    assert.match(renderer, /Ranking cover photos are optional/);
    assert.match(renderer, /F07 can always fall back[\s\S]*slideMatches = \[\]/);
  });

  it("keeps the F05 atmospheric-background fallback below the general asset floor", () => {
    const selector = readFileSync(new URL("../app/lib/asset-selector.ts", import.meta.url), "utf8");
    assert.match(selector, /F05_BACKGROUND_FALLBACK_THRESHOLD = 10/);
    assert.match(selector, /Hard scene\/object\/person constraints still apply/);
  });

  it("keeps F07 tier slides compact, bold and horizontally composed", () => {
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
    assert.equal(body.text.rankingScoreSize, 68);
    assert.equal(body.text.headlineSize, 42);
    assert.equal(body.text.bodySize, 28);
    assert.equal(body.text.width, 930);
  });

  it("supports targeted acceptance batches without falling through to unrelated formats", () => {
    const scheduler = readFileSync(new URL("../src/autonomy/scheduler.ts", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../src/worker/heavy-worker.ts", import.meta.url), "utf8");
    assert.match(scheduler, /formatIds\?: string\[\]/);
    assert.match(scheduler, /strictRequestedFormats \? 1 : formatCycle\.length/);
    assert.match(worker, /payload\.format_ids/);
    assert.match(worker, /formatIds: requestedFormatIds/);
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

  it("does not persist editorial concept IDs as carousel formats from the Studio", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.match(page, /carouselType:\s*currentModel\.id/);
    assert.match(page, /layout:\s*currentModel\.layout/);
    assert.doesNotMatch(page, /carouselType:\s*currentType\.id/);
  });

  it("keeps carousel status aligned with lifecycle after successful renders", () => {
    const processor = readFileSync(new URL("../src/autonomy/processor.ts", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../src/worker/heavy-worker.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../app/api/carousels/[id]/render/route.ts", import.meta.url), "utf8");
    assert.match(processor, /status: 'READY_FOR_REVIEW', lifecycle_state: 'READY_FOR_REVIEW'/);
    assert.match(worker, /status: "READY_FOR_REVIEW",[\s\S]*lifecycle_state: "READY_FOR_REVIEW"/);
    assert.match(worker, /carousel_ideas[\s\S]*render_status: "READY_FOR_REVIEW"/);
    assert.match(route, /status: "READY_FOR_REVIEW", lifecycle_state: "READY_FOR_REVIEW"/);
    assert.match(route, /carousel_ideas[\s\S]*render_status: "READY_FOR_REVIEW"/);
  });

  it("keeps the draft worker path isolated from publishing", () => {
    const queue = readFileSync(new URL("../app/lib/worker-queue.ts", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../src/worker/heavy-worker.ts", import.meta.url), "utf8");
    assert.match(queue, /"DRAFT_PIPELINE"/);
    assert.match(worker, /job\.kind === "DRAFT_PIPELINE"/);
    const draftPipeline = worker.match(/async function runDraftPipeline[\s\S]*?\n}\n\nasync function runAcceptanceSample/)?.[0] ?? "";
    assert.match(draftPipeline, /processQueuedIdeas/);
    assert.match(draftPipeline, /retryPendingRenders/);
    assert.doesNotMatch(draftPipeline, /autoScheduleApproved|runScheduler|refreshPublishStatuses/);
  });

  it("scopes generation and draft rerenders to the CortiFree workspace", () => {
    const processor = readFileSync(new URL("../src/autonomy/processor.ts", import.meta.url), "utf8");
    assert.match(processor, /carousel_ideas\?workspace_id=eq\.cortifree&status=eq\.QUEUED/);
    assert.match(processor, /carousels\?workspace_id=eq\.cortifree&status=eq\.DRAFT/);
  });

  it("keeps worker heartbeats alive during long-running jobs", () => {
    const worker = readFileSync(new URL("../src/worker/heavy-worker.ts", import.meta.url), "utf8");
    assert.match(worker, /function startHeartbeatLoop\(\)/);
    assert.match(worker, /setInterval\(\(\) =>/);
    assert.match(worker, /HEARTBEAT FAILED/);
    assert.match(worker, /startHeartbeatLoop\(\);/);
    assert.doesNotMatch(worker, /let lastHeartbeat = Date\.now\(\)/);
  });

  it("keeps login and both Telegram webhook URLs outside session middleware", () => {
    const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
    assert.match(middleware, /"\/login"/);
    assert.match(middleware, /"\/api\/auth\/login"/);
    assert.match(middleware, /"\/api\/telegram\/webhook"/);
    assert.match(middleware, /"\/api\/integrations\/telegram\/webhook"/);
  });
});
