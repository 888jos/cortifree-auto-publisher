type SlideLike = {
  position?: number;
  role?: string;
  layout?: string;
  headline?: string;
  body?: string;
};

type Typography = {
  hookFontFamily?: string;
  bodyFontFamily?: string;
  hookSize?: number;
  titleSize?: number;
  bodySize?: number;
  maxDistinctSizes?: number;
};

type Frame = {
  x: number;
  y: number;
  width: number;
  height?: number;
  fit?: "cover" | "contain";
  mode?: "single" | "grid-2x2";
};

export type SlideGeometry = {
  canvas: { width: number; height: number };
  safeZone: Frame;
  image: Frame;
  text: Frame & {
    align: "left" | "center" | "right";
    headlineY: number;
    bodyY: number;
    headlineSize: number;
    bodySize: number;
    headlineWeight: number;
    bodyWeight: number;
    headlineColor: string;
    bodyColor: string;
    maxHeadlineLines: number;
    maxBodyLines: number;
    accentColor: string;
    fontFamily: string;
    hookFontFamily: string;
    hookSize: number;
  };
  overlay: { color: string; opacity: number };
};

const WIDTH = 1080;
const HEIGHT = 1350;

/**
 * Deterministic geometry for the renderer.
 *
 * This file deliberately contains no runtime data access. The renderer owns
 * image-aware adjustments after asset selection; this function only defines a
 * stable baseline for hook/body/CTA and 2x2 layouts.
 */
export function getSlideGeometry(
  slide: SlideLike,
  isHook: boolean,
  isLast: boolean,
  typography: Typography = {},
): SlideGeometry {
  const role = String(slide.role ?? "").toUpperCase();
  const grid = slide.layout === "grid-2x2";
  const bodyFont = typography.bodyFontFamily ?? "TikTok Sans";
  const hookFont = typography.hookFontFamily ?? "Bricolage Grotesque";
  const titleSize = typography.titleSize ?? 52;
  const bodySize = typography.bodySize ?? 28;
  const hookSize = typography.hookSize ?? 44;

  const textBase = {
    x: 82,
    y: 810,
    width: 916,
    headlineY: 810,
    bodyY: 980,
    align: "left" as const,
    headlineSize: titleSize,
    bodySize,
    headlineWeight: 700,
    bodyWeight: 500,
    headlineColor: "#fffdf8",
    bodyColor: "#f7f4ed",
    maxHeadlineLines: 3,
    maxBodyLines: 5,
    accentColor: "#fffdf8",
    fontFamily: bodyFont,
    hookFontFamily: hookFont,
    hookSize,
  };

  if (isHook || role === "HOOK") {
    return {
      canvas: { width: WIDTH, height: HEIGHT },
      safeZone: { x: 64, y: 64, width: 952, height: 1222 },
      image: { x: 0, y: 0, width: WIDTH, height: HEIGHT, fit: "cover", mode: "single" },
      text: {
        ...textBase,
        y: 760,
        headlineY: 760,
        bodyY: 1020,
        headlineSize: Math.max(titleSize, hookSize),
        maxHeadlineLines: 4,
        maxBodyLines: 3,
      },
      overlay: { color: "#122019", opacity: 0.24 },
    };
  }

  if (isLast || role === "CTA") {
    return {
      canvas: { width: WIDTH, height: HEIGHT },
      safeZone: { x: 64, y: 64, width: 952, height: 1222 },
      image: { x: 0, y: 0, width: WIDTH, height: HEIGHT, fit: "cover", mode: grid ? "grid-2x2" : "single" },
      text: {
        ...textBase,
        y: 860,
        headlineY: 860,
        bodyY: 1030,
        align: "center",
        maxHeadlineLines: 3,
        maxBodyLines: 4,
      },
      overlay: { color: "#122019", opacity: 0.30 },
    };
  }

  return {
    canvas: { width: WIDTH, height: HEIGHT },
    safeZone: { x: 64, y: 64, width: 952, height: 1222 },
    image: { x: 0, y: 0, width: WIDTH, height: HEIGHT, fit: "cover", mode: grid ? "grid-2x2" : "single" },
    text: textBase,
    overlay: { color: "#122019", opacity: grid ? 0.18 : 0.30 },
  };
}
