// Dash punctuation (—, –, " - ") reads as AI-written on TikTok. Hyphens inside
// words ("low-effort") and F03 time ranges ("10:15 - 11:15") are kept. A dash
// starting a line is a list bullet, not punctuation: the marker goes, the line
// stays (joining the lines turned an F05 list into a single item).
const TIME_RANGE = /\b\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\b/g;
const BULLET = /^[ \t]*[-–—•][ \t]+/gm;
const DASH = /[—–]|(?:^|[ \t])-(?:[ \t]|$)/m;

export function hasDashPunctuation(text: string) {
  return DASH.test(text.replace(TIME_RANGE, "").replace(BULLET, ""));
}

/** Replaces dash punctuation with the comma or colon a person would type. */
export function stripDashPunctuation(text: string) {
  const ranges: string[] = [];
  const masked = text.replace(TIME_RANGE, (range) => `\u0000${ranges.push(range) - 1}\u0000`).replace(BULLET, "");
  const cleaned = masked
    .split("\n")
    .map((line) => line
      // "before — the thing" → "before: the thing" (a short label then a dash)
      .replace(/^([ \t]*[^\s—–]+(?:[ \t][^\s—–]+)?)[ \t]*[—–][ \t]*/u, "$1: ")
      .replace(/[ \t]*[—–][ \t]*/g, ", ")
      .replace(/(^|[ \t])-([ \t]|$)/g, (_, before: string) => (before ? ", " : ""))
      .replace(/[ \t]+,/g, ",")
      .replace(/,[ \t]*,/g, ",")
      .replace(/^[,\s]+|[,\s]+$/g, ""))
    .join("\n")
    .trim();
  return cleaned.replace(/\u0000(\d+)\u0000/g, (_, index: string) => ranges[Number(index)]!);
}
