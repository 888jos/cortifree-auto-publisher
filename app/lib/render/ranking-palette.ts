// F07 colors. Every tier slide is painted in its own strong color, from cool
// (worst) to warm (best), so the climb reads at a glance. The text is white or
// dark, whichever reads better on that color, and the tier badge is a pastel
// tint of the same hue.

export type RankingPalette = {
  background: string;
  /** Slightly deeper shade for the bottom of the gradient. */
  backgroundEnd: string;
  text: string;
  subtext: string;
  /** Pastel badge fill and the tier letter drawn on it. */
  accent: string;
  accentText: string;
};

const DARK = "#1d1a1c";
const WHITE = "#ffffff";

const TIER_COLORS: Record<string, string> = {
  F: "#6e56cf",
  D: "#3366e0",
  C: "#20a98f",
  B: "#ffc53d",
  A: "#ff8a3d",
  S: "#ff5c7a",
  SS: "#c92a7b",
};
const COVER_COLOR = "#b9a4ff";
const FINAL_COLOR = "#ff9ec3";

function rgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function toHex(channels: number[]) {
  return `#${channels.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, target: string, amount: number) {
  const from = rgb(hex);
  const to = rgb(target);
  return toHex(from.map((channel, index) => channel + (to[index]! - channel) * amount));
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/** White or dark text, whichever contrasts more with the background. */
export function readableTextColor(background: string) {
  return contrastRatio(WHITE, background) >= contrastRatio(DARK, background) ? WHITE : DARK;
}

function paletteFor(background: string): RankingPalette {
  const text = readableTextColor(background);
  const backgroundEnd = mix(background, "#000000", 0.08);
  return {
    background,
    backgroundEnd,
    text,
    subtext: text === WHITE ? "#fffaf7" : "#2b2427",
    accent: mix(background, WHITE, 0.72),
    accentText: mix(background, "#000000", 0.62),
  };
}

export function rankingTierKey(tier: string) {
  const base = tier.toUpperCase().replace(/[+-]+$/, "");
  return TIER_COLORS[base] ? base : "";
}

export function rankingPalette(kind: { tier?: string; cover?: boolean; final?: boolean }): RankingPalette {
  if (kind.cover) return paletteFor(COVER_COLOR);
  const key = rankingTierKey(kind.tier ?? "");
  if (key) return paletteFor(TIER_COLORS[key]!);
  return paletteFor(FINAL_COLOR);
}

/** Tier colors in climbing order, for the small tier ladder on the cover and the final slide. */
export const RANKING_LADDER = ["F", "D", "C", "B", "A", "S"].map((tier) => ({ tier, color: TIER_COLORS[tier]! }));
