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
  return issues;
}

const TITLE_NOUN = "(?:reset|routine|guide|plan|system|method|checklist|habits?|tips|rituals?|edit|ideas|steps|reminders)";
const LIST_NOUN = "(?:ways|tips|steps|habits|ideas|rules|reminders|rituals)";

/**
 * Blog/Pinterest-style hooks that label the content instead of sounding like
 * a person ("my simple reset when everything feels like too much"). The
 * operator rejected this shape repeatedly. Used for a rewrite, never a block.
 */
export function titleHookReason(hook: string): string | undefined {
  const text = hook.toLowerCase().replace(/[“”"]/g, "").trim();
  if (new RegExp(`^(?:my|a|the|your)\\s+(?:[a-z0-9'-]+\\s+){0,3}${TITLE_NOUN}\\s+(?:when|for|to|on|after|before|if)\\b`).test(text)) {
    return "reads like a content title (\"my/a [adjective] reset/routine/guide when/for ...\")";
  }
  if (new RegExp(`^(?:\\d+|a few|some)\\s+(?:[a-z'-]+\\s+){0,2}${LIST_NOUN}\\s+(?:to|for)\\b`).test(text) || /^how to\b/.test(text)) {
    return "reads like a how-to article title (\"5 simple ways to ...\", \"how to ...\")";
  }
  if (/\bwhen (?:everything|it all|life|things) (?:feels?|gets?|is|are)\b/.test(text) || /\b(?:feels?|is) (?:like )?(?:too much|a lot)\s*$/.test(text)) {
    return "uses a vague feeling instead of a concrete moment";
  }
  return undefined;
}

// Abstract nouns that make a short F01 headline unclear ("pause the extra
// input", "keep the reset small"): the operator could not tell what to do.
const ABSTRACT_HEADLINE_WORDS = /\b(?:input|inputs|reset|bandwidth|capacity|energy|intention|intentions|mindset|nervous system|overstimulation|stimulation|(?<!white )noise|boundaries|vibe)\b/;

/**
 * F01 body headlines must name the concrete action in words a friend would
 * use. Returns the offending headlines; used for a rewrite, never a block.
 */
export function abstractHeadlines(spec: CarouselSpec): string[] {
  return spec.slides
    .filter((slide, index) => index > 0 && slide.layout === "lifestyle-3stack")
    .map((slide) => slide.headline.toLowerCase().trim())
    .filter((headline) => ABSTRACT_HEADLINE_WORDS.test(headline));
}
