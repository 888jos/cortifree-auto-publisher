import type { CarouselSpec } from "./schemas";

export type ValidationIssue = { code: string; message: string; slidePosition?: number; severity: "minor" | "major" };

const unsafeHealthPatterns = [
  /lowers? cortisol by\s*\d+/i,
  /reduce[sd]? cortisol by\s*\d+/i,
  /balance[sd]? (your )?hormones?/i,
  /fix(es|ed)? (your )?(cortisol|hormones?)/i,
  /cure[sd]?|treats?|diagnos(e|is)/i,
  /guarantee[sd]?|clinically proven/i,
  /\b\d+(?:\.\d+)?%\b/i,
  /stud(?:y|ies) (?:show|prove)/i,
];

const layoutAliases: Record<string, string> = {
  "cover-hero": "hero",
  "split-proof": "split",
  "numbered-stack": "numbered",
  "checklist-grid": "checklist",
  "before-after": "compare",
  "quote-pause": "quote",
  "routine-cards": "cards",
  "myth-fact": "myth",
  "mistake-fix": "fix",
  "challenge-days": "challenge",
  "symptom-map": "bubbles",
  "recipe-flow": "recipe",
};

function canonicalLayout(layout: string): string {
  return layoutAliases[layout] ?? layout;
}

export class DeterministicValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
  }
}

export function validateCarouselSpec(spec: CarouselSpec, expected: { slideCount: number; language: "en" | "fr"; layout: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (spec.slides.length !== expected.slideCount) issues.push({ code: "SLIDE_COUNT", message: `Expected ${expected.slideCount} slides`, severity: "major" });
  if (spec.language !== expected.language) issues.push({ code: "LANGUAGE", message: `Expected language ${expected.language}`, severity: "major" });

  const seen = new Set<string>();
  spec.slides.forEach((slide, index) => {
    if (slide.position !== index + 1) issues.push({ code: "POSITION", message: "Slide positions must be consecutive", slidePosition: slide.position, severity: "major" });
    if (canonicalLayout(slide.layout) !== canonicalLayout(expected.layout)) {
      issues.push({ code: "LAYOUT", message: `Slide must use ${expected.layout}`, slidePosition: slide.position, severity: "minor" });
    }
    if (slide.headline.length > 72) issues.push({ code: "HEADLINE_LENGTH", message: "Headline is too long for mobile", slidePosition: slide.position, severity: "minor" });
    if (slide.body.length > 220) issues.push({ code: "BODY_LENGTH", message: "Body is too long for mobile", slidePosition: slide.position, severity: "minor" });
    const normalized = `${slide.headline} ${slide.body}`.trim().toLowerCase();
    if (seen.has(normalized)) issues.push({ code: "EXACT_DUPLICATE", message: "Exact duplicate slide copy", slidePosition: slide.position, severity: "major" });
    seen.add(normalized);
    if (/placeholder|lorem ipsum|what to (show|say)|asset à choisir/i.test(normalized)) issues.push({ code: "PLACEHOLDER", message: "Placeholder copy detected", slidePosition: slide.position, severity: "major" });
    if (unsafeHealthPatterns.some((pattern) => pattern.test(normalized))) issues.push({ code: "HEALTH_CLAIM", message: "Unsafe or unsupported health claim", slidePosition: slide.position, severity: "major" });
  });

  const allCopy = `${spec.title} ${spec.topic} ${spec.angle} ${spec.hook} ${spec.caption}`;
  if (unsafeHealthPatterns.some((pattern) => pattern.test(allCopy))) issues.push({ code: "HEALTH_CLAIM", message: "Unsafe or unsupported health claim", severity: "major" });
  if (spec.slides[0]?.role !== "HOOK") issues.push({ code: "HOOK_ROLE", message: "First slide must be HOOK", slidePosition: 1, severity: "major" });
  if (!new Set(["CTA", "TAKEAWAY"]).has(spec.slides.at(-1)?.role ?? "")) issues.push({ code: "FINAL_ROLE", message: "Final slide must be CTA or TAKEAWAY", severity: "minor" });
  return issues;
}

export function assertValidCarouselSpec(spec: CarouselSpec, expected: { slideCount: number; language: "en" | "fr"; layout: string }): void {
  const issues = validateCarouselSpec(spec, expected);
  if (issues.length) throw new DeterministicValidationError(issues);
}
