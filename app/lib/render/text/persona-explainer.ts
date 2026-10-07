import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrap } from "./shared";

export async function personaExplainerTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];
  const shadowed = async (value: string, opts: { left: number; top: number; width: number; height: number; size: number; weight: number; family: string; align?: "left" | "center" | "right"; color?: string }) => {
    const shadow = await rasterText(value, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: "#15110f", align: opts.align ?? "left", spacing: 2, fontFamily: opts.family });
    const foreground = await rasterText(value, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: opts.color ?? "#fffaf8", align: opts.align ?? "left", spacing: 2, fontFamily: opts.family });
    overlays.push({ input: shadow, left: opts.left + 3, top: opts.top + 3 });
    overlays.push({ input: foreground, left: opts.left, top: opts.top });
  };

  const headline = wrap(slide.headline, isHook ? 22 : 30, frame.maxHeadlineLines ?? (isHook ? 3 : 2)).join("\n");
  await shadowed(headline, {
    left: frame.headlineX ?? frame.x,
    top: frame.headlineY ?? frame.y,
    width: frame.width,
    height: Math.max(120, Math.round((frame.headlineSize ?? 48) * 1.25 * (frame.maxHeadlineLines ?? 3))),
    size: frame.headlineSize ?? 48,
    weight: frame.headlineWeight ?? 800,
    family: isHook ? hookFontFamily : fontFamily,
    color: frame.headlineColor ?? "#fffaf8",
  });

  const raw = String(slide.body ?? "").trim();
  if (!raw) return overlays;
  const observations = raw.includes("|")
    ? raw.split("|").map((item) => item.trim()).filter(Boolean)
    : raw.split(/(?<=[.!?])\s+|\s*[;•]\s*/).map((item) => item.trim()).filter(Boolean);
  const body = observations.slice(0, isHook ? 2 : 4).map((item) => isHook ? item : "• " + item).join("\n");
  await shadowed(body, {
    left: frame.bodyX ?? frame.x,
    top: frame.bodyY ?? ((frame.headlineY ?? frame.y) + 190),
    width: frame.width,
    height: isHook ? 170 : 300,
    size: frame.bodySize ?? 27,
    weight: frame.bodyWeight ?? 550,
    family: fontFamily,
    color: frame.bodyColor ?? "#fffaf8",
  });
  return overlays;
}
