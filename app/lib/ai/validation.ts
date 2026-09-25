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
      const isCover = index === 0;
      const parts = slide.body.split("|").map((item) => item.trim()).filter(Boolean);
      const allowedLabels = new Set(["BENEFITS", "HOW TO", "WHY IT HELPS", "WHAT TO USE", "MISTAKES"]);
      if (isCover) {
        if (slide.headline.length > 72) issues.push({ code: "EDU_COVER_TITLE_LENGTH", message: "F04 cover title is too long for the centered title card", slidePosition: slide.position, severity: "minor" });
        if (slide.body.length > 24 || parts.length > 1) issues.push({ code: "EDU_COVER_COPY", message: "F04 cover must contain only a tiny decorative accent, never a bullet block", slidePosition: slide.position, severity: "minor" });
      } else {
        const label = parts[0] ?? "";
        const bullets = parts.slice(1);
        if (slide.headline.length > 28) issues.push({ code: "EDU_SUBJECT_LENGTH", message: "F04 subject title must stay short", slidePosition: slide.position, severity: "minor" });
        if (!allowedLabels.has(label.toUpperCase())) issues.push({ code: "EDU_SECTION_LABEL", message: "F04 body must start with one allowed educational section label", slidePosition: slide.position, severity: "minor" });
        if (bullets.length < 3 || bullets.length > 5) issues.push({ code: "EDU_BULLET_COUNT", message: "F04 body must contain 3-5 short bullets", slidePosition: slide.position, severity: "minor" });
        if (bullets.some((bullet) => bullet.length > 52)) issues.push({ code: "EDU_BULLET_LENGTH", message: "F04 bullets must stay short and saveable", slidePosition: slide.position, severity: "minor" });
        if (slide.body.length > 190 || /[.!?].+[.!?].+/s.test(bullets.join(" "))) issues.push({ code: "EDU_PARAGRAPH", message: "F04 educational block must be checklist copy, not paragraph prose", slidePosition: slide.position, severity: "minor" });
        if (!/proof|result|example/i.test(slide.visualIntent) || !/tool|product|ingredient|support/i.test(slide.visualIntent) || !/diagram|result|support/i.test(slide.visualIntent)) issues.push({ code: "EDU_VISUAL_SLOTS", message: "F04 body must specify proof/example plus two differentiated support visual roles", slidePosition: slide.position, severity: "minor" });
      }
    }
    if (expected.layout === "editorial-asym-hero") {
      if (index > 0 && slide.headline.length > 56) issues.push({ code: "EDITORIAL_HEADLINE_LENGTH", message: "Editorial body headline is too long for the fixed lower-left zone", slidePosition: slide.position, severity: "minor" });
      if (slide.body.length > 150) issues.push({ code: "EDITORIAL_BODY_LENGTH", message: "Editorial support copy is too long for the fixed lower-left zone", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "ranking") {
      const isBodyRankingSlide = index > 0 && index < spec.slides.length - 1;
      const tierMatch = slide.headline.trim().match(/^(SS\+|[FDCBAS])\s*[·•|—–:\-]\s*(.+)$/i);
      if (index === 0 && !/tier\s*list/i.test(slide.headline)) issues.push({ code: "RANKING_COVER", message: "F07 cover should clearly say TIER LIST", slidePosition: slide.position, severity: "minor" });
      if (isBodyRankingSlide && !tierMatch) issues.push({ code: "RANKING_TIER", message: "F07 body headline must be TIER · ITEM using F, D, C, B, A, S or SS+", slidePosition: slide.position, severity: "minor" });
      if (isBodyRankingSlide && slide.headline.length > 58) issues.push({ code: "RANKING_HEADLINE_LENGTH", message: "Tier-list item title is too long for the centered layout", slidePosition: slide.position, severity: "minor" });
      const wordCount = slide.body.trim().split(/\s+/).filter(Boolean).length;
      if (isBodyRankingSlide && (wordCount < 18 || wordCount > 58)) issues.push({ code: "RANKING_BODY_LENGTH", message: "Tier-list explanation should stay around 18-58 words", slidePosition: slide.position, severity: "minor" });
      if (isBodyRankingSlide && /\d+(?:\.\d+)?\s*\/\s*10/.test(slide.headline)) issues.push({ code: "RANKING_NUMERIC_SCORE", message: "F07 uses tier labels, not X/10 scores", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "lifestyle-3stack") {
      const isCover = index === 0;
      if (isCover) {
        if (slide.headline.trim().split(/\s+/).length > 9) issues.push({ code: "LIFESTYLE_COVER_LENGTH", message: "F01 cover hook must stay short and native-looking", slidePosition: slide.position, severity: "minor" });
        if (slide.body.length > 42) issues.push({ code: "LIFESTYLE_COVER_BODY", message: "F01 cover context must stay tiny", slidePosition: slide.position, severity: "minor" });
      } else {
        const words = slide.body.trim().split(/\s+/).filter(Boolean).length;
        if (slide.headline.trim().split(/\s+/).length > 6) issues.push({ code: "LIFESTYLE_HEADLINE_LENGTH", message: "F01 habit headline should be 2-5 casual words", slidePosition: slide.position, severity: "minor" });
        if (words > 32 || slide.body.length > 180) issues.push({ code: "LIFESTYLE_BODY_LENGTH", message: "F01 body must stay to 1-3 short creator-style lines", slidePosition: slide.position, severity: "minor" });
        if (!/three|3/i.test(slide.visualIntent) || !/same behavior|same habit/i.test(slide.visualIntent) || !/top/i.test(slide.visualIntent) || !/middle/i.test(slide.visualIntent) || !/bottom/i.test(slide.visualIntent)) {
          issues.push({ code: "LIFESTYLE_VISUAL_STACK", message: "F01 body must request exactly three coherent views of the same behavior with top/middle/bottom roles", slidePosition: slide.position, severity: "minor" });
        }
      }
    }
    if (expected.layout === "interactive-checklist") {
      const isNotesBody = index > 0;
      const choices = slide.body.split(/\s*(?:\||\n|;)\s*/).map((item) => item.trim()).filter(Boolean);
      if (isNotesBody && (choices.length < 5 || choices.length > 12)) issues.push({ code: "CHECKLIST_OPTIONS", message: "F05 Notes body must contain 5-12 list items", slidePosition: slide.position, severity: "minor" });
      if (isNotesBody && choices.some((choice) => choice.length > 34)) issues.push({ code: "CHECKLIST_OPTION_LENGTH", message: "F05 Notes list items must stay very short", slidePosition: slide.position, severity: "minor" });
      if (isNotesBody && (slide.headline.trim().split(/\s+/).length > 3 || slide.headline.length > 28)) issues.push({ code: "CHECKLIST_HEADLINE_LENGTH", message: "F05 Notes category must be a short 1-3 word label", slidePosition: slide.position, severity: "minor" });
      if (isNotesBody && /\?|because|parce que|pourquoi/i.test(slide.body)) issues.push({ code: "CHECKLIST_EXPLAINER_COPY", message: "F05 Notes body should be a plain master list, not questions or explanations", slidePosition: slide.position, severity: "minor" });
      if (index === 0 && slide.body.length > 48) issues.push({ code: "CHECKLIST_COVER_BODY", message: "F05 cover should remain photo-first with almost no secondary copy", slidePosition: slide.position, severity: "minor" });
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
