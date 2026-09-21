import type { ReadinessIssue } from "./publish-readiness";

const LOCAL_FONTS = new Set([
  "TikTok Sans", "Instrument Sans", "Manrope", "Inter Tight", "DM Sans",
  "Plus Jakarta Sans", "Space Grotesk", "Bricolage Grotesque", "Archivo", "Urbanist",
]);

type SpecLike = {
  model_id?: string;
  generated_slides?: Array<{ position: number; role: string; headline: string; body: string; layout?: string }>;
  rendered_slides?: Array<{ position: number; assetIds?: Array<string | number>; geometry?: { image?: { mode?: string }; text?: { fontFamily?: string; headlineSize?: number; bodySize?: number; x?: number; y?: number; width?: number } } }>;
};

export function scanCarouselVisualQA(spec: SpecLike): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const slides = [...(spec.generated_slides ?? [])].sort((a, b) => a.position - b.position);
  const rendered = [...(spec.rendered_slides ?? [])].sort((a, b) => a.position - b.position);
  const expectedGrid = spec.model_id === "grid-2x2" || slides.some((slide) => slide.layout === "grid-2x2");
  const usedAssets = new Set<string>();
  const genericCopy = /routine you can repeat|a routine you can actually repeat|feel more together|small steps that add up|make tomorrow easier/i;
  for (const slide of slides) {
    if (genericCopy.test(`${slide.headline} ${slide.body}`)) issues.push({ code: "GENERIC_COPY", message: "Copy is too generic; replace it with a concrete action or observable result", severity: "major", slidePosition: slide.position });
    if (!slide.headline.trim() || !slide.body.trim()) issues.push({ code: "EMPTY_COPY", message: "Every slide needs a non-empty headline and explanation", severity: "major", slidePosition: slide.position });
  }
  for (const slide of rendered) {
    const geometry = slide.geometry;
    const mode = geometry?.image?.mode;
    const shouldBeGrid = expectedGrid && slide.position > 1;
    const shouldBeSingle = slide.position === 1;
    if (shouldBeSingle && mode !== "single") issues.push({ code: "HOOK_LAYOUT", message: "The hook must stay a single human-led image", severity: "major", slidePosition: slide.position });
    if (shouldBeGrid && mode !== "grid-2x2") issues.push({ code: "GRID_LAYOUT", message: "Non-hook slides must use the 2×2 layout", severity: "major", slidePosition: slide.position });
    const font = geometry?.text?.fontFamily;
    if (font && !LOCAL_FONTS.has(font)) issues.push({ code: "UNAPPROVED_FONT", message: `Carousel uses a font that is not downloaded: ${font}`, severity: "major", slidePosition: slide.position });
    const text = geometry?.text;
    if (text && ((text.x ?? 0) < 40 || (text.y ?? 0) < 40 || (text.x ?? 0) + (text.width ?? 0) > 1040)) issues.push({ code: "TEXT_SAFE_ZONE", message: "Text frame is outside the safe area", severity: "major", slidePosition: slide.position });
    const assetIds = slide.assetIds ?? [];
    if (shouldBeGrid && assetIds.length !== 4) issues.push({ code: "GRID_ASSET_COUNT", message: "Each 2×2 slide must contain four tiles", severity: "major", slidePosition: slide.position });
    if (shouldBeGrid && !(String(assetIds[0]) === String(assetIds[3]) && String(assetIds[1]) === String(assetIds[2]) && String(assetIds[0]) !== String(assetIds[1]))) {
      issues.push({ code: "GRID_DIAGONAL_PATTERN", message: "Each 2×2 slide must repeat exactly two distinct images diagonally", severity: "major", slidePosition: slide.position });
    }
    for (const id of new Set(assetIds.map(String))) {
      const key = String(id);
      if (usedAssets.has(key)) issues.push({ code: "DUPLICATE_SOURCE_IMAGE", message: "The same source image is reused in more than one slide", severity: "major", slidePosition: slide.position });
      usedAssets.add(key);
    }
  }
  if (expectedGrid && rendered.length && rendered.length !== slides.length) issues.push({ code: "QA_RENDER_COUNT", message: "Visual QA cannot validate every generated slide", severity: "major" });
  return issues;
}
