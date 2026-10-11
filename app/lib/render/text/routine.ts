import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText } from "./shared";

// The small line above the cover title. The operator rejected "THAT GIRL"
// on every routine: it now only appears when the hook itself says it, and
// otherwise the kicker says something literal about the routine or is "MY".
export function routineKicker(slide: Pick<GeneratedSlide, "headline" | "body">) {
  const text = `${slide.headline} ${slide.body}`.toLowerCase();
  if (/\bthat girl\b/.test(text)) return "THAT GIRL";
  if (/\bclean girl\b/.test(text)) return "CLEAN GIRL";
  if (/\b(?:college|uni|university|school|class(?:es)?|exams?)\b/.test(text)) return "COLLEGE GIRL";
  if (/\bsunday\b/.test(text)) return "SUNDAY";
  if (/\b(?:work|office|9\s*(?:-|to)\s*5|desk job|shift)\b/.test(text)) return /morning|a\.m\.|before work/.test(text) ? "WORK DAY" : "AFTER WORK";
  if (/\brealistic\b/.test(text)) return "MY REALISTIC";
  if (/\b(?:tired|exhausted|low energy|lazy)\b/.test(text)) return "LOW ENERGY";
  return "MY";
}

export function routineCoverTitle(slide: Pick<GeneratedSlide, "headline">) {
  const text = String(slide.headline ?? "").trim();
  if (/night|bedtime|before bed/i.test(text)) return "NIGHT ROUTINE";
  if (/evening|after work|after class|work-to|wind[ -]?down/i.test(text)) return "EVENING ROUTINE";
  if (/day in (?:my|the) life|day-in-the-life/i.test(text)) return "DAY IN MY LIFE";
  if (/morning|a\.m\.|\bam\b/i.test(text)) return "MORNING ROUTINE";
  if (/lunch/i.test(text)) return "LUNCH BREAK ROUTINE";
  if (/reset/i.test(text)) return "RESET ROUTINE";
  return text.replace(/^(?:my|that girl|realistic)\s+/i, "").toUpperCase().slice(0, 42) || "DAILY ROUTINE";
}

export function routineCopyParts(slide: GeneratedSlide) {
  const source = String(slide.headline ?? "").trim();
  const time = "(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?\\s*(?:AM|PM)?|(?:[01]?\\d|2[0-3])h(?:[0-5]\\d)?";
  const range = new RegExp(`^((?:${time})\\s*(?:-|–|—|→)\\s*(?:${time}))\\s*(?:[·•|:]|\\s{2,})?\\s*(.*)$`, "i");
  const rangeMatch = source.match(range);
  if (rangeMatch) return { time: rangeMatch[1]!.trim().toUpperCase(), headline: rangeMatch[2]!.trim() };
  const single = new RegExp(`^(${time})\\s*(?:[·•|—–-]|:)\\s*(.+)$`, "i");
  const singleMatch = source.match(single);
  if (!singleMatch) return { time: "", headline: source };
  return { time: singleMatch[1]!.trim().toUpperCase(), headline: singleMatch[2]!.trim() };
}

