import type { CarouselSpec } from "./schemas";
import { scoreGenericity } from "./genericity";

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
    if (expected.layout === "routine-timeline") {
      const role = slide.role.toUpperCase();
      const isRoutineStep = index > 0 && role !== "CTA" && role !== "TAKEAWAY";
      const time = "(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?\\s*(?:AM|PM)?|(?:[01]?\\d|2[0-3])h(?:[0-5]\\d)?";
      const hasRangePrefix = new RegExp(`^(?:${time})\\s*(?:-|–|—|→)\\s*(?:${time})\\s*(?:[·•|:]|\\s)`, "i").test(slide.headline.trim());
      if (isRoutineStep && !hasRangePrefix) issues.push({ code: "ROUTINE_TIME_RANGE", message: "Routine step must start with a start-end time range", slidePosition: slide.position, severity: "minor" });
      if (isRoutineStep && slide.headline.length > 72) issues.push({ code: "ROUTINE_ACTION_LENGTH", message: "Routine time + action is too long for the compact photo overlay", slidePosition: slide.position, severity: "minor" });
      if (isRoutineStep && slide.body.length > 90) issues.push({ code: "ROUTINE_BODY_LENGTH", message: "Routine support copy must stay to a few short factual lines", slidePosition: slide.position, severity: "minor" });
      if (index === 0 && slide.body.length > 32) issues.push({ code: "ROUTINE_COVER_RANGE", message: "Routine cover body should contain only the overall time range", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "three-rect-educational") {
      if (slide.headline.length > 64) issues.push({ code: "EDU_HEADLINE_LENGTH", message: "Educational headline is too long for the fixed top-left zone", slidePosition: slide.position, severity: "minor" });
      if (slide.body.length > 150) issues.push({ code: "EDU_BODY_LENGTH", message: "Educational explanation is too long for the fixed centered zone", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "editorial-asym-hero") {
      if (index > 0 && slide.headline.length > 56) issues.push({ code: "EDITORIAL_HEADLINE_LENGTH", message: "Editorial body headline is too long for the fixed lower-left zone", slidePosition: slide.position, severity: "minor" });
      if (slide.body.length > 150) issues.push({ code: "EDITORIAL_BODY_LENGTH", message: "Editorial support copy is too long for the fixed lower-left zone", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "ranking") {
      const isBodyRankingSlide = index > 0 && index < spec.slides.length - 1;
      const hasRating = /\b(?:10(?:\.0)?|[0-9](?:\.\d)?)\s*\/\s*10\b/i.test(slide.headline)
        || /\b(?:tier|grade|rank)\s*[:\-]?\s*[SABCDF][+-]?\b/i.test(slide.headline)
        || /^[SABCDF][+-]?\s*[·•|—–:\-]/i.test(slide.headline.trim());
      if (isBodyRankingSlide && !hasRating) issues.push({ code: "RANKING_SCORE", message: "Ranking body slide headline must include X/10 or an A-F/S tier", slidePosition: slide.position, severity: "minor" });
      if (isBodyRankingSlide && slide.headline.length > 64) issues.push({ code: "RANKING_HEADLINE_LENGTH", message: "Ranking item headline is too long for the fixed score layout", slidePosition: slide.position, severity: "minor" });
      if (slide.body.length > 180) issues.push({ code: "RANKING_BODY_LENGTH", message: "Ranking justification is too long for the fixed score layout", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "interactive-checklist") {
      const isChecklistBody = index > 0 && index < spec.slides.length - 1;
      const choices = slide.body.split(/\s*(?:\||\n|;)\s*/).map((item) => item.trim()).filter(Boolean);
      if (isChecklistBody && (choices.length < 2 || choices.length > 4)) issues.push({ code: "CHECKLIST_OPTIONS", message: "Checklist body slide must contain 2-4 pipe-separated choices", slidePosition: slide.position, severity: "minor" });
      if (isChecklistBody && choices.some((choice) => choice.length > 58)) issues.push({ code: "CHECKLIST_OPTION_LENGTH", message: "Checklist choice is too long for the fixed checkbox rows", slidePosition: slide.position, severity: "minor" });
      if (slide.headline.length > 72) issues.push({ code: "CHECKLIST_HEADLINE_LENGTH", message: "Checklist question is too long for the fixed panel", slidePosition: slide.position, severity: "minor" });
      if (slide.body.length > 220) issues.push({ code: "CHECKLIST_BODY_LENGTH", message: "Checklist copy is too long for the fixed panel", slidePosition: slide.position, severity: "minor" });
    }
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
  const genericity = scoreGenericity(spec);
  if (genericity.score >= 3) issues.push({ code: "GENERICITY", message: genericity.issues.map((issue) => issue.message).join("; "), severity: "major" });
  return issues;
}

export function assertValidCarouselSpec(spec: CarouselSpec, expected: { slideCount: number; language: "en" | "fr"; layout: string }): void {
  const issues = validateCarouselSpec(spec, expected);
  if (issues.length) throw new DeterministicValidationError(issues);
}
