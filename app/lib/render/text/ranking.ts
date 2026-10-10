import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import sharp from "sharp";
import { FONT_FILES, rasterText } from "./shared";

export function rankingCopyParts(slide: GeneratedSlide) {
  const source = String(slide.headline ?? "").trim();
  const rating = source.match(/\b(10(?:\.0)?|[0-9](?:\.\d)?)\s*\/\s*10\b/i);
  const explicitTier = source.match(/\b(?:tier|grade|rank)\s*[:\-]?\s*(SS|[SABCDF][+-]?)\b/i);
  const prefixTier = source.match(/^(SS|[SABCDF][+-]?)\s*[·•|—–:\-]/i);
  const score = rating ? `${rating[1]}/10` : (explicitTier?.[1] ?? prefixTier?.[1] ?? "").toUpperCase();
  const item = source
    .replace(/\b(10(?:\.0)?|[0-9](?:\.\d)?)\s*\/\s*10\b/gi, "")
    .replace(/\b(?:tier|grade|rank)\s*[:\-]?\s*(?:SS|[SABCDF][+-]?)\b/gi, "")
    .replace(/^(?:SS|[SABCDF][+-]?)\s*[·•|—–:\-]\s*/i, "")
    .replace(/^[\s·•|—–:\-]+|[\s·•|—–:\-]+$/g, "")
    .trim();
  return { score, item: item || source };
}

export async function rankingTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const isFinal = new Set(["CTA", "TAKEAWAY"]).has(slide.role.toUpperCase());
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const hook = slide.headline.toLowerCase();
    const hookImage = await rasterText(hook, { maxLines: 3,
      width: frame.width, height: 235, size: frame.hookSize ?? 68, weight: 800,
      color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily: hookFontFamily,
    });
    overlays.push({ input: hookImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 120 });
    if (slide.body.trim()) {
      const body = slide.body.trim();
      const bodyImage = await rasterText(body, { maxLines: frame.maxBodyLines ?? 2,
        width: frame.width, height: 105, size: frame.bodySize ?? 29, weight: 500,
        color: frame.bodyColor ?? "#4b4145", align: "center", spacing: 2, fontFamily,
      });
      overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 305 });
    }
    return overlays;
  }

  if (isFinal) {
    const headline = slide.headline;
    const headlineImage = await rasterText(headline, { maxLines: frame.maxHeadlineLines ?? 3,
      width: frame.width, height: 220, size: frame.headlineSize ?? 58, weight: 800,
      color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily: hookFontFamily,
    });
    overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 390 });
    if (slide.body.trim()) {
      const body = slide.body.trim();
      const bodyImage = await rasterText(body, { maxLines: frame.maxBodyLines ?? 5,
        width: frame.width, height: 220, size: frame.bodySize ?? 31, weight: 500,
        color: frame.bodyColor ?? "#4b4145", align: "center", spacing: 5, fontFamily,
      });
      overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 600 });
    }
    return overlays;
  }

  const { score, item } = rankingCopyParts(slide);
  const tierLabel = score ? `${score} TIER` : "TIER";
  const tierImage = await rasterText(tierLabel, {
    width: frame.rankingScoreWidth ?? 930, height: 100, size: frame.rankingScoreSize ?? 68, weight: 850,
    color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily: hookFontFamily,
  });
  overlays.push({ input: tierImage, left: frame.rankingScoreX ?? 100, top: frame.rankingScoreY ?? 105 });

  const itemText = item.toUpperCase();
  const itemImage = await rasterText(itemText, { maxLines: frame.maxHeadlineLines ?? 2,
    width: frame.width, height: 140, size: frame.headlineSize ?? 42, weight: 800,
    color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily,
  });
  const itemTop = frame.headlineY ?? 335;
  overlays.push({ input: itemImage, left: frame.headlineX ?? frame.x, top: itemTop });
  // A two-line item must push the reason down instead of overlapping it.
  const itemHeight = (await sharp(itemImage).metadata()).height ?? 0;

  if (slide.body.trim()) {
    const paragraphs = slide.body.split(/\n+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
    const reason = paragraphs.join("\n\n");
    const reasonImage = await rasterText(reason, { maxLines: 5,
      width: frame.width, height: 300, size: frame.bodySize ?? 28, weight: 500,
      color: frame.bodyColor ?? "#4b4145", align: "center", spacing: 5, fontFamily,
    });
    overlays.push({ input: reasonImage, left: frame.bodyX ?? frame.x, top: Math.max(frame.bodyY ?? 505, itemTop + itemHeight + 28) });
  }
  return overlays;
}
