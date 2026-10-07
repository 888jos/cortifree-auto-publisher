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

export async function rasterText(text: string, options: { width: number; height: number; size: number; weight: number; color: string; align: "left" | "center" | "right"; spacing: number; fontFamily?: string }) {
  const fontPath = resolveFontPath(options.fontFamily, options.weight);
  const font = `${options.weight >= 700 ? "bold " : ""}${options.size}px ${options.fontFamily ?? "TikTok Sans"}`;
  const input = { text: { text, font, fontfile: fontPath, width: options.width, height: options.height, align: options.align, rgba: true, spacing: options.spacing } };
  const textBuffer = await sharp(input).ensureAlpha().png().toBuffer();
  const metadata = await sharp(textBuffer).metadata();
  const width = metadata.width ?? options.width;
  const height = metadata.height ?? options.height;
  const alpha = await sharp(textBuffer).extractChannel(3).raw().toBuffer();
  const hex = options.color.replace("#", "");
  const color = { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16) };
  const textLayer = await sharp({ create: { width, height, channels: 3, background: color } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return textLayer;
}
