import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText } from "./shared";

export async function threeRectEducationalTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Inter Tight";
  const overlays: OverlayOptions[] = [];
  const isCover = slide.position === 1 || slide.role.toUpperCase() === "HOOK";

  if (isCover) {
    const title = slide.headline.replace(/^\d+[.)]\s*/, "");
    const titleImage = await rasterText(title, {
      maxLines: 3,
      width: frame.width,
      height: 270,
      size: frame.headlineSize ?? 72,
      weight: frame.headlineWeight ?? 800,
      color: frame.headlineColor ?? "#2b2725",
      align: "center",
      spacing: 2,
      fontFamily: hookFontFamily,
    });
    overlays.push({ input: titleImage, left: frame.x, top: frame.headlineY ?? frame.y });
    const accentImage = await rasterText(slide.body.trim() || "✦ · ✧", {
      width: frame.eduBodyWidth ?? 300,
      height: 48,
      size: frame.bodySize ?? 22,
      weight: 600,
      color: frame.accentColor ?? "#8a6659",
      align: "center",
      spacing: 1,
      fontFamily,
    });
    overlays.push({ input: accentImage, left: frame.eduBodyX ?? 390, top: frame.eduBodyY ?? 735 });
    return overlays;
  }

  // One line when it fits at full size, else two lines at the real width.
  const subjectImage = await rasterText(slide.headline.replace(/^\d+[.)]\s*/, "").trim(), {
    maxLines: 2,
    width: frame.width,
    height: 150,
    size: frame.headlineSize ?? 58,
    weight: frame.headlineWeight ?? 800,
    color: frame.headlineColor ?? "#2b2725",
    align: "center",
    spacing: 0,
    fontFamily: hookFontFamily,
  });
  overlays.push({ input: subjectImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });

  const rawBody = String(slide.body ?? "").trim();
  const parts = rawBody.split("|").map((item) => item.trim()).filter(Boolean);
  const hasExplicitLabel = parts.length > 1;
  const explicitLabel = hasExplicitLabel ? (parts.shift() ?? "") : "";
  const label = (explicitLabel || slide.role || "NOTES").toUpperCase();
  const bullets = (hasExplicitLabel
    ? parts
    : rawBody.split(/(?<=[.!?])\s+|\s*[;•]\s*/).map((item) => item.trim()).filter(Boolean)
  ).slice(0, 5);
  const labelImage = await rasterText(label, {
    width: frame.eduBodyWidth ?? 390,
    height: 46,
    size: 20,
    weight: 800,
    color: frame.accentColor ?? "#8a6659",
    align: "left",
    spacing: 1,
    fontFamily,
  });
  const eduBodyX = frame.bodyX ?? frame.eduBodyX ?? 610;
  const eduBodyY = frame.bodyY ?? frame.eduBodyY ?? 170;
  overlays.push({ input: labelImage, left: eduBodyX, top: eduBodyY });

  const bulletText = bullets.map((bullet) => `• ${bullet}`).join("\n");
  if (bulletText) {
    const bulletImage = await rasterText(bulletText, {
      maxLines: 9,
      preserveLines: true,
      width: frame.eduBodyWidth ?? 390,
      height: 270,
      size: frame.bodySize ?? 25,
      weight: frame.bodyWeight ?? 500,
      color: frame.bodyColor ?? "#2b2725",
      align: "left",
      spacing: 10,
      fontFamily,
    });
    overlays.push({ input: bulletImage, left: eduBodyX, top: eduBodyY + 55 });
  }
  return overlays;
}
