import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeGeneratedCarouselSpec } from "../app/lib/ai/carousel-generator.js";
import { isRankingAscending, rankingTier, sortRankingSlides } from "../app/lib/ai/ranking-order.js";
import { validateCarouselSpec } from "../app/lib/ai/validation.js";
import { contrastRatio, rankingPalette, readableTextColor } from "../app/lib/render/ranking-palette.js";
import { rankingAssetCountForSlide } from "../app/lib/render/assets.js";

const slide = (position: number, role: string, headline: string) => ({
  position, role, layout: "ranking", headline, body: `reason for ${headline}`,
  visualIntent: `photo of ${headline}`, assetQuery: `photo of ${headline}`, assetType: "stock" as const,
});

// The live order of CF_AUTO_CF_E2E_IDEA_E2E_SIX_20261010F_05_P05_F07: S first.
const live = [
  slide(1, "HOOK", "my stress fixes, ranked"),
  slide(2, "TIP", "S · phone out of the bedroom"),
  slide(3, "TIP", "A · ten minute walk"),
  slide(4, "TIP", "A · water before coffee"),
  slide(5, "TIP", "B · stretching at my desk"),
  slide(6, "TIP", "C · scrolling to relax"),
  slide(7, "TAKEAWAY", "start with the top one"),
];

describe("F07 tier order", () => {
  it("reads tiers in every headline shape", () => {
    assert.equal(rankingTier("S · phone out of the bedroom"), "S");
    assert.equal(rankingTier("SS · sleep"), "SS");
    assert.equal(rankingTier("Tier: C late caffeine"), "C");
    assert.equal(rankingTier("B TIER · walks"), "B");
    assert.equal(rankingTier("my stress fixes, ranked"), null);
  });

  it("climbs from the worst tier on slide 2 to the best at the end", () => {
    const sorted = sortRankingSlides(live);
    assert.deepEqual(sorted.map((item) => item.headline), [
      "my stress fixes, ranked",
      "C · scrolling to relax",
      "B · stretching at my desk",
      "A · ten minute walk",
      "A · water before coffee",
      "S · phone out of the bedroom",
      "start with the top one",
    ]);
    assert.deepEqual(sorted.map((item) => item.position), [1, 2, 3, 4, 5, 6, 7]);
    // The photo brief moves with its tier.
    assert.equal(sorted[1]!.assetQuery, "photo of C · scrolling to relax");
    assert.equal(sorted[1]!.role, "TIP");
    assert.equal(isRankingAscending(live), false);
    assert.equal(isRankingAscending(sorted), true);
  });

  it("sorts F to SS, keeps equal tiers in order and leaves a tierless slide in its slot", () => {
    const sorted = sortRankingSlides([
      slide(1, "HOOK", "cover"),
      slide(2, "TIP", "SS · a"),
      slide(3, "TIP", "F · b"),
      slide(4, "TIP", "no tier here"),
      slide(5, "TIP", "D · c"),
      slide(6, "TIP", "A+ · d"),
      slide(7, "TIP", "A · e"),
    ]);
    assert.deepEqual(sorted.map((item) => item.headline), ["cover", "F · b", "D · c", "no tier here", "A · e", "A+ · d", "SS · a"]);
  });

  it("is applied to every generated F07 spec, and validation flags a wrong order", () => {
    const spec = {
      title: "t", topic: "stress", angle: "a", hook: "my stress fixes, ranked", caption: "c #stress",
      slides: live,
    } as never;
    const clean = sanitizeGeneratedCarouselSpec(spec);
    assert.equal(rankingTier(clean.slides[1]!.headline), "C");
    assert.equal(rankingTier(clean.slides[5]!.headline), "S");
    const expected = { slideCount: 7, language: "en" as const, layout: "ranking" };
    assert.ok(validateCarouselSpec({ ...(spec as object), slides: live } as never, expected).some((issue) => issue.code === "RANKING_ORDER"));
    assert.ok(!validateCarouselSpec(clean, expected).some((issue) => issue.code === "RANKING_ORDER"));
  });
});

describe("F07 colors and photos", () => {
  it("paints each tier in a strong color with readable text", () => {
    const backgrounds = new Set<string>();
    for (const tier of ["F", "D", "C", "B", "A", "S", "SS"]) {
      const palette = rankingPalette({ tier });
      backgrounds.add(palette.background);
      assert.ok(contrastRatio(palette.text, palette.background) >= 4.5, `${tier} text contrast`);
      assert.ok(contrastRatio(palette.accentText, palette.accent) >= 4.5, `${tier} badge contrast`);
      // Not a near-white wash any more.
      assert.ok(contrastRatio("#ffffff", palette.background) > 1.4, `${tier} is colored`);
    }
    assert.equal(backgrounds.size, 7);
    assert.equal(readableTextColor("#6e56cf"), "#ffffff");
    assert.equal(readableTextColor("#ffc53d"), "#1d1a1c");
  });

  it("asks for up to two photos on every slide", () => {
    assert.equal(rankingAssetCountForSlide({ position: 1, role: "HOOK" }), 2);
    assert.equal(rankingAssetCountForSlide({ position: 3, role: "TIP" }), 2);
    assert.equal(rankingAssetCountForSlide({ position: 7, role: "TAKEAWAY" }), 2);
  });
});
