import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrap, wrapHook } from "./shared";

export async function editorialAsymTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const kicker = await rasterText("THE EDIT", {
      width: frame.editorialKickerWidth ?? 300,
      height: 34,
      size: frame.editorialKickerSize ?? 18,
      weight: 700,
      color: frame.bodyColor ?? "#3f3631",
      align: "left",
      spacing: 1,
      fontFamily,
    });
    overlays.push({
      input: kicker,
      left: frame.editorialKickerX ?? 74,
      top: frame.editorialKickerY ?? 90,
    });

    const hook = wrapHook(slide.headline.toLowerCase(), 4, 3).join("\n");
    const hookImage = await rasterText(hook, {
      width: frame.width,
      height: 220,
      size: frame.hookSize ?? 58,
      weight: frame.headlineWeight ?? 700,
      color: frame.headlineColor ?? "#241f1c",
      align: "left",
      spacing: 0,
      fontFamily: hookFontFamily,
    });
    overlays.push({ input: hookImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });

    if (slide.body.trim()) {
      const context = wrap(slide.body.trim(), 38, frame.maxBodyLines ?? 3).join("\n");
      const contextImage = await rasterText(context, {
        width: frame.width,
        height: 120,
        size: frame.bodySize ?? 26,
        weight: frame.bodyWeight ?? 500,
        color: frame.bodyColor ?? "#3f3631",
        align: "left",
        spacing: 2,
        fontFamily,
      });
      overlays.push({ input: contextImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 990 });
    }
    return overlays;
  }

  const headline = wrap(slide.headline.replace(/^\d+[.)]\s*/, ""), 28, frame.maxHeadlineLines ?? 2).join("\n");
  const headlineImage = await rasterText(headline, {
    width: frame.width,
    height: 115,
    size: frame.headlineSize ?? 44,
    weight: frame.headlineWeight ?? 700,
    color: frame.headlineColor ?? "#241f1c",
    align: "left",
    spacing: 0,
    fontFamily: hookFontFamily,
  });
  overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 960 });

  if (slide.body.trim()) {
    const body = wrap(slide.body.trim(), 44, frame.maxBodyLines ?? 4).join("\n");
    const bodyImage = await rasterText(body, {
      width: frame.width,
      height: 170,
      size: frame.bodySize ?? 26,
      weight: frame.bodyWeight ?? 500,
      color: frame.bodyColor ?? "#3f3631",
      align: "left",
      spacing: 2,
      fontFamily,
    });
    overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 1075 });
  }
  return overlays;
}
