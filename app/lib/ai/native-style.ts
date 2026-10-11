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

// Crutch words the model leans on; dropping them never changes the meaning.
const CRUTCHES = /(^|[\s,(])(?:honestly|weirdly),?\s+/gi;

/** Lowercases copy (keeping labels, tiers and brands) and drops the final period of each line. */
export function nativeCase(text: string) {
  text = text.replace(CRUTCHES, "$1");
  // F07 tiers stay uppercase even when the model lowercases them ("s ·").
  const tier = text.match(/^\s*(ss|[sabcdf][+-]?)\s*·\s*/i);
  const head = tier ? tier[0].toUpperCase() : "";
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

/** Joins a hashtag split by a space ("#clean girl #x" → "#cleangirl #x") in the trailing hashtag run. */
export function fixHashtags(caption: string) {
  return caption.replace(/#(\w+) ([a-z]\w*)(?=\s+#|\s*$)/g, "#$1$2");
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** "before: ...", "the switch: ...", "now: ..." headlines read like a template, not a person. */
const LABEL_HEADLINE = /^(?:the\s+)?(?:before|after|now|then|switch|change|old me|new me|step \d+|tip|fix|result)\s*:/i;

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
  // The same sentence shape on every slide ("i do X, so Y") reads generated.
  const shaped = body.filter((slide) => /,\s*so\s+(?:i|you|the|my)\b|\bso\s+i\b/i.test(slide.body)).length;
  if (body.length >= 4 && shaped >= Math.ceil(body.length / 2)) issues.push(`REPETITIVE_SHAPE: ${shaped} slides use the same "..., so i..." sentence; vary the shapes`);
  // The operator called F08 "before: decide everything in the morning" and
  // "the switch: keep easy defaults together" incomprehensible.
  const labelled = body.filter((slide) => LABEL_HEADLINE.test(slide.headline.trim()));
  if (labelled.length) issues.push(`LABEL_HEADLINE: ${labelled.map((slide) => `"${slide.headline}"`).join(", ")} start with a label; say the actual thing in plain words`);
  return issues;
}

const TITLE_NOUN = "(?:reset|routine|guide|plan|system|method|checklist|habits?|tips|rituals?|edit)";
/** Nouns that only label a list ("my normal-day getting-ready defaults"). */
const LABEL_NOUN = "(?:defaults|staples|essentials|basics|non-negotiables|systems|formulas)";

/**
 * Blog/Pinterest-style hooks that label the content instead of sounding like
 * a person ("my simple reset when everything feels like too much"). The
 * operator rejected this shape repeatedly. Used for a rewrite, never a block.
 */
export function titleHookReason(hook: string): string | undefined {
  const text = hook.toLowerCase().replace(/[“”"]/g, "").trim();
  if (new RegExp(`^(?:my|a|the|your)\\s+(?:[a-z'-]+\\s+){0,3}${TITLE_NOUN}\\s+(?:when|for|to)\\b`).test(text)) {
    return "reads like a content title (\"my/a [adjective] reset/routine/guide when/for ...\")";
  }
  if (/\bwhen (?:everything|it all|life) (?:feels?|gets?|is)\b/.test(text)) return "uses a vague feeling instead of a concrete moment";
  if (new RegExp(`^(?:my|a|the|your)\\s+(?:[a-z'-]+\\s+){0,4}${LABEL_NOUN}$`).test(text.replace(/[.!?♡\s]+$/, ""))) {
    return "only labels a list (\"my [adjectives] defaults/essentials\") instead of saying something";
  }
  return undefined;
}
