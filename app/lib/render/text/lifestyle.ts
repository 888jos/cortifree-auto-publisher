import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText } from "./shared";

export async function lifestyleThreeStackTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];
  // Returns the rendered height so the body can sit below the headline.
  const pushShadowed = async (value: string, left: number, top: number, size: number, weight: number, family: string, maxLines: number) => {
    const height = Math.max(70, Math.ceil(size * 1.28 * maxLines));
    const shadow = await rasterText(value, { width: frame.width, height, size, weight, color: "#191713", align: "left", spacing: 1, fontFamily: family, maxLines });
    const text = await rasterText(value, { width: frame.width, height, size, weight, color: "#fff0a6", align: "left", spacing: 1, fontFamily: family, maxLines });
    overlays.push({ input: shadow, left: left + 3, top: top + 3 });
    overlays.push({ input: text, left, top });
    return (await sharp(text).metadata()).height ?? height;
  };
  const headlineTop = frame.headlineY ?? frame.y;
  const headlineHeight = await pushShadowed(slide.headline.toLowerCase(), frame.headlineX ?? frame.x, headlineTop, frame.headlineSize ?? 43, 700, isHook ? hookFontFamily : fontFamily, frame.maxHeadlineLines ?? 2);
  if (slide.body.trim()) {
    await pushShadowed(slide.body.trim(), frame.bodyX ?? frame.x, Math.max(frame.bodyY ?? 735, headlineTop + headlineHeight + 18), frame.bodySize ?? 27, 550, fontFamily, frame.maxBodyLines ?? 4);
  }
  return overlays;
}
