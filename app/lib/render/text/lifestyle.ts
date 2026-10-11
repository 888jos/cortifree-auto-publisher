import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText } from "./shared";

// Operator rule (all formats): white text plus ONE pastel accent. The
// headline carries the accent, the body stays white.
export const LIFESTYLE_ACCENT = "#ffe27a";
const WHITE = "#ffffff";

// Body slides: the text sits on the middle band (y 450-900).
const BAND_TOP = 450;
const BAND_HEIGHT = 450;

/** Text with a soft blurred shadow (a hard offset copy was unreadable on busy photos). */
async function shadowed(text: Buffer) {
  const { width = 1, height = 1 } = await sharp(text).metadata();
  const pad = 24;
  const alpha = await sharp(text).extractChannel(3).raw().toBuffer();
  const black = await sharp({ create: { width, height, channels: 3, background: "#000000" } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
  const halo = await sharp(black).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(9).linear([1, 1, 1, 0.75], [0, 0, 0, 0]).png().toBuffer();
  const tight = await sharp(black).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(2).linear([1, 1, 1, 0.55], [0, 0, 0, 0]).png().toBuffer();
  return { halo, tight, pad, width, height };
}

/**
 * Darkens the photo under the text so white type stays readable on bright
 * scenes (beds, windows), strongest on the left where the text starts.
 */
function scrim(width: number, height: number, from: number, to: number) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#000" stop-opacity="${from}"/><stop offset="100%" stop-color="#000" stop-opacity="${to}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/></svg>`);
}

function coverScrim() {
  return Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="35%" stop-color="#000" stop-opacity="0"/><stop offset="62%" stop-color="#000" stop-opacity="0.30"/><stop offset="100%" stop-color="#000" stop-opacity="0.42"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/></svg>`);
}

export async function lifestyleThreeStackTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]> & { editorHeadlineColor?: string; editorBodyColor?: string };
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const headlineColor = frame.editorHeadlineColor ?? LIFESTYLE_ACCENT;
  const bodyColor = frame.editorBodyColor ?? WHITE;
  const width = frame.width;

  const headline = await rasterText(slide.headline.toLowerCase(), {
    width, height: 1, size: frame.headlineSize ?? 58, weight: frame.headlineWeight ?? 700, color: headlineColor,
    align: "left", spacing: 1, fontFamily: isHook ? hookFontFamily : fontFamily, maxLines: frame.maxHeadlineLines ?? 2,
  });
  const body = slide.body.trim()
    ? await rasterText(slide.body.trim(), {
        width, height: 1, size: frame.bodySize ?? 38, weight: frame.bodyWeight ?? 600, color: bodyColor,
        align: "left", spacing: 1, fontFamily, maxLines: frame.maxBodyLines ?? 4,
      })
    : null;
  const headlineHeight = (await sharp(headline).metadata()).height ?? 0;
  const bodyHeight = body ? (await sharp(body).metadata()).height ?? 0 : 0;
  const gap = body ? Math.round((frame.bodySize ?? 38) * 0.45) : 0;
  const blockHeight = headlineHeight + gap + bodyHeight;

  const left = frame.headlineX ?? frame.x;
  // Body slides centre the block on the middle band unless the editor placed it.
  const top = isHook || geometry.text?.headlineY !== undefined
    ? frame.headlineY ?? frame.y
    : BAND_TOP + Math.max(24, Math.round((BAND_HEIGHT - blockHeight) / 2));

  const overlays: OverlayOptions[] = [isHook
    ? { input: coverScrim(), left: 0, top: 0 }
    : { input: scrim(1080, BAND_HEIGHT, 0.5, 0.18), left: 0, top: BAND_TOP }];
  const place = async (text: Buffer, x: number, y: number) => {
    const shadow = await shadowed(text);
    overlays.push({ input: shadow.halo, left: Math.max(0, x - shadow.pad), top: Math.max(0, y - shadow.pad + 2) });
    overlays.push({ input: shadow.tight, left: Math.max(0, x - shadow.pad), top: Math.max(0, y - shadow.pad + 1) });
    overlays.push({ input: text, left: x, top: y });
  };
  await place(headline, left, top);
  // The context line follows the headline (a fixed bodyY left a hole under a 2-line hook).
  if (body) await place(body, frame.bodyX ?? left, top + headlineHeight + gap);
  return overlays;
}
