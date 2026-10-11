import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import sharp from "sharp";
import { FONT_FILES, rasterText } from "./shared";
import { RANKING_LADDER, rankingPalette, readableTextColor, type RankingPalette } from "../ranking-palette";

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

async function heightOf(image: Buffer) {
  return (await sharp(image).metadata()).height ?? 0;
}

/** The F → S tier ladder: small colored squares, the cover's and final slide's accent. */
async function tierLadder(top: number): Promise<OverlayOptions> {
  const chip = 84;
  const gap = 14;
  const width = RANKING_LADDER.length * chip + (RANKING_LADDER.length - 1) * gap;
  const chips = RANKING_LADDER.map(({ tier, color }, index) => {
    const x = index * (chip + gap);
    return `<rect x="${x}" y="0" width="${chip}" height="${chip}" rx="22" ry="22" fill="${color}"/>`;
  }).join("");
  const svg = Buffer.from(`<svg width="${width}" height="${chip}" xmlns="http://www.w3.org/2000/svg">${chips}</svg>`);
  const letters: OverlayOptions[] = [];
  for (const [index, { tier, color }] of RANKING_LADDER.entries()) {
    const letter = await rasterText(tier, { width: chip, height: chip, size: 46, weight: 850, color: readableTextColor(color), align: "center", spacing: 0, fontFamily: "Bricolage Grotesque", maxLines: 1 });
    const letterHeight = await heightOf(letter);
    letters.push({ input: letter, left: index * (chip + gap), top: Math.max(0, Math.round((chip - letterHeight) / 2)) });
  }
  const ladder = await sharp(svg).composite(letters).png().toBuffer();
  return { input: ladder, left: Math.round((1080 - width) / 2), top };
}

/** Pastel rounded badge holding the tier label ("S TIER"), centred on the slide. */
async function tierBadge(label: string, top: number, size: number, palette: RankingPalette, fontFamily: string): Promise<OverlayOptions[]> {
  const text = await rasterText(label, { width: 900, height: Math.round(size * 1.4), size, weight: 850, color: palette.accentText, align: "left", spacing: 0, fontFamily, maxLines: 1 });
  const meta = await sharp(text).metadata();
  const textWidth = meta.width ?? 300;
  const textHeight = meta.height ?? size;
  const width = textWidth + 110;
  const height = Math.round(size * 1.62);
  const left = Math.round((1080 - width) / 2);
  const pill = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${Math.round(height / 2)}" ry="${Math.round(height / 2)}" fill="${palette.accent}"/></svg>`);
  return [
    { input: pill, left, top },
    { input: text, left: left + 55, top: top + Math.round((height - textHeight) / 2) },
  ];
}

export async function rankingTextOverlays(
  slide: GeneratedSlide,
  geometry: Geometry,
  options: { photoCount?: number; palette?: RankingPalette } = {},
): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const isFinal = new Set(["CTA", "TAKEAWAY"]).has(slide.role.toUpperCase());
  const palette = options.palette ?? rankingPalette({ tier: rankingCopyParts(slide).score, cover: isHook, final: isFinal });
  const headlineColor = frame.headlineColor ?? palette.text;
  const bodyColor = frame.bodyColor ?? palette.subtext;
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const hook = slide.headline.toLowerCase();
    const hookSize = frame.hookSize ?? 74;
    const hookImage = await rasterText(hook, { maxLines: frame.maxHeadlineLines ?? 3,
      width: frame.width, height: Math.round(hookSize * 1.3 * 3), size: hookSize, weight: 800,
      color: headlineColor, align: "center", spacing: 0, fontFamily: hookFontFamily,
    });
    const hookTop = frame.headlineY ?? 92;
    overlays.push({ input: hookImage, left: frame.headlineX ?? frame.x, top: hookTop });
    let next = hookTop + await heightOf(hookImage) + 26;
    if (slide.body.trim()) {
      const bodyImage = await rasterText(slide.body.trim(), { maxLines: frame.maxBodyLines ?? 2,
        width: frame.width, height: 105, size: frame.bodySize ?? 36, weight: 600,
        color: bodyColor, align: "center", spacing: 2, fontFamily,
      });
      overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: next });
      next += await heightOf(bodyImage) + 26;
    }
    // The ladder sits between the title and the photos, when there is room.
    const ladderTop = frame.rankingLadderY || next + 8;
    if (!options.photoCount || ladderTop + 84 + 24 <= (frame.rankingPhotoY ?? 540)) overlays.push(await tierLadder(ladderTop));
    return overlays;
  }

  // Without photos the block moves down so the slide is not top-heavy.
  const shift = options.photoCount ? 0 : (frame.rankingTextOnlyShift ?? 200);

  if (isFinal) {
    overlays.push(await tierLadder((frame.rankingLadderY ?? 96) + shift));
    const headlineImage = await rasterText(slide.headline, { maxLines: frame.maxHeadlineLines ?? 2,
      width: frame.width, height: Math.round((frame.headlineSize ?? 66) * 1.35 * (frame.maxHeadlineLines ?? 2)), size: frame.headlineSize ?? 66, weight: 800,
      color: headlineColor, align: "center", spacing: 0, fontFamily: hookFontFamily,
    });
    const headlineTop = (frame.headlineY ?? 220) + shift;
    overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: headlineTop });
    if (slide.body.trim()) {
      const bodyImage = await rasterText(slide.body.trim(), { maxLines: frame.maxBodyLines ?? 5,
        width: frame.width, height: Math.round((frame.bodySize ?? 42) * 1.45 * (frame.maxBodyLines ?? 4)), size: frame.bodySize ?? 42, weight: 500,
        color: bodyColor, align: "center", spacing: 6, fontFamily,
      });
      overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: Math.max((frame.bodyY ?? 400) + shift, headlineTop + await heightOf(headlineImage) + 30) });
    }
    return overlays;
  }

  const { score, item } = rankingCopyParts(slide);
  const tierLabel = score ? `${score} TIER` : "TIER";
  const badgeTop = (frame.rankingScoreY ?? 96) + shift;
  overlays.push(...await tierBadge(tierLabel, badgeTop, frame.rankingScoreSize ?? 92, palette, hookFontFamily));

  const itemText = item.toUpperCase();
  const itemImage = await rasterText(itemText, { maxLines: frame.maxHeadlineLines ?? 2,
    width: frame.width, height: Math.round((frame.headlineSize ?? 60) * 1.35 * (frame.maxHeadlineLines ?? 2)), size: frame.headlineSize ?? 60, weight: 800,
    color: headlineColor, align: "center", spacing: 0, fontFamily: hookFontFamily,
  });
  const itemTop = (frame.headlineY ?? 290) + shift;
  overlays.push({ input: itemImage, left: frame.headlineX ?? frame.x, top: itemTop });
  // A two-line item pushes the reason down instead of overlapping it.
  const itemHeight = await heightOf(itemImage);

  if (slide.body.trim()) {
    const paragraphs = slide.body.split(/\n+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
    const reason = paragraphs.join("\n\n");
    const reasonImage = await rasterText(reason, { maxLines: frame.maxBodyLines ?? 5,
      width: frame.width, height: Math.round((frame.bodySize ?? 38) * 1.45 * (frame.maxBodyLines ?? 5)), size: frame.bodySize ?? 38, weight: 500,
      color: bodyColor, align: "center", spacing: 6, fontFamily,
    });
    overlays.push({ input: reasonImage, left: frame.bodyX ?? frame.x, top: Math.max((frame.bodyY ?? 470) + shift, itemTop + itemHeight + 26) });
  }
  return overlays;
}