export async function routineTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  // A last step that still carries its time range reads like every other step
  // (a live F03 set "6:35 - 6:40 · eat..." as one bold title).
  const isFinal = (slide.role.toUpperCase() === "CTA" || slide.role.toUpperCase() === "TAKEAWAY") && !routineCopyParts(slide).time;
  const accent = frame.accentColor ?? "#FFE873";
  const overlays: OverlayOptions[] = [];
  // Returns the rendered height so the next block can sit below it.
  const pushShadowed = async (text: string, opts: { left: number; top: number; width: number; height: number; size: number; weight: number; align: "left" | "center" | "right"; fontFamily: string; color?: string; spacing?: number; maxLines?: number }) => {
    const shadow = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: "#171717", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily, maxLines: opts.maxLines });
    const foreground = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: opts.color ?? "#fffaf8", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily, maxLines: opts.maxLines });
    // A soft dark halo under the crisp drop shadow keeps white and pastel
    // text readable on bright photos (TikTok-style text shadow).
    const pad = Math.max(8, Math.round(opts.size / 3));
    const halo = await sharp(shadow)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .blur(Math.max(3, opts.size / 9))
      .png()
      .toBuffer();
    if (opts.left - pad >= 0 && opts.top - pad >= 0) overlays.push({ input: halo, left: opts.left - pad, top: opts.top - pad + 2 });
    overlays.push({ input: shadow, left: opts.left + 3, top: opts.top + 3 });
    overlays.push({ input: foreground, left: opts.left, top: opts.top });
    return (await sharp(foreground).metadata()).height ?? opts.height;
  };

  if (isHook) {
    const kicker = routineKicker(slide);
    await pushShadowed(kicker, {
      color: accent,
      left: frame.routineKickerX ?? 78,
      top: frame.routineKickerY ?? 96,
      width: frame.routineKickerWidth ?? 430,
      height: 70,
      size: frame.routineKickerSize ?? 44,
      weight: 600,
      align: "center",
      fontFamily: "TikTok Sans",
      spacing: 2,
    });
    // Flowed at the real width (a fixed 2 words x 2 lines cut live titles to "HOW I TAKE A…").
    const titleTop = frame.headlineY ?? frame.y;
    const titleHeight = await pushShadowed(routineCoverTitle(slide), {
      maxLines: 3,
      left: frame.headlineX ?? frame.x,
      top: titleTop,
      width: frame.width,
      height: 360,
      size: frame.hookSize ?? 76,
      weight: 800,
      align: "center",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      // Narrower than the title, so center the box under it.
      const contextWidth = Math.min(frame.width, 520);
      await pushShadowed(slide.body.trim(), {
        color: accent,
        maxLines: 2,
        left: frame.bodyX ?? frame.x + Math.round((frame.width - contextWidth) / 2),
        top: Math.max(frame.routineContextY ?? frame.bodyY ?? 365, titleTop + titleHeight + 24),
        width: contextWidth,
        height: 90,
        size: frame.bodySize ?? 32,
        weight: 600,
        align: "center",
        fontFamily,
      });
    }
    return overlays;
  }

  if (isFinal) {
    const headlineTop = frame.headlineY ?? frame.y;
    const headlineHeight = await pushShadowed(slide.headline, {
      maxLines: frame.maxHeadlineLines ?? 3,
      left: frame.headlineX ?? frame.x,
      top: headlineTop,
      width: frame.width,
      height: 230,
      size: frame.headlineSize ?? 58,
      weight: 700,
      align: "center",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      await pushShadowed(slide.body, {
        maxLines: frame.maxBodyLines ?? 3,
        left: frame.bodyX ?? frame.x,
        top: Math.max(frame.bodyY ?? 475, headlineTop + headlineHeight + 24),
        width: frame.width,
        height: 150,
        size: frame.bodySize ?? 30,
        weight: 500,
        align: "center",
        fontFamily,
      });
    }
    return overlays;
  }

  const parts = routineCopyParts(slide);
  if (parts.time) {
    await pushShadowed(parts.time, {
      color: accent,
      left: frame.routineTimeX ?? 390,
      top: frame.routineTimeY ?? 110,
      width: frame.routineTimeWidth ?? 300,
      height: Math.round((frame.routineTimeSize ?? 28) * 1.5),
      size: frame.routineTimeSize ?? 28,
      weight: 600,
      align: "center",
      fontFamily,
    });
  }
  const actionTop = frame.headlineY ?? frame.y;
  const actionHeight = await pushShadowed(parts.headline, {
    maxLines: frame.maxHeadlineLines ?? 2,
    left: frame.headlineX ?? frame.x,
    top: actionTop,
    width: frame.width,
    height: 170,
    size: frame.headlineSize ?? 30,
    weight: 600,
    align: "center",
    fontFamily,
  });
  if (slide.body.trim()) {
    await pushShadowed(slide.body, {
      maxLines: frame.maxBodyLines ?? 2,
      left: frame.bodyX ?? frame.x,
      top: Math.max(frame.bodyY ?? 715, actionTop + actionHeight + 16),
      width: frame.width,
      height: 120,
      size: frame.bodySize ?? 20,
      weight: 400,
      align: "center",
      fontFamily,
    });
  }
  return overlays;
}
