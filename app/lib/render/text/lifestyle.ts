import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrap } from "./shared";

export async function lifestyleThreeStackTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];
  const pushShadowed = async (value: string, left: number, top: number, size: number, weight: number, family: string, maxChars: number, maxLines: number) => {
    const copy = wrap(value, maxChars, maxLines).join("\n");
    const height = Math.max(70, Math.ceil(size * 1.28 * maxLines));
    const shadow = await rasterText(copy, { width: frame.width, height, size, weight, color: "#191713", align: "left", spacing: 1, fontFamily: family });
    const text = await rasterText(copy, { width: frame.width, height, size, weight, color: "#fff0a6", align: "left", spacing: 1, fontFamily: family });
    overlays.push({ input: shadow, left: left + 3, top: top + 3 });
    overlays.push({ input: text, left, top });
  };
  await pushShadowed(slide.headline.toLowerCase(), frame.headlineX ?? frame.x, frame.headlineY ?? frame.y, frame.headlineSize ?? 43, 700, isHook ? hookFontFamily : fontFamily, isHook ? 24 : 30, frame.maxHeadlineLines ?? 2);
  if (slide.body.trim()) {
    await pushShadowed(slide.body.trim(), frame.bodyX ?? frame.x, frame.bodyY ?? 735, frame.bodySize ?? 27, 550, fontFamily, isHook ? 46 : 48, frame.maxBodyLines ?? 4);
  }
  return overlays;
}
