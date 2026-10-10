import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText } from "./shared";

function checklistChoices(slide: GeneratedSlide) {
  return String(slide.body ?? "")
    .split(/\s*(?:\||\n|;)\s*/)
    .map((item) => item.replace(/^[□☐○◯✓✔•\-–—]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function checklistPanel(width: number, height: number) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="15" flood-color="#000000" flood-opacity="0.12"/></filter></defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="28" ry="28" fill="#ffffff" filter="url(#shadow)"/>
      <g fill="none" stroke="#F5A800" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M52 70 L38 84 L52 98"/>
        <path d="M${width - 104} 72 L${width - 104} 96 M${width - 116} 84 L${width - 92} 84"/>
        <circle cx="${width - 48}" cy="84" r="3" fill="#F5A800" stroke="none"/>
        <circle cx="${width - 36}" cy="84" r="3" fill="#F5A800" stroke="none"/>
        <circle cx="${width - 24}" cy="84" r="3" fill="#F5A800" stroke="none"/>
      </g>
      <text x="66" y="94" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="500" fill="#F5A800">Notes</text>
    </svg>`,
  );
}

function quotedHook(value: string) {
  const raw = value.trim();
  return /^["“”].*["“”]$/.test(raw) ? raw : `“${raw.replace(/^["“”]|["“”]$/g, "")}”`;
}

const heightOf = async (image: Buffer) => (await sharp(image).metadata()).height ?? 0;

export async function checklistTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const hook = quotedHook(slide.headline);
    const size = frame.hookSize ?? 50;
    const height = Math.round(size * 1.35 * 4);
    const shadow = await rasterText(hook, { maxLines: 4, width: frame.width, height, size, weight: 700, color: "#111111", align: "center", spacing: 1, fontFamily });
    const foreground = await rasterText(hook, { maxLines: 4, width: frame.width, height, size, weight: 700, color: "#ffffff", align: "center", spacing: 1, fontFamily });
    overlays.push({ input: shadow, left: frame.x + 3, top: (frame.headlineY ?? frame.y) + 3 });
    overlays.push({ input: foreground, left: frame.x, top: frame.headlineY ?? frame.y });
    return overlays;
  }

  const categoryImage = await rasterText(slide.headline.replace(/^\d+[.)]\s*/, "").trim(), {
    maxLines: 2, width: frame.width, height: 98, size: frame.headlineSize ?? 38, weight: 650,
    color: "#282828", align: "left", spacing: 0, fontFamily,
  });
  const titleHeight = await heightOf(categoryImage);
  overlays.push({ input: categoryImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });

  const choices = checklistChoices(slide).slice(0, 6);
  const startX = frame.bodyX ?? frame.checklistChoicesX ?? 165;
  const startY = Math.max(frame.bodyY ?? frame.checklistChoicesY ?? 405, (frame.headlineY ?? frame.y) + titleHeight + 34);
  const choiceWidth = frame.checklistChoicesWidth ?? 750;
  const textWidth = choiceWidth - 54;
  const fontSize = 23;
  const lineHeight = 31;
  const rowGap = 18;
  let cursorY = startY;
  for (const choice of choices) {
    const circle = Buffer.from(
      `<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="15" r="11.5" fill="none" stroke="#c7c7cc" stroke-width="2"/></svg>`,
    );
    overlays.push({ input: circle, left: startX, top: cursorY + 2 });
    const labelImage = await rasterText(choice, {
      maxLines: 2, width: textWidth, height: 2 * lineHeight + 8, size: fontSize, weight: 400,
      color: "#3b3b3b", align: "left", spacing: 0, fontFamily,
    });
    overlays.push({ input: labelImage, left: startX + 44, top: cursorY });
    // Stack by the real rendered height so a wrapped item never overlaps the next.
    cursorY += Math.max(lineHeight, await heightOf(labelImage)) + rowGap;
  }
  return overlays;
}
