import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, HEIGHT, WIDTH, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, outlineText, rasterText } from "./shared";

// F08 body slides: white headline + one pastel accent line, both with a black
// outline, placed over the calmest band of the 2x2 photos. A fixed spot put
// "wear one outfit formula" on a busy closet photo where nobody could read it.

export type GridTile = { left: number; top: number; width: number; height: number; hasPerson: boolean };

/** Horizontal seam between the two photo rows: text never straddles it. */
const SEAM_Y = HEIGHT / 2;
const SEAM_MARGIN = 28;
/** TikTok's top bar and bottom caption/buttons cover these bands. */
const TOP_SAFE = 96;
const BOTTOM_SAFE = 1190;

// Rough RGB skin test (Kovac et al.). Only applied inside photos that show a
// person, so a face is never mistaken for a calm, smooth area.
function isSkin(r: number, g: number, b: number) {
  return r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && Math.abs(r - g) > 15 && r > g && r > b;
}

/**
 * Picks the top of a `blockHeight` text block (columns x..x+width) where the
 * photos are calmest: fewest edges, no skin of a person tile, never across
 * the seam between the two rows and inside the TikTok safe zone.
 */
export async function calmestTextTop(photo: Buffer, tiles: GridTile[], x: number, width: number, blockHeight: number) {
  const scale = 4;
  const { data, info } = await sharp(photo)
    .resize({ width: WIDTH / scale, height: Math.round(HEIGHT / scale), fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const luma = new Float32Array(w * h);
  for (let index = 0; index < w * h; index += 1) {
    const offset = index * info.channels;
    luma[index] = data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722;
  }
  const personTiles = tiles.filter((tile) => tile.hasPerson);
  const x0 = Math.max(0, Math.floor(x / scale));
  const x1 = Math.min(w, Math.ceil((x + width) / scale));
  const rowCost = new Float32Array(h);
  for (let row = 0; row < h; row += 1) {
    let sum = 0;
    for (let column = x0; column < x1; column += 1) {
      const index = row * w + column;
      const value = luma[index]!;
      const gradient = (column > 0 ? Math.abs(value - luma[index - 1]!) : 0) + (row > 0 ? Math.abs(value - luma[index - w]!) : 0);
      let cost = gradient;
      const offset = index * info.channels;
      if (personTiles.length && isSkin(data[offset]!, data[offset + 1]!, data[offset + 2]!)) {
        const px = column * scale;
        const py = row * scale;
        if (personTiles.some((tile) => px >= tile.left && px < tile.left + tile.width && py >= tile.top && py < tile.top + tile.height)) cost += 45;
      }
      sum += cost;
    }
    rowCost[row] = sum / Math.max(1, x1 - x0);
  }
  const ranges = [
    [TOP_SAFE, SEAM_Y - SEAM_MARGIN - blockHeight],
    [SEAM_Y + SEAM_MARGIN, BOTTOM_SAFE - blockHeight],
  ].filter(([min, max]) => max! >= min!) as Array<[number, number]>;
  // A block taller than a photo row: centre it, nothing better exists.
  if (!ranges.length) return Math.max(TOP_SAFE, Math.round((HEIGHT - blockHeight) / 2));
  let best = { top: ranges[0]![0], cost: Number.POSITIVE_INFINITY };
  for (const [min, max] of ranges) {
    for (let top = min; top <= max; top += 8) {
      const first = Math.floor(top / scale);
      const last = Math.min(h, Math.ceil((top + blockHeight) / scale));
      let sum = 0;
      for (let row = first; row < last; row += 1) sum += rowCost[row]!;
      const cost = sum / Math.max(1, last - first);
      if (cost < best.cost - 0.01) best = { top, cost };
    }
  }
  return best.top;
}

type RasterOptions = Parameters<typeof rasterText>[1];

/**
 * Centered text with even lines: the narrowest width that keeps the same
 * line count, so a body never ends on one lonely word ("... done in 3 / min").
 * Padded back to the frame width so it stays centered.
 */
async function balancedText(text: string, options: RasterOptions) {
  const height = async (buffer: Buffer) => (await sharp(buffer).metadata()).height ?? 0;
  const base = await rasterText(text, options);
  const baseHeight = await height(base);
  // Only when nothing was shrunk to fit: then height is a line count.
  const unbounded = { ...options, maxLines: 8 };
  // Glyph extents move the height by a pixel or two; a new line adds a whole one.
  const slack = Math.round(options.size * 0.5);
  if (Math.abs((await height(await rasterText(text, unbounded))) - baseHeight) > slack) return base;
  let best = base;
  let bestWidth = options.width;
  for (let width = options.width - 40; width >= Math.round(options.width * 0.55); width -= 40) {
    const candidate = await rasterText(text, { ...unbounded, width });
    if ((await height(candidate)) > baseHeight + slack) break;
    best = candidate;
    bestWidth = width;
  }
  if (bestWidth === options.width) return best;
  const left = Math.floor((options.width - bestWidth) / 2);
  return sharp(best).extend({ left, right: options.width - bestWidth - left, top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

export async function gridTextOverlays(slide: GeneratedSlide, geometry: Geometry, photo: Buffer, tiles: GridTile[]): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const stroke = Math.max(2, Math.round(frame.textStroke ?? 6));
  const headlineSize = frame.headlineSize ?? 58;
  const bodySize = frame.bodySize ?? 36;
  const width = frame.width;
  const left = frame.x;
  const align = frame.align ?? "center";
  const headline = await outlineText(await balancedText(slide.headline.replace(/^\d+[.)]\s*/, ""), {
    maxLines: frame.maxHeadlineLines ?? 3, width, height: headlineSize * 4, size: headlineSize,
    weight: frame.headlineWeight ?? 700, color: frame.headlineColor ?? "#ffffff", align, spacing: Math.round(headlineSize * 0.08), fontFamily,
  }), stroke);
  const headlineHeight = ((await sharp(headline).metadata()).height ?? 0) - stroke * 2;
  const body = slide.body.trim()
    ? await outlineText(await balancedText(slide.body.trim(), {
        maxLines: frame.maxBodyLines ?? 3, width, height: bodySize * 4, size: bodySize,
        weight: frame.bodyWeight ?? 600, color: frame.bodyColor ?? frame.accentColor ?? "#ffd6e5", align, spacing: Math.round(bodySize * 0.12), fontFamily,
      }), Math.max(2, stroke - 1))
    : undefined;
  const bodyStroke = Math.max(2, stroke - 1);
  const bodyHeight = body ? ((await sharp(body).metadata()).height ?? 0) - bodyStroke * 2 : 0;
  const gap = body ? Math.round(bodySize * 0.55) : 0;
  const top = await calmestTextTop(photo, tiles, left, width, headlineHeight + gap + bodyHeight);
  const overlays: OverlayOptions[] = [{ input: headline, left: left - stroke, top: top - stroke }];
  if (body) overlays.push({ input: body, left: left - bodyStroke, top: top + headlineHeight + gap - bodyStroke });
  return overlays;
}
