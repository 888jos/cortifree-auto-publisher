import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrap, wrapHook } from "./shared";

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
  const pushShadowed = async (text: string, opts: { left: number; top: number; width: number; height: number; size: number; weight: number; align: "left" | "center" | "right"; fontFamily: string; color?: string; spacing?: number }) => {
    const shadow = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: "#171717", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily });
    const foreground = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: opts.color ?? "#fffaf8", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily });
    overlays.push({ input: shadow, left: opts.left + 3, top: opts.top + 3 });
    overlays.push({ input: foreground, left: opts.left, top: opts.top });
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
      await pushShadowed(slide.body.trim(), {
        left: frame.bodyX ?? frame.x,
        top: frame.routineContextY ?? frame.bodyY ?? 365,
        width: Math.min(frame.width, 520),
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
    const headline = wrap(slide.headline, 24, frame.maxHeadlineLines ?? 3).join("\n");
    await pushShadowed(headline, {
      left: frame.headlineX ?? frame.x,
      top: frame.headlineY ?? frame.y,
      width: frame.width,
      height: 230,
      size: frame.headlineSize ?? 58,
      weight: 700,
      align: "center",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      const body = wrap(slide.body, 42, frame.maxBodyLines ?? 3).join("\n");
      await pushShadowed(body, {
        left: frame.bodyX ?? frame.x,
        top: frame.bodyY ?? 475,
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
      height: 58,
      size: frame.routineTimeSize ?? 28,
      weight: 600,
      align: "center",
      fontFamily,
    });
  }
  const action = wrap(parts.headline, 24, frame.maxHeadlineLines ?? 2).join("\n");
  await pushShadowed(action, {
    left: frame.headlineX ?? frame.x,
    top: frame.headlineY ?? frame.y,
    width: frame.width,
    height: 170,
    size: frame.headlineSize ?? 30,
    weight: 600,
    align: "center",
    fontFamily,
  });
  if (slide.body.trim()) {
    const support = wrap(slide.body, 46, frame.maxBodyLines ?? 2).join("\n");
    await pushShadowed(support, {
      left: frame.bodyX ?? frame.x,
      top: frame.bodyY ?? 715,
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
