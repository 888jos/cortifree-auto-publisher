// F07 tier lists read from the worst tier to the best: slide 2 is the lowest
// tier (F, D or C) and the list climbs to A, S or SS at the end. The model
// kept opening on S, so the order is enforced here after generation.

const TIER_RANK: Record<string, number> = { F: 0, E: 0.5, D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6 };

/** Reads the tier of an F07 headline ("S · item", "A tier: item", "Tier: C item"). */
export function rankingTier(headline: string): string | null {
  const source = String(headline ?? "").trim();
  const prefix = source.match(/^(SS\+?|[SABCDEF][+-]?)(?:\s+tier)?\s*[·•|—–:\-]/i);
  const explicit = source.match(/\b(?:tier|grade|rank)\s*[:\-]?\s*(SS\+?|[SABCDEF][+-]?)\b/i);
  const tier = (prefix?.[1] ?? explicit?.[1] ?? "").toUpperCase();
  return tier || null;
}

/** Sort key of a tier: F lowest, SS highest; "+" and "-" nudge within the tier. */
export function rankingTierValue(tier: string) {
  const base = tier.replace(/[+-]+$/, "");
  const rank = TIER_RANK[base];
  if (rank === undefined) return null;
  return rank + (tier.endsWith("+") ? 0.3 : tier.endsWith("-") ? -0.3 : 0);
}

type RankableSlide = { position: number; role: string; headline: string };

/**
 * Reorders the tier slides from the worst tier to the best. The cover and the
 * final CTA/TAKEAWAY stay in place; slides without a tier keep their slot.
 * Equal tiers keep the model's order. Positions are renumbered 1..n.
 */
export function sortRankingSlides<T extends RankableSlide>(slides: T[]): T[] {
  const ordered = [...slides].sort((a, b) => a.position - b.position);
  const tierSlots = ordered
    .map((slide, index) => ({ slide, index, value: index === 0 || /^(CTA|TAKEAWAY)$/i.test(slide.role) ? null : rankingTierValue(rankingTier(slide.headline) ?? "") }))
    .filter((entry): entry is { slide: T; index: number; value: number } => entry.value !== null);
  const sorted = [...tierSlots].sort((a, b) => a.value - b.value || a.index - b.index);
  const result = [...ordered];
  tierSlots.forEach((slot, rank) => { result[slot.index] = sorted[rank]!.slide; });
  return result.map((slide, index) => ({ ...slide, position: index + 1 }));
}

/** True when the tier slides already climb from the worst tier to the best. */
export function isRankingAscending(slides: RankableSlide[]) {
  const sorted = sortRankingSlides(slides);
  const ordered = [...slides].sort((a, b) => a.position - b.position);
  return sorted.every((slide, index) => slide.headline === ordered[index]!.headline);
}
