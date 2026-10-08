import type { CarouselSpec } from "./schemas";

// On-screen TikTok text is lowercase and rarely ends with a period. Kept as
// written: all-caps tokens (F04 section labels, acronyms), the F07 tier
// prefix ("S ·", "SS ·") and brand names.
const KEEP_CASE = new Set(["CortiFree", "TikTok"]);

function lowerWord(word: string) {
  if (KEEP_CASE.has(word.replace(/[^\p{L}]/gu, ""))) return word;
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) return word;
  return word.toLowerCase();
}

/** Lowercases copy (keeping labels, tiers and brands) and drops the final period of each line. */
export function nativeCase(text: string) {
  const tier = text.match(/^\s*(SS|[SABCDF][+-]?)\s*·\s*/);
  const head = tier ? tier[0] : "";
  const rest = text.slice(head.length);
  const lowered = rest.split(/(\s+)/).map((part) => (/\s/.test(part) ? part : lowerWord(part))).join("");
  return head + lowered
    .split(/(\s*\|\s*|\n)/)
    .map((segment) => segment.replace(/(?<!\.)\.\s*$/, ""))
    .join("");
}

const CONTRAST = [
  /\bnot\b[^.|,]{1,45},\s*(?:just|only)\b/gi, // "not the whole day, just the first thing"
  /\w,\s*not\s+(?:just\s+|even\s+)?(?:a|an|the|my|your)?\s*\w+/gi, // "progress, not evidence"
];

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Style issues that make copy read as AI-written rather than posted by a
 * 20-year-old. Used for a rewrite pass, never to block generation.
 */
export function nativeStyleIssues(spec: CarouselSpec): string[] {
  const issues: string[] = [];
  const body = spec.slides.filter((slide, index) => index > 0 && slide.layout !== "routine-timeline");
  const isList = (layout: string) => layout === "interactive-checklist" || layout === "three-rect-educational";
  const prose = body.filter((slide) => !isList(slide.layout));
  if (prose.length) {
    const average = prose.reduce((total, slide) => total + words(slide.body), 0) / prose.length;
    if (average > 22) issues.push(`TOO_LONG: body slides average ${Math.round(average)} words; keep them around 6-18`);
  }
  const listItems = body.filter((slide) => isList(slide.layout))
    .flatMap((slide) => slide.body.split(/\s*\|\s*/).slice(slide.layout === "three-rect-educational" ? 1 : 0));
  if (listItems.length && listItems.filter((item) => words(item) > 12).length > listItems.length / 3) {
    issues.push("TOO_LONG: list items run past 12 words; keep them short like her own notes");
  }
  const copy = [spec.hook, spec.caption, ...spec.slides.flatMap((slide) => [slide.headline, slide.body])].join("\n");
  const contrasts = CONTRAST.reduce((total, pattern) => total + (copy.match(pattern)?.length ?? 0), 0);
  if (contrasts >= 2) issues.push(`AI_CONTRAST: ${contrasts} "not X, just Y" / "X, not Y" constructions`);
  return issues;
}
