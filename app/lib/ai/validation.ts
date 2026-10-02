import type { CarouselSpec } from "./schemas";
import { scoreGenericity } from "./genericity";

export type ValidationIssue = { code: string; message: string; slidePosition?: number; severity: "minor" | "major" };

const unsafeHealthRules = [
  { pattern: /\blowers? cortisol by\s*\d+/i, reason: "quantified cortisol reduction claim" },
  { pattern: /\breduce[sd]? cortisol by\s*\d+/i, reason: "quantified cortisol reduction claim" },
  { pattern: /\bbalance[sd]?\s+(?:your\s+)?hormones?\b/i, reason: "broad hormone-balancing promise" },
  { pattern: /\bfix(?:es|ed)?\s+(?:your\s+)?(?:cortisol|hormones?)\b/i, reason: "cortisol or hormone fix promise" },
  { pattern: /\b(?:cure[sd]?|treat(?:s|ed|ing)?|diagnos(?:e[sd]?|ing))\b.{0,60}\b(?:insomnia|anxiety|burnout|acne|cortisol|hormones?|panic attacks?|sleep disorder|fatigue)\b/i, reason: "medical treatment or diagnosis claim" },
  { pattern: /\b(?:insomnia|anxiety|burnout|acne|cortisol|hormones?|panic attacks?|sleep disorder|fatigue)\b.{0,60}\b(?:cure[sd]?|treat(?:s|ed|ing)?|diagnos(?:e[sd]?|ing))\b/i, reason: "medical treatment or diagnosis claim" },
  { pattern: /\bguarantee[sd]?\b|\bclinically proven\b/i, reason: "guaranteed or clinically-proven outcome" },
  { pattern: /\b\d+(?:\.\d+)?%\b/i, reason: "unsupported percentage claim" },
  { pattern: /\bstud(?:y|ies)\s+(?:show|prove)\b/i, reason: "unsourced study claim" },
  { pattern: /\byou (?:definitely |clearly |probably )?(?:have|must have)\s+(?:high|low)\s+cortisol\b/i, reason: "cortisol diagnosis from symptoms or appearance" },
] as const;

function unsafeHealthReason(text: string) {
  return unsafeHealthRules.find((rule) => rule.pattern.test(text))?.reason ?? null;
}

