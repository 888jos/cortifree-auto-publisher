// Dash punctuation (—, –, " - ") reads as AI-written on TikTok. Hyphens inside
// words ("low-effort") and F03 time ranges ("10:15 - 11:15") are kept.
const TIME_RANGE = /\b\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\b/g;
const DASH = /[—–]|(?:^|\s)-(?:\s|$)/;

export function hasDashPunctuation(text: string) {
  return DASH.test(text.replace(TIME_RANGE, ""));
}

/** Replaces dash punctuation with the comma or colon a person would type. */
export function stripDashPunctuation(text: string) {
  const ranges: string[] = [];
  const masked = text.replace(TIME_RANGE, (range) => `\u0000${ranges.push(range) - 1}\u0000`);
  const cleaned = masked
    // "before — the thing" → "before: the thing" (a short label then a dash)
    .replace(/^(\s*[^\s—–]+(?:\s[^\s—–]+)?)\s*[—–]\s*/u, "$1: ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/(^|\s)-(\s|$)/g, (_, before: string) => (before ? ", " : ""))
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[,\s]+|[,\s]+$/g, "");
  return cleaned.replace(/\u0000(\d+)\u0000/g, (_, index: string) => ranges[Number(index)]!);
}
