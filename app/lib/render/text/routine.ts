import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrapHook } from "./shared";

function routineKicker(slide: GeneratedSlide) {
  const text = `${slide.headline} ${slide.body}`.toLowerCase();
  if (/college|school|class/.test(text)) return "COLLEGE GIRL";
  if (/sunday/.test(text)) return "SUNDAY";
  if (/realistic/.test(text)) return "MY REALISTIC";
  return "THAT GIRL";
}

function routineCoverTitle(slide: GeneratedSlide) {
  const text = String(slide.headline ?? "").trim();
  if (/night|bedtime|evening/i.test(text)) return "NIGHT ROUTINE";
  if (/day in (?:my|the) life|day-in-the-life/i.test(text)) return "DAY IN MY LIFE";
  if (/morning|a\.m\.|\bam\b/i.test(text)) return "MORNING ROUTINE";
  if (/reset/i.test(text)) return "RESET ROUTINE";
  return text.replace(/^(?:my|that girl|realistic)\s+/i, "").toUpperCase().slice(0, 42) || "DAILY ROUTINE";
}

function routineCopyParts(slide: GeneratedSlide) {
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
  const isFinal = slide.role.toUpperCase() === "CTA" || slide.role.toUpperCase() === "TAKEAWAY";
  const overlays: OverlayOptions[] = [];
  // Returns the rendered height so the next block can sit below it.
  const pushShadowed = async (text: string, opts: { left: number; top: number; width: number; height: number; size: number; weight: number; align: "left" | "center" | "right"; fontFamily: string; color?: string; spacing?: number; maxLines?: number }) => {
    const shadow = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: "#171717", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily, maxLines: opts.maxLines });
    const foreground = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: opts.color ?? "#fffaf8", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily, maxLines: opts.maxLines });
    overlays.push({ input: shadow, left: opts.left + 3, top: opts.top + 3 });
    overlays.push({ input: foreground, left: opts.left, top: opts.top });
    return (await sharp(foreground).metadata()).height ?? opts.height;
  };

  if (isHook) {
    const kicker = routineKicker(slide);
    await pushShadowed(kicker, {
      left: frame.routineKickerX ?? 78,
      top: frame.routineKickerY ?? 96,
      width: frame.routineKickerWidth ?? 430,
      height: 70,
      size: frame.routineKickerSize ?? 44,
      weight: 400,
      align: "center",
      fontFamily: "TikTok Sans",
      spacing: 2,
    });
    const lines = wrapHook(routineCoverTitle(slide), 2, 2).join("\n");
    await pushShadowed(lines, {
      left: frame.headlineX ?? frame.x,
      top: frame.headlineY ?? frame.y,
      width: frame.width,
      height: 240,
      size: frame.hookSize ?? 76,
      weight: 800,
      align: "center",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      // Narrower than the title, so center the box under it.
      const contextWidth = Math.min(frame.width, 520);
      await pushShadowed(slide.body.trim(), {
        maxLines: 2,
        left: frame.bodyX ?? frame.x + Math.round((frame.width - contextWidth) / 2),
        top: frame.routineContextY ?? frame.bodyY ?? 365,
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
