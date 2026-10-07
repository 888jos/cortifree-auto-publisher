import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrap } from "./shared";

function fitEducationalHeadline(value: string, width: number, preferredSize: number) {
  const text = value.replace(/^\d+[.)]\s*/, "").trim();
  const estimateCapacity = (size: number) => Math.max(8, Math.floor(width / (size * 0.56)));
  for (let size = preferredSize; size >= 42; size -= 2) {
    if (text.length <= estimateCapacity(size)) return { text, size, lines: 1 };
  }
  for (let size = Math.min(preferredSize, 54); size >= 40; size -= 2) {
    const wrapped = wrap(text, estimateCapacity(size), 2);
    if (wrapped.length <= 2 && !wrapped.some((line) => line.endsWith("…"))) {
      return { text: wrapped.join("\n"), size, lines: wrapped.length };
    }
  }
  return { text: wrap(text, estimateCapacity(40), 2).join("\n"), size: 40, lines: 2 };
}

export async function threeRectEducationalTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Inter Tight";
  const overlays: OverlayOptions[] = [];
  const isCover = slide.position === 1 || slide.role.toUpperCase() === "HOOK";

  if (isCover) {
    const title = wrap(slide.headline.replace(/^\d+[.)]\s*/, ""), 22, 3).join("\n");
    const titleImage = await rasterText(title, {
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

  const fittedSubject = fitEducationalHeadline(slide.headline, frame.width, frame.headlineSize ?? 58);
  const subjectImage = await rasterText(fittedSubject.text, {
    width: frame.width,
    height: fittedSubject.lines === 1 ? 90 : 150,
    size: fittedSubject.size,
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
