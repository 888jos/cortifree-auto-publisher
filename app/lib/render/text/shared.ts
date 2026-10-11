import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const FONT_ROOT = path.join(process.cwd(), "public", "fonts", "curated");
export const FONT_FILES: Record<string, string> = {
  "TikTok Sans": "tiktok sans",
  "Instrument Sans": "instrument sans",
  Manrope: "manrope",
  "Inter Tight": "inter tight",
  "DM Sans": "dm sans",
  "Plus Jakarta Sans": "plus jakarta sans",
  "Space Grotesk": "space grotesk",
  "Bricolage Grotesque": "bricolage grotesque",
  Archivo: "archivo",
  Urbanist: "urbanist",
};
export function resolveFontPath(family = "TikTok Sans", weight = 500) {
  const slug = FONT_FILES[family] ?? FONT_FILES["TikTok Sans"];
  const exact = path.join(FONT_ROOT, `${slug}-${weight}.ttf`);
  if (existsSync(exact)) return exact;
  const nearest = [700, 600, 500, 400].map((item) => path.join(FONT_ROOT, `${slug}-${item}.ttf`)).find(existsSync);
  if (!nearest) throw new Error(`Downloaded carousel font missing for ${family}`);
  return nearest;
}
export function embeddedFontForFamily(family: string) {
  const fontPath = resolveFontPath(family, 500);
  return existsSync(fontPath) ? readFileSync(fontPath).toString("base64") : "";
}

export function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function wrap(value: string, maxChars: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1) ?? "";
    if (!current || `${current} ${word}`.length <= maxChars) {
      if (lines.length === 0) lines.push(word);
      else lines[lines.length - 1] = current ? `${current} ${word}` : word;
    } else if (lines.length < maxLines) lines.push(word);
    else {
      lines[lines.length - 1] = `${lines.at(-1)?.replace(/…$/, "")}…`;
      break;
    }
  }
  return lines;
}

export function wrapHook(value: string, maxWords: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    if (lines.length >= maxLines) break;
    lines.push(words.slice(index, index + maxWords).join(" "));
  }
  if (lines.length === maxLines && words.length > maxLines * maxWords) lines[lines.length - 1] = `${lines.at(-1)}…`;
  return lines;
}

