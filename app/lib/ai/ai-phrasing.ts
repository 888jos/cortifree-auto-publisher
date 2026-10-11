import type { CarouselSpec } from "./schemas";

// Coined labels and productivity jargon nobody says out loud. The operator
// flagged "message check", "stopping point" and "reply window" as unreadable.
const JARGON = new RegExp(String.raw`\b(?:${[
  "(?:focus|digital|phone|work|screen|energy|attention|tech) boundar(?:y|ies)",
  "message checks?", "stopping points?", "reply windows?", "key people", "urgent contacts?",
  "non-urgent", "deep work", "focus (?:blocks?|sessions?|time)", "time[- ]block(?:s|ing)?", "one clear (?:place|task|way)",
  "attention (?:span|protected|budget)", "protect (?:your|my) (?:attention|focus|energy|peace)", "intentional(?:ly)?",
  "mindful(?:ly|ness)?", "dopamine", "cognitive load", "context switching", "bandwidth", "nervous system",
  "friction", "workflow", "habit stacking", "optimi[sz]e", "leverage", "accountability", "self-regulation",
].join("|")})\b`, "i");

// Imperatives the model opens F04 headlines with ("silence alerts that can wait").
const IMPERATIVE = /^(?:silence|mute|give|choose|make|keep|pick|put|turn|set|start|stop|use|try|protect|take|leave|let|move|create|build|schedule|batch|block|limit|plan|write|add|swap|check|hide|delete|close|save|charge|prep|drop|skip|find|track|switch|store|place|define|prioriti[sz]e|reclaim|guard|own|embrace|practice|honor|treat|decide|separate|reduce|remove|replace|anchor|name|clear)\b/i;
// A concrete moment or place makes a "you" instruction human again
// ("put your phone in another room when you work").
const SITUATION = /\b(?:when|while|before|after|during|until|every|each|tonight|morning|night|bed|lunch|room|kitchen|drawer|bag)\b/i;
const FIRST_PERSON = /\b(?:i|i'm|i’m|i've|i’ve|my|me)\b/i;

/**
 * A telegraphic slogan of two or three words with no verb behind it:
 * "attention protected", "phone nearby", "inbox handled".
 */
export function isSlogan(segment: string) {
  const text = segment.toLowerCase().replace(/[^a-z'’\s-]/g, " ").trim().replace(/\s+/g, " ");
  if (!text || FIRST_PERSON.test(text) || /^(?:it|it's|it’s|we|you|they|so|lol|ngl|tbh|lowkey|kinda|very|super|not|\w+ly)\b/.test(text)) return false;
  return /^(?:(?:my|your|the)\s+)?[a-z-]+\s+(?:[a-z-]+ed|nearby|sorted|done|handled|secured|on|off|away|first)$/.test(text);
}

const segments = (line: string) => line.split(/\s*(?:[.|/;]|,\s)\s*/).map((part) => part.trim()).filter(Boolean);

/** Why one line reads as AI-written, or undefined. `headline` enables the dry-imperative check. */
export function aiPhraseReason(line: string, options: { headline?: boolean } = {}): string | undefined {
  const text = line.replace(/[“”"]/g, "").trim();
  if (!text) return undefined;
  const jargon = text.match(JARGON)?.[0];
  if (jargon) return `uses jargon nobody types ("${jargon}"); say the plain thing she actually does`;
  if (segments(text).some(isSlogan)) return "stacks nouns into a slogan instead of a sentence; write what she does in her words";
  if (options.headline && IMPERATIVE.test(text) && !FIRST_PERSON.test(text) && !SITUATION.test(text)) {
    return "is a dry command with nobody behind it; say it as her (\"i prefer to silence alerts that can wait\") or name the moment (\"put your phone in another room when you work\")";
  }
  return undefined;
}

/**
 * F04 lines that read like a ChatGPT checklist: jargon, noun slogans and
 * dry imperative headlines. Used for a rewrite pass, never to block.
 */
export function aiPhrasingIssues(spec: CarouselSpec): string[] {
  const issues: string[] = [];
  const flag = (line: string, headline = false) => {
    const reason = aiPhraseReason(line, { headline });
    if (reason) issues.push(`"${line}" ${reason}`);
  };
  flag(spec.hook);
  spec.slides.forEach((slide, index) => {
    if (index === 0) {
      if (slide.headline.trim() !== spec.hook.trim()) flag(slide.headline);
      flag(slide.body);
      return;
    }
    flag(slide.headline, true);
    for (const bullet of slide.body.split(/\s*\|\s*/).slice(1)) flag(bullet);
  });
  return issues;
}
