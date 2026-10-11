// Crops driven by where the face (or main subject) is, as measured by the
// vision analysis and stored in assets.metadata.subject_box. Centre crops cut
// faces in F01's 1080x450 bands; sharp's attention strategy framed the sky
// and skin-colour detection took beige sheets for skin.

export type SubjectBox = { kind: "face" | "subject"; left: number; top: number; right: number; bottom: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The stored box, clamped to the image, or null when absent, empty or malformed. */
export function subjectBox(metadata: Record<string, unknown> | null | undefined): SubjectBox | null {
  const raw = metadata?.subject_box as Record<string, unknown> | undefined;
  if (!raw || (raw.kind !== "face" && raw.kind !== "subject")) return null;
  const [left, top, right, bottom] = [raw.left, raw.top, raw.right, raw.bottom].map((value) => clamp01(Number(value)));
  if (![left, top, right, bottom].every(Number.isFinite) || right - left < 0.01 || bottom - top < 0.01) return null;
  return { kind: raw.kind, left: left!, top: top!, right: right!, bottom: bottom! };
}

// Generated persona images are 1728x2160; older rows may lack dimensions.
const DEFAULT_ASPECT = 1728 / 2160;

function aspectOf(asset: { width?: number | null; height?: number | null; orientation?: string | null }) {
  if (asset.width && asset.height) return asset.width / asset.height;
  return asset.orientation === "landscape" ? 1 / DEFAULT_ASPECT : asset.orientation === "square" ? 1 : DEFAULT_ASPECT;
}

/** Fraction of the source height left visible when the image covers a frame. */
export function visibleHeightFraction(sourceAspect: number, frame: { width: number; height: number }) {
  return Math.min(1, (frame.height / frame.width) * sourceAspect);
}

/**
 * False when the face is too tall to fit whole in the frame (a close-up in a
 * wide band always loses the forehead or the chin). Unknown framing passes:
 * the renderer falls back to a centre crop.
 */
export function faceFitsFrame(
  asset: { width?: number | null; height?: number | null; orientation?: string | null; metadata?: Record<string, unknown> | null },
  frame: { width: number; height: number },
) {
  const box = subjectBox(asset.metadata);
  if (!box || box.kind !== "face") return true;
  return box.bottom - box.top <= visibleHeightFraction(aspectOf(asset), frame) * 0.95;
}

/**
 * Crop position (0-100, as fitEditorImage expects) that centres the subject
 * and keeps the whole box inside the frame when it fits. Centre without a box.
 */
export function focusCrop(source: { width: number; height: number }, frame: { width: number; height: number }, box: SubjectBox | null) {
  if (!box) return { cropX: 50, cropY: 50 };
  const scale = Math.max(frame.width / source.width, frame.height / source.height);
  const axis = (size: number, frameSize: number, start: number, end: number) => {
    const scaled = Math.max(frameSize, Math.ceil(size * scale));
    const free = scaled - frameSize;
    if (free <= 0) return 50;
    let offset = ((start + end) / 2) * scaled - frameSize / 2;
    // Keep the whole box in view when it can fit (a face tilted toward the
    // top of its box would otherwise lose the forehead).
    if ((end - start) * scaled <= frameSize) offset = Math.min(start * scaled, Math.max(end * scaled - frameSize, offset));
    return Math.round((Math.min(free, Math.max(0, offset)) / free) * 1000) / 10;
  };
  return {
    cropX: axis(source.width, frame.width, box.left, box.right),
    cropY: axis(source.height, frame.height, box.top, box.bottom),
  };
}

/**
 * How well a photo takes F01's text, which covers most of the middle band:
 * 1 = no person, 0 = a face right under the text. Unknown framing sits in
 * between, so analysed faceless photos win.
 */
export function textFriendliness(asset: { people_visibility?: string | null; metadata?: Record<string, unknown> | null }) {
  const box = subjectBox(asset.metadata);
  const visibility = String(asset.people_visibility ?? "").toLowerCase();
  if (visibility === "no_person") return 1;
  if (box?.kind === "face") return box.left >= 0.6 ? 0.5 : 0;
  if (box?.kind === "subject") return 0.8;
  if (/hand|leg|shadow|partial/.test(visibility)) return 0.8;
  return asset.metadata?.subject_box === null ? 0.9 : 0.4;
}

/** Puts the photo that best takes the text in the middle band (index 1); the others keep their order. */
export function orderLifestyleBands<T extends { asset: Parameters<typeof textFriendliness>[0] }>(matches: T[]): T[] {
  if (matches.length !== 3) return matches;
  const best = matches.reduce((winner, match, index) => textFriendliness(match.asset) > textFriendliness(matches[winner]!.asset) ? index : winner, 1);
  if (best === 1) return matches;
  const rest = matches.filter((_, index) => index !== best);
  return [rest[0]!, matches[best]!, rest[1]!];
}
