import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeGeneratedCarouselSpec, tidyChecklistBody } from "../app/lib/ai/carousel-generator";
import { validateCarouselSpec } from "../app/lib/ai/validation";

describe("tidyChecklistBody", () => {
  it("drops an overlong aside before dropping the item", () => {
    const body = "charge it across the room | check one thing | leave the app when done | keep the charger in the same spot | pick up the book instead of the phone at night (it is honestly so much less tempting)";
    assert.equal(tidyChecklistBody(body).split(" | ").at(-1), "pick up the book instead of the phone at night");
  });
  it("drops overlong items only while four remain, and keeps six at most", () => {
    const long = "x".repeat(90);
    assert.equal(tidyChecklistBody(`a | b | c | d | ${long}`), "a | b | c | d");
    assert.equal(tidyChecklistBody(`a | b | c | ${long}`).split(" | ").length, 4);
    assert.equal(tidyChecklistBody("a | b | c | d | e | f | g"), "a | b | c | d | e | f");
  });
  it("drops save/follow lines from a Note while four items remain", () => {
    assert.equal(tidyChecklistBody("a | b | c | d | save this for tonight"), "a | b | c | d");
    assert.equal(tidyChecklistBody("a | b | c | save this for tonight"), "a | b | c | save this for tonight");
  });
});

describe("F05 final Note", () => {
  it("relabels a last Notes slide marked CTA instead of blocking the carousel", () => {
    const note = (position: number, role: string) => ({
      position, role, layout: "interactive-checklist", headline: `make the last ten minutes simple ${position}`,
      body: "wash my face before bed | change into pajamas | read a few pages | keep the lights soft",
      assetQuery: "bedroom at night", visualIntent: "bedroom at night", assetType: "persona",
    });
    const spec = {
      title: "bedtime checklist", topic: "sleep", angle: "notes", hook: "my bedtime checklist", caption: "my notes #bedtime",
      slides: [{ ...note(1, "HOOK"), body: "" }, note(2, "CHECKLIST"), note(3, "CHECKLIST"), note(4, "CHECKLIST"), note(5, "CTA")],
    } as unknown as Parameters<typeof sanitizeGeneratedCarouselSpec>[0];
    const sanitized = sanitizeGeneratedCarouselSpec(spec);
    assert.equal(sanitized.slides.at(-1)?.role, "TAKEAWAY");
    const issues = validateCarouselSpec(sanitized, { slideCount: 5, language: "en", layout: "interactive-checklist" });
    assert.equal(issues.some((issue) => issue.code === "CHECKLIST_FINAL_NOTE"), false);
  });
});
