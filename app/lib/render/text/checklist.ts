import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, wrap } from "./shared";

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

function fitChecklistTitle(value: string, width: number, preferredSize: number) {
  const text = value.replace(/^\d+[.)]\s*/, "").trim();
  const capacity = (size: number) => Math.max(10, Math.floor(width / (size * 0.54)));
  for (let size = preferredSize; size >= 32; size -= 2) {
    if (text.length <= capacity(size)) return { text, size, lines: 1 };
  }
  for (let size = Math.min(preferredSize, 38); size >= 30; size -= 2) {
    const lines = wrap(text, capacity(size), 2);
    if (lines.length <= 2 && !lines.some((line) => line.endsWith("…"))) return { text: lines.join("\n"), size, lines: lines.length };
  }
  return { text: wrap(text, capacity(30), 2).join("\n"), size: 30, lines: 2 };
}

function fitChecklistHook(value: string, width: number, preferredSize: number) {
  const raw = value.trim();
  const text = /^["“”].*["“”]$/.test(raw) ? raw : `“${raw.replace(/^["“”]|["“”]$/g, "")}”`;
  const capacity = (size: number) => Math.max(12, Math.floor(width / (size * 0.53)));
  for (let size = preferredSize; size >= 42; size -= 2) {
    const lines = wrap(text, capacity(size), 3);
    if (!lines.some((line) => line.endsWith("…"))) return { text: lines.join("\n"), size, lines: lines.length };
  }
  const lines = wrap(text, capacity(40), 4);
  return { text: lines.join("\n"), size: 40, lines: lines.length };
}

export async function checklistTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const fitted = fitChecklistHook(slide.headline, frame.width, frame.hookSize ?? 50);
    const height = Math.max(180, fitted.lines * Math.round(fitted.size * 1.35));
    const shadow = await rasterText(fitted.text, { width: frame.width, height, size: fitted.size, weight: 700, color: "#111111", align: "center", spacing: 1, fontFamily });
    const foreground = await rasterText(fitted.text, { width: frame.width, height, size: fitted.size, weight: 700, color: "#ffffff", align: "center", spacing: 1, fontFamily });
    overlays.push({ input: shadow, left: frame.x + 3, top: (frame.headlineY ?? frame.y) + 3 });
    overlays.push({ input: foreground, left: frame.x, top: frame.headlineY ?? frame.y });
    return overlays;
  }

  const fittedTitle = fitChecklistTitle(slide.headline, frame.width, frame.headlineSize ?? 38);
  const titleHeight = fittedTitle.lines === 1 ? 58 : 98;
  const categoryImage = await rasterText(fittedTitle.text, {
    width: frame.width, height: titleHeight, size: fittedTitle.size, weight: 650,
    color: "#282828", align: "left", spacing: 0, fontFamily,
  });
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
    const lines = wrap(choice, 48, 2);
    const circle = Buffer.from(
      `<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="15" r="11.5" fill="none" stroke="#c7c7cc" stroke-width="2"/></svg>`,
    );
    overlays.push({ input: circle, left: startX, top: cursorY + 2 });
    const labelImage = await rasterText(lines.join("\n"), {
      width: textWidth, height: Math.max(40, lines.length * lineHeight + 8), size: fontSize, weight: 400,
      color: "#3b3b3b", align: "left", spacing: 0, fontFamily,
    });
    overlays.push({ input: labelImage, left: startX + 44, top: cursorY });
    cursorY += lines.length * lineHeight + rowGap;
  }
  return overlays;
}