const unexpectedScriptPattern = /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
function hasUnexpectedScript(text: string, language: "en" | "fr") {
  return language === "en" && unexpectedScriptPattern.test(text);
}

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
  let routineItinerarySignals = 0;
  spec.slides.forEach((slide, index) => {
    if (slide.position !== index + 1) issues.push({ code: "POSITION", message: "Slide positions must be consecutive", slidePosition: slide.position, severity: "major" });
    if (canonicalLayout(slide.layout) !== canonicalLayout(expected.layout)) {
      issues.push({ code: "LAYOUT", message: `Slide must use ${expected.layout}`, slidePosition: slide.position, severity: "minor" });
    }
    if (slide.headline.length > 72) issues.push({ code: "HEADLINE_LENGTH", message: "Headline is too long for mobile", slidePosition: slide.position, severity: "minor" });
    const maxBodyLength = expected.layout === "interactive-checklist" ? 620 : 220;
    if (slide.body.length > maxBodyLength) issues.push({ code: "BODY_LENGTH", message: "Body is too long for the selected mobile layout", slidePosition: slide.position, severity: "major" });
    if (expected.layout === "routine-timeline") {
      const role = slide.role.toUpperCase();
      const isRoutineStep = index > 0 && role !== "CTA" && role !== "TAKEAWAY";
      const time = "(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?\\s*(?:AM|PM)?|(?:[01]?\\d|2[0-3])h(?:[0-5]\\d)?";
      const hasRangePrefix = new RegExp(`^(?:${time})\\s*(?:-|–|—|→)\\s*(?:${time})\\s*(?:[·•|:]|\\s)`, "i").test(slide.headline.trim());
      if (isRoutineStep && !hasRangePrefix) issues.push({ code: "ROUTINE_TIME_RANGE", message: "Routine step must start with a start-end time range", slidePosition: slide.position, severity: "minor" });
      if (isRoutineStep && slide.headline.length > 72) issues.push({ code: "ROUTINE_ACTION_LENGTH", message: "Routine time + action is too long for the compact photo overlay", slidePosition: slide.position, severity: "minor" });
      if (isRoutineStep && slide.body.length > 90) issues.push({ code: "ROUTINE_BODY_LENGTH", message: "Routine support copy must stay to a few short factual lines", slidePosition: slide.position, severity: "minor" });
      if (isRoutineStep && /\b(?:calls?|messages?|errands?|pick(?:ing)?\s+up|pickup|appointments?|meetings?|classes?|commute|shopping?|shop)\b/i.test(slide.headline)) {
        routineItinerarySignals += 1;
      }
      if (index === 0 && slide.body.length > 32) issues.push({ code: "ROUTINE_COVER_RANGE", message: "Routine cover body should contain only the overall time range", slidePosition: slide.position, severity: "minor" });
    }
    if (expected.layout === "three-rect-educational") {
      const isCover = index === 0;
      const parts = slide.body.split("|").map((item) => item.trim()).filter(Boolean);
      const allowedLabels = new Set(["BENEFITS", "HOW TO", "WHY IT HELPS", "WHAT TO USE", "MISTAKES", "TAKEAWAY"]);
      if (isCover) {
        if (slide.headline.length > 72) issues.push({ code: "EDU_COVER_TITLE_LENGTH", message: "F04 cover title is too long for the centered title card", slidePosition: slide.position, severity: "minor" });
        if (slide.body.length > 24 || parts.length > 1) issues.push({ code: "EDU_COVER_COPY", message: "F04 cover must contain only a tiny decorative accent, never a bullet block", slidePosition: slide.position, severity: "minor" });
      } else {
        const label = parts[0] ?? "";
        const bullets = parts.slice(1);
        if (slide.headline.length > 46) issues.push({ code: "EDU_SUBJECT_LENGTH", message: "F04 action headline is too long for a clean one- or two-line display", slidePosition: slide.position, severity: "minor" });
        const f04Headline = slide.headline.trim().replace(/[.!?]+$/, "");
        const f04Words = f04Headline.split(/\s+/).filter(Boolean);
        const f04BareCategories = new Set(["notifications", "focus", "morning", "mornings", "meals", "meal", "stress", "sleep", "energy", "phone", "phones", "hydration", "movement", "breakfast", "routine", "routines"]);
        if (f04Words.length === 1 && f04BareCategories.has(f04Headline.toLowerCase())) {
          issues.push({ code: "EDU_BARE_CATEGORY", message: "F04 large headline must express an action or complete takeaway, not a bare category label", slidePosition: slide.position, severity: "major" });
        }
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
      const role = slide.role.toUpperCase();
      const isBodyRankingSlide = index > 0 && role !== "CTA" && role !== "TAKEAWAY";
      const tierMatch = slide.headline.trim().match(/^(SS\+|[FDCBAS])(?:\s+TIER)?\s*[·•|—–:\-]\s*(.+)$/i);
      if (isBodyRankingSlide && !tierMatch) issues.push({ code: "RANKING_TIER", message: "F07 body headline must identify both a tier and a concrete item", slidePosition: slide.position, severity: "minor" });
      if (isBodyRankingSlide && slide.headline.length > 64) issues.push({ code: "RANKING_HEADLINE_LENGTH", message: "F07 item label is too long", slidePosition: slide.position, severity: "minor" });
      const wordCount = slide.body.trim().split(/\s+/).filter(Boolean).length;
      if (isBodyRankingSlide && wordCount > 45) issues.push({ code: "RANKING_BODY_LENGTH", message: "F07 explanation should be one or two plain-English sentences", slidePosition: slide.position, severity: "minor" });
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
      if (isNotesBody && (choices.length < 4 || choices.length > 6)) issues.push({ code: "CHECKLIST_OPTIONS", message: "F05 Notes body must contain 4-6 complete useful list items", slidePosition: slide.position, severity: "major" });
      if (isNotesBody && choices.some((choice) => choice.length > 96)) issues.push({ code: "CHECKLIST_OPTION_LENGTH", message: "F05 Notes item is too long for a readable two-line checklist row; rewrite it rather than truncating it", slidePosition: slide.position, severity: "major" });
      const f05Headline = slide.headline.trim().replace(/[.!?]+$/, "");
      const f05Words = f05Headline.split(/\s+/).filter(Boolean);
      const f05BareCategories = new Set(["notifications","notification","check-in","checkin","focus","morning","mornings","breaks","break","apps","limits","app limits","phone parking","stress","sleep","routine","routines"]);
      if (isNotesBody && f05Words.length <= 2 && f05BareCategories.has(f05Headline.toLowerCase())) issues.push({ code: "CHECKLIST_BARE_CATEGORY", message: "F05 Note title must express an action or complete takeaway, not a bare category label", slidePosition: slide.position, severity: "major" });
      if (isNotesBody && slide.headline.length > 58) issues.push({ code: "CHECKLIST_HEADLINE_LENGTH", message: "F05 Note title is too long for a clean sentence-case heading", slidePosition: slide.position, severity: "minor" });
      if (index === 0 && slide.body.length > 48) issues.push({ code: "CHECKLIST_COVER_BODY", message: "F05 cover should remain photo-first with almost no secondary copy", slidePosition: slide.position, severity: "minor" });
      if (isNotesBody && index === spec.slides.length - 1 && slide.role.toUpperCase() === "CTA") {
        issues.push({ code: "CHECKLIST_FINAL_NOTE", message: "F05 final slide must remain a useful Note/takeaway, not a save/follow CTA card", slidePosition: slide.position, severity: "major" });
      }
    }
    const languageSurface = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`;
    if (hasUnexpectedScript(languageSurface, expected.language)) {
      issues.push({ code: "UNEXPECTED_SCRIPT", message: "English carousel contains stray non-Latin script; regenerate the affected copy or visual prompt", slidePosition: slide.position, severity: "major" });
    }
    const normalized = `${slide.headline} ${slide.body}`.trim().toLowerCase();
    if (seen.has(normalized)) issues.push({ code: "EXACT_DUPLICATE", message: "Exact duplicate slide copy", slidePosition: slide.position, severity: "major" });
    seen.add(normalized);
    if (/placeholder|lorem ipsum|what to (show|say)|asset à choisir/i.test(normalized)) issues.push({ code: "PLACEHOLDER", message: "Placeholder copy detected", slidePosition: slide.position, severity: "major" });
    const slideHealthReason = unsafeHealthReason(normalized);
    if (slideHealthReason) issues.push({ code: "HEALTH_CLAIM", message: `Unsafe health claim: ${slideHealthReason}`, slidePosition: slide.position, severity: "major" });
  });
  if (expected.layout === "routine-timeline" && routineItinerarySignals >= 2) {
    issues.push({
      code: "ROUTINE_ITINERARY_DRIFT",
      message: "F03 must be a coherent wellness routine, not an itinerary of calls, errands, appointments, classes, shopping or commute tasks",
      severity: "major",
    });
  }

  const allCopy = `${spec.title} ${spec.topic} ${spec.angle} ${spec.hook} ${spec.caption}`;
  if (hasUnexpectedScript(allCopy, expected.language)) {
    issues.push({ code: "UNEXPECTED_SCRIPT", message: "English carousel contains stray non-Latin script", severity: "major" });
  }
  const topLevelHealthReason = unsafeHealthReason(allCopy);
  if (topLevelHealthReason) issues.push({ code: "HEALTH_CLAIM", message: `Unsafe health claim: ${topLevelHealthReason}`, severity: "major" });
  if (spec.slides[0]?.role !== "HOOK") issues.push({ code: "HOOK_ROLE", message: "First slide must be HOOK", slidePosition: 1, severity: "major" });
  if (!new Set(["CTA", "TAKEAWAY"]).has(spec.slides.at(-1)?.role ?? "")) issues.push({ code: "FINAL_ROLE", message: "Final slide must be CTA or TAKEAWAY", severity: "minor" });
  const genericity = scoreGenericity(spec);
  if (genericity.score >= 3) issues.push({ code: "GENERICITY", message: genericity.issues.map((issue) => issue.message).join("; "), severity: "major" });
  return issues;
}

export function assertValidCarouselSpec(spec: CarouselSpec, expected: { slideCount: number; language: "en" | "fr"; layout: string }): void {
  const issues = validateCarouselSpec(spec, expected);
  // Template polish is review feedback, not a reason to throw away usable
  // generation. Only safety, invalid JSON structure, duplicate/placeholder
  // content and similarly material issues block the queue.
  const blockers = issues.filter((issue) => issue.severity === "major");
  if (blockers.length) throw new DeterministicValidationError(blockers);
}
