import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canonicalLayoutFor } from "../app/lib/canonical-layout.js";
import { getSlideGeometry } from "../app/lib/layout-geometry.js";
import { getHookGenerationPlan } from "../app/lib/hook-selector.js";

describe("canonical carousel formats", () => {
  it("maps every F01-F08 format to its production renderer", () => {
    assert.equal(canonicalLayoutFor("F01_LIFESTYLE_GUIDE"), "lifestyle-3stack");
    assert.equal(canonicalLayoutFor("F02_EDITORIAL_COLLAGE"), "editorial-asym-hero");
    assert.equal(canonicalLayoutFor("F03_ROUTINE_TIMELINE"), "routine-timeline");
    assert.equal(canonicalLayoutFor("F04_AESTHETIC_EDUCATIONAL"), "three-rect-educational");
    assert.equal(canonicalLayoutFor("F05_INTERACTIVE_CHECKLIST"), "interactive-checklist");
    assert.equal(canonicalLayoutFor("F06_PERSONA_EXPLAINER"), "persona-explainer");
    assert.equal(canonicalLayoutFor("F07_RANKING"), "ranking");
    assert.equal(canonicalLayoutFor("F08_2X2"), "grid-2x2");
  });

  it("gives F06 its own persona explainer geometry instead of single-image fallback", () => {
    const geometry = getSlideGeometry(
      { layout: "persona-explainer", position: 2, role: "TIP", headline: "What I noticed", body: "Less rushing | Better evenings" },
      false,
      false,
      {},
    );
    assert.equal(geometry.image.mode, "persona-explainer");
    assert.equal(geometry.chrome.personaExplainer, true);
    assert.equal(geometry.text.headlineY, 705);
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

  it("keeps login and both Telegram webhook URLs outside session middleware", () => {
    const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
    assert.match(middleware, /"\/login"/);
    assert.match(middleware, /"\/api\/auth\/login"/);
    assert.match(middleware, /"\/api\/telegram\/webhook"/);
    assert.match(middleware, /"\/api\/integrations\/telegram\/webhook"/);
  });
});
