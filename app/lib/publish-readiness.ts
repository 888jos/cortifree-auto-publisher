import sharp from "sharp";
import { carouselSpecSchema, type CarouselSpec } from "./ai/schemas";
import { validateCarouselSpec, type ValidationIssue } from "./ai/validation";
import { scanCarouselVisualQA } from "./carousel-qa";

export type RenderedSlide = { position: number; url: string; assetId?: string | number };
export type ReadinessIssue = ValidationIssue | { code: string; message: string; severity: "minor" | "major"; slidePosition?: number };

export async function inspectRenderedSlides(slides: RenderedSlide[]) {
  const issues: ReadinessIssue[] = [];
  const sorted = [...slides].sort((a, b) => a.position - b.position);
  for (let index = 0; index < sorted.length; index += 1) {
    const slide = sorted[index];
    if (slide.position !== index + 1) issues.push({ code: "RENDER_POSITION", message: "Rendered slide positions are incomplete", severity: "major", slidePosition: slide.position });
    if (!slide.url.startsWith("https://")) {
      issues.push({ code: "RENDER_URL", message: "Rendered slide does not have a public HTTPS URL", severity: "major", slidePosition: slide.position });
      continue;
    }
    try {
      const response = await fetch(slide.url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(bytes).metadata();
      if (metadata.format !== "png" || metadata.width !== 1080 || metadata.height !== 1350) {
        issues.push({ code: "RENDER_FORMAT", message: "Slide must be a 1080×1350 PNG", severity: "major", slidePosition: slide.position });
      }
      if (bytes.byteLength > 8 * 1024 * 1024) issues.push({ code: "RENDER_SIZE", message: "Slide exceeds the 8 MB platform limit", severity: "major", slidePosition: slide.position });
    } catch (error) {
      issues.push({ code: "RENDER_UNREACHABLE", message: `Rendered slide is unreachable: ${error instanceof Error ? error.message : "unknown error"}`, severity: "major", slidePosition: slide.position });
    }
  }
  return issues;
}

export async function evaluatePublishReadiness(input: { rawSpec: unknown; renderedSlides: RenderedSlide[]; platform: "tiktok" | "instagram"; profile?: string | null }) {
  const spec: CarouselSpec = carouselSpecSchema.parse(input.rawSpec);
  const issues: ReadinessIssue[] = validateCarouselSpec(spec, { slideCount: spec.slides.length, language: spec.language, layout: spec.slides[0]?.layout ?? "" });
  if (input.renderedSlides.length !== spec.slides.length) issues.push({ code: "MISSING_RENDERS", message: "Every generated slide must have a rendered PNG", severity: "major" });
  if (input.platform === "tiktok" && input.renderedSlides.length > 35) issues.push({ code: "TIKTOK_LIMIT", message: "TikTok photo posts support at most 35 items", severity: "major" });
  if (input.platform === "instagram" && input.renderedSlides.length > 10) issues.push({ code: "INSTAGRAM_LIMIT", message: "Instagram carousels support at most 10 items", severity: "major" });
  if (spec.caption.length > 2_200) issues.push({ code: "CAPTION_LIMIT", message: "Caption exceeds 2,200 characters", severity: "major" });
  if (!input.profile) issues.push({ code: "UPLOAD_POST_PROFILE", message: "Connect a media profile in Upload-Post before publishing", severity: "major" });
  const urls = input.renderedSlides.map((slide) => slide.url);
  if (new Set(urls).size !== urls.length) issues.push({ code: "DUPLICATE_RENDER", message: "Every slide must use a distinct rendered file", severity: "major" });
  issues.push(...scanCarouselVisualQA(input.rawSpec as Parameters<typeof scanCarouselVisualQA>[0]));
  issues.push(...await inspectRenderedSlides(input.renderedSlides));
  return { ready: !issues.some((issue) => issue.severity === "major"), issues, spec };
}
