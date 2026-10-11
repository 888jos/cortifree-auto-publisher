import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiPhraseReason, aiPhrasingIssues, isSlogan } from "../app/lib/ai/ai-phrasing.js";
import { sanitizeGeneratedCarouselSpec } from "../app/lib/ai/carousel-generator.js";

const edu = (position: number, headline: string, body: string) => ({
  position, role: position === 1 ? "HOOK" : "TIP", layout: "three-rect-educational", headline, body,
  visualIntent: "top-left proof example; bottom-left support tool; bottom-right support result", assetType: "stock", assetQuery: "q",
});
// Live F04 copy the operator rejected (batch E2E_SIX_20261010F).
const rejected = {
  title: "t", topic: "t", angle: "a", hook: "focus boundaries i use without going fully offline", caption: "c", language: "en", ctaType: "save",
  slides: [
    edu(1, "focus boundaries i use without going fully offline", "phone nearby. attention protected"),
    edu(2, "silence alerts that can wait", "HOW TO | keep calls from close people on | mute group-chat banners | let non-urgent alerts wait"),
    edu(3, "give your phone one clear place", "HOW TO | put it in your bag for one task | keep the bag beside your chair | take it out at your stopping point"),
    edu(4, "choose your next message check", "HOW TO | pick a time after this task | write it in your planner | reply when you can focus on it"),
    edu(5, "make urgent contact obvious", "WHAT TO USE | keep calls from key people on | tell them your usual reply window"),
  ],
} as never;

describe("AI phrasing (F04)", () => {
  it("flags the slogans, jargon and dry commands the operator rejected", () => {
    const issues = aiPhrasingIssues(rejected).join("\n");
    for (const line of [
      "focus boundaries i use", "phone nearby. attention protected", "silence alerts that can wait", "give your phone one clear place",
      "choose your next message check", "make urgent contact obvious", "let non-urgent alerts wait", "your stopping point", "your usual reply window",
    ]) assert.match(issues, new RegExp(line.replace(/[.]/g, "\\.")), line);
  });

  it("accepts the operator's own rewrites and native lines", () => {
    for (const line of [
      "i prefer to silence alerts that can wait", "put your phone in another room when you work", "i only answer texts on my lunch break",
      "how i get work done without deleting tiktok", "do not disturb on, my mom still gets through", "lowkey obsessed", "first two days were rough ngl",
    ]) assert.equal(aiPhraseReason(line, { headline: true }), undefined, line);
  });

  it("recognizes noun slogans without catching sentences", () => {
    assert.ok(isSlogan("attention protected"));
    assert.ok(isSlogan("phone nearby"));
    assert.equal(isSlogan("phone charges in the kitchen"), false);
    assert.equal(isSlogan("i'm obsessed"), false);
  });

  it("replaces a slogan cover line with the renderer's accent", () => {
    assert.equal(sanitizeGeneratedCarouselSpec(rejected).slides[0]!.body, "");
    const aside = structuredClone(rejected) as { slides: Array<{ body: string }> };
    aside.slides[0]!.body = "still reachable for my mom lol";
    assert.equal(sanitizeGeneratedCarouselSpec(aside as never).slides[0]!.body, "still reachable for my mom lol");
  });
});

describe("AI phrasing rewrite never blocks generation", async () => {
  const { generateCarousel } = await import("../app/lib/ai/carousel-generator.js");
  it("asks for a rewrite, then keeps a draft that still has flagged lines", async () => {
    const previous = { ...process.env };
    process.env.OPENAI_API_KEY = "test";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
    process.env.OPENAI_MODEL_PRIMARY = "gpt-5.6-luna";
    const draft = structuredClone(rejected) as { hook: string; slides: Array<{ headline: string; body: string }> };
    draft.hook = "i can't focus with my phone in the room";
    draft.slides[0]!.headline = draft.hook;
    draft.slides[0]!.body = "✦ · ✧";
    const instructions: string[] = [];
    try {
      const result = await generateCarousel(
        { carouselType: "F04_AESTHETIC_EDUCATIONAL", layout: "three-rect-educational", language: "en", market: "US", references: [], recentCarousels: [], requestedSlideCount: 5, ctaMode: "save", requireCanonicalContext: false } as never,
        {
          monthlyUsage: async () => ({ costUsd: 0 }) as never,
          structuredRequest: async (options) => { instructions.push(options.instructions); return { data: draft as never, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 } }; },
        },
      );
      assert.equal(result.source, "openai", String(result.warning));
      assert.match(instructions[1] ?? "", /AI PHRASING REPAIR/);
      assert.match(instructions[1] ?? "", /choose your next message check/);
      assert.equal(instructions.length, 3);
    } finally {
      process.env = previous;
    }
  });
});