export function textBlock(lines: string[], x: number, y: number, width: number, size: number, weight: number, color: string, align: string, lineHeight: number, fontFamily: string) {
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const textX = align === "center" ? x + width / 2 : align === "right" ? x + width : x;
  return `<text x="${textX}" y="${y}" fill="${color}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

// Pango reads "FAMILY [STYLE] SIZE": the family must come first and the size
// last, otherwise it falls back to the system font (DejaVu on the worker).
export function pangoFontDescription(family: string, weight: number, size: number) {
  const style = weight >= 700 ? " Bold" : weight >= 600 ? " Semi-Bold" : weight >= 500 ? " Medium" : "";
  return `${family}${style} ${size}px`;
}

type RasterTextOptions = {
  width: number; height: number; size: number; weight: number; color: string;
  align: "left" | "center" | "right"; spacing: number; fontFamily?: string;
  /**
   * Flow mode: the text is wrapped once, at the real pixel width, by Pango.
   * Single line breaks from a character-count wrap() are undone first (they
   * disagreed with the real width and left orphan words); blank lines stay as
   * paragraph breaks. Up to maxLines lines fit in `height`; otherwise the size
   * steps down to 82% and only then the end is cut with an ellipsis.
   */
  maxLines?: number;
  /** Flow mode for lists: keep every line break (one item per line) and still wrap long items at the real width. */
  preserveLines?: boolean;
};

async function pangoText(text: string, options: RasterTextOptions, size: number, fixedHeight: boolean) {
  const fontPath = resolveFontPath(options.fontFamily, options.weight);
  const font = pangoFontDescription(options.fontFamily ?? "TikTok Sans", options.weight, size);
  const input = { text: { text: xml(text), font, fontfile: fontPath, width: options.width, ...(fixedHeight ? { height: options.height } : {}), align: options.align, rgba: true, spacing: options.spacing } };
  const buffer = await sharp(input).ensureAlpha().png().toBuffer();
  const metadata = await sharp(buffer).metadata();
  return { buffer, width: metadata.width ?? options.width, height: metadata.height ?? 0 };
}

/** Collapses wrap()'s single line breaks; keeps blank-line paragraph breaks. */
export function unwrapLines(text: string) {
  return text.split(/\n{2,}/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).join("\n\n");
}

async function flowText(options: RasterTextOptions, text: string) {
  const maxLines = options.maxLines!;
  const paragraphs = options.preserveLines ? 1 : text.split("\n\n").length;
  for (const factor of [1, 0.94, 0.88, 0.82]) {
    const size = Math.round(options.size * factor);
    // maxLines alone decides (callers' box heights were often sized for fewer
    // lines). Measure a real block of that many lines: one line times N
    // under-counts the line gap of some fonts on the worker, which cut live
    // two-line headlines to one line plus "…".
    const probeLines = maxLines + paragraphs - 1;
    const probe = await pangoText(Array.from({ length: probeLines }, () => "Ág").join("\n"), options, size, false);
    const limit = probe.height + Math.ceil(size * 0.15) + 4;
    const rendered = await pangoText(text, options, size, false);
    if (rendered.height <= limit) return rendered;
    if (factor === 0.82) {
      // Still too long at the smallest size: cut whole words, never mid-word.
      const words = text.split(" ");
      for (let count = words.length - 1; count > 0; count -= 1) {
        const cut = await pangoText(`${words.slice(0, count).join(" ").replace(/[,.;:!?]+$/, "")}…`, options, size, false);
        if (cut.height <= limit) return cut;
      }
      return rendered;
    }
  }
  throw new Error("unreachable");
}

export async function rasterText(text: string, options: RasterTextOptions) {
  const flowing = options.maxLines !== undefined;
  const rendered = flowing ? await flowText(options, options.preserveLines ? text.trim() : unwrapLines(text)) : await pangoText(text, options, options.size, true);
  const { width, height } = rendered;
  const alpha = await sharp(rendered.buffer).extractChannel(3).raw().toBuffer();
  const hex = options.color.replace("#", "");
  const color = { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16) };
  const textLayer = await sharp({ create: { width, height, channels: 3, background: color } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  // Pango returns an image only as wide as the text, so a centered block
  // was placed against the frame's left edge. Pad it to the frame width so
  // the alignment applies to the whole frame.
  const free = Math.max(0, options.width - width);
  if (!free || options.align === "left") return textLayer;
  const left = options.align === "center" ? Math.floor(free / 2) : free;
  return sharp(textLayer).extend({ left, right: free - left, top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/**
 * Puts a solid outline behind a text layer from rasterText so it stays
 * readable on any photo (F08 text on busy 2x2 photos was illegible). The
 * result is `stroke` px larger on every side: place it at left/top - stroke.
 */
export async function outlineText(layer: Buffer, stroke: number, color = "#000000") {
  const padded = await sharp(layer)
    .extend({ top: stroke, bottom: stroke, left: stroke, right: stroke, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const { width = 0, height = 0 } = await sharp(padded).metadata();
  const alpha = await sharp(padded).extractChannel(3).raw().toBuffer();
  const hex = color.replace("#", "");
  const rgb = { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16) };
  const glyphs = await sharp({ create: { width, height, channels: 3, background: rgb } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  // Copies of the glyphs shifted around two circles (radius stroke and half
  // of it): a round, even outline. sharp's dilate() shrank the white glyph
  // mask instead of growing it, so it is not used.
  const offsets: Array<[number, number]> = [];
  for (const radius of [stroke, stroke / 2]) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      offsets.push([Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
    }
  }
  const unique = [...new Map(offsets.map(([x, y]) => [`${x},${y}`, [x, y] as const])).values()];
  const outline = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(unique.map(([left, top]) => ({ input: glyphs, left, top })))
    .png()
    .toBuffer();
  return sharp(outline).composite([{ input: padded, left: 0, top: 0 }]).png().toBuffer();
}
