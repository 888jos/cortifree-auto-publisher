import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plainLanguageEdit } from "../app/lib/ai/plain-language.js";

const spec = {
  title: "t", topic: "t", angle: "a", hook: "my morning reset", caption: "save this #wellnesstok",
  slides: [
    { position: 1, role: "HOOK", layout: "ranking", headline: "my morning reset", body: "", visualIntent: "v", assetType: "stock", assetQuery: "q" },
    { position: 2, role: "TIP", layout: "ranking", headline: "S · three priorities max", body: "everything else waits until my brain is actually online", visualIntent: "v", assetType: "text_only", assetQuery: "q" },
  ],
} as never;
const usage = { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 };
const reply = (lines: string[]) => async () => ({ data: { lines }, usage });

describe("plain-language pass", () => {
  it("applies a rewrite that keeps the structure", async () => {
    const result = await plainLanguageEdit(spec, reply(["my morning reset", "save this #wellnesstok", "my morning reset", "", "S · three priorities max", "everything else waits until after my coffee"]), "m");
    assert.equal((result.spec as { slides: Array<{ body: string }> } | null)?.slides[1]!.body, "everything else waits until after my coffee");
  });

  it("keeps slide 1 in step when only the hook line is rewritten", async () => {
    const result = await plainLanguageEdit(spec, reply(["things i do before noon", "save this #wellnesstok", "my morning reset", "", "S · three priorities max", "everything else waits until my brain is actually online"]), "m");
    assert.equal((result.spec as { slides: Array<{ headline: string }> } | null)?.slides[0]!.headline, "things i do before noon");
  });

  it("rejects a rewrite that drops a tier prefix or changes the line count", async () => {
    assert.equal((await plainLanguageEdit(spec, reply(["my morning reset", "save this #wellnesstok", "my morning reset", "", "three priorities max", "x"]), "m")).spec, null);
    assert.equal((await plainLanguageEdit(spec, reply(["one line"]), "m")).spec, null);
  });
});

describe("style rewrites never lose a valid draft", async () => {
  const { generateCarousel } = await import("../app/lib/ai/carousel-generator.js");
  it("returns the first valid draft when later style rewrites fail validation", async () => {
    const previous = { ...process.env };
    process.env.OPENAI_API_KEY = "test";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    process.env.OPENAI_MODEL_PRIMARY = "gpt-5.6-luna";
    const long = "i do this thing every single morning before i open my phone because it makes the whole start of the day feel slower and calmer for me";
    const valid = {
      title: "my morning reset", topic: "mornings", angle: "calm start", hook: "my morning reset", language: "en", ctaType: "save", caption: "save this",
      slides: [1, 2, 3, 4, 5, 6].map((position) => ({
        position, role: position === 1 ? "HOOK" : position === 6 ? "TAKEAWAY" : "STEP", layout: "grid-2x2",
        headline: position === 1 ? "my morning reset" : `step ${position}: open the curtains`, body: position === 1 ? "" : `${long} ${position}`,
        visualIntent: "woman opening curtains", assetType: "stock", assetQuery: "woman opening curtains morning",
      })),
    };
    let calls = 0;
    try {
      const result = await generateCarousel(
        { carouselType: "F08_2X2", layout: "grid-2x2", language: "en", market: "US", references: [], recentCarousels: [], requestedSlideCount: 6, ctaMode: "save", requireCanonicalContext: false } as never,
        {
          monthlyUsage: async () => ({ costUsd: 0 }) as never,
          // First draft is valid but too long (style rewrite); every later draft is broken.
          structuredRequest: async () => { calls += 1; return { data: (calls === 1 ? valid : { ...valid, slides: valid.slides.slice(0, 2) }) as never, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 } }; },
        },
      );
      assert.equal(result.source, "openai", String(result.warning));
      assert.equal(result.spec.slides.length, 6);
      assert.equal(calls, 4);
    } finally {
      process.env = previous;
    }
  });
});
