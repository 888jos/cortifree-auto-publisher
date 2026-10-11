import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { defaultGeometry, type GeneratedSlide, type Geometry } from "../types";
import { FONT_FILES, rasterText, rasterWholeText } from "./shared";

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

const CANVAS_HEIGHT = 1350;
// The card stays inside the safe zone, clear of the TikTok top bar and caption.
const PANEL_TOP_LIMIT = 110;
const PANEL_BOTTOM_LIMIT = 1250;

/** Optional CortiFree line for a Note, under the checklist (not generated yet). */
function cortifreeNoteOf(slide: GeneratedSlide) {
  return String(slide.cortifreeNote ?? "").trim();
}

type ChecklistRow = { kind: "item" | "note"; image: Buffer; height: number };

/** Renders every item whole at one size and returns the stacked height. */
async function planChecklistRows(choices: string[], note: string, textWidth: number, size: number, fontFamily: string) {
  const lineHeight = Math.round(size * 1.32);
  const gap = Math.round(size * 0.75);
  const rows: ChecklistRow[] = [];
  for (const choice of choices) {
    const image = await rasterWholeText(choice, { width: textWidth, height: 0, size, weight: 400, color: "#3b3b3b", align: "left", spacing: 0, fontFamily });
    rows.push({ kind: "item", image, height: Math.max(lineHeight, await heightOf(image)) });
  }
  if (note) {
    const noteSize = Math.round(size * 0.8);
    const image = await rasterWholeText(note, { width: textWidth + 56, height: 0, size: noteSize, weight: 500, color: "#B07A00", align: "left", spacing: 0, fontFamily });
    rows.push({ kind: "note", image, height: await heightOf(image) });
  }
  const height = rows.reduce((total, row) => total + row.height, 0) + gap * Math.max(0, rows.length - 1) + (note ? gap : 0);
  return { rows, size, lineHeight, gap, height };
}

async function noteRule(width: number) {
  return Buffer.from(`<svg width="${width}" height="2" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="2" fill="#e5e5ea"/></svg>`);
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
    const shadow = await rasterText(hook, { maxLines: 4, neverCut: true, width: frame.width, height, size, weight: 700, color: "#111111", align: "center", spacing: 1, fontFamily });
    const foreground = await rasterText(hook, { maxLines: 4, neverCut: true, width: frame.width, height, size, weight: 700, color: "#ffffff", align: "center", spacing: 1, fontFamily });
    overlays.push({ input: shadow, left: frame.x + 3, top: (frame.headlineY ?? frame.y) + 3 });
    overlays.push({ input: foreground, left: frame.x, top: frame.headlineY ?? frame.y });
    return overlays;
  }

  // Notes card (white panel plus one pastel accent). It grows with its text:
  // nothing in a Note is ever cut with "…" and every item keeps one size.
  const panelX = frame.checklistPanelX ?? 151;
  const panelWidth = frame.checklistPanelWidth ?? 778;
  const basePanelTop = frame.checklistPanelY ?? 205;
  const basePanelHeight = frame.checklistPanelHeight ?? 940;
  const titleOffset = (frame.headlineY ?? frame.y) - basePanelTop;
  const bodyOffset = (frame.bodyY ?? frame.checklistChoicesY ?? 435) - basePanelTop;

  // The title may take two lines, steps down a little if needed, and only
  // then takes a third line instead of losing its end.
  const titleSize = frame.headlineSize ?? 52;
  const titleImage = await rasterText(slide.headline.replace(/^\d+[.)]\s*/, "").trim(), {
    maxLines: 2, neverCut: true, width: frame.width, height: Math.round(titleSize * 1.35 * 2), size: titleSize, weight: 650,
    color: "#282828", align: "left", spacing: 0, fontFamily,
  });
  const titleHeight = await heightOf(titleImage);
  // A two-line title keeps the same breathing room a one-line title gets from bodyY.
  const listOffset = Math.max(bodyOffset, titleOffset + titleHeight + Math.round(titleSize * 0.9));

  const choices = checklistChoices(slide).slice(0, 6);
  const startX = frame.bodyX ?? frame.checklistChoicesX ?? 187;
  const textWidth = (frame.checklistChoicesWidth ?? 706) - 56;
  const note = cortifreeNoteOf(slide);
  const bottomPadding = 64;
  const maxPanelHeight = PANEL_BOTTOM_LIMIT - PANEL_TOP_LIMIT;

  // One size for every item of the Note: 40px, lowered for all items at once
  // only when the tallest card that fits the safe zone still cannot hold them.
  let plan = await planChecklistRows(choices, note, textWidth, frame.bodySize ?? 40, fontFamily);
  for (const size of [38, 36, 34, 32]) {
    if (listOffset + plan.height + bottomPadding <= maxPanelHeight) break;
    plan = await planChecklistRows(choices, note, textWidth, size, fontFamily);
  }
  const panelHeight = Math.max(basePanelHeight, listOffset + plan.height + bottomPadding);
  const panelTop = panelHeight <= basePanelHeight
    ? basePanelTop
    : Math.max(PANEL_TOP_LIMIT, Math.min(basePanelTop, Math.round((CANVAS_HEIGHT - panelHeight) / 2), PANEL_BOTTOM_LIMIT - panelHeight));

  overlays.push({ input: await checklistPanel(panelWidth, panelHeight), left: panelX, top: panelTop });
  overlays.push({ input: titleImage, left: frame.headlineX ?? frame.x, top: panelTop + titleOffset });
  let cursorY = panelTop + listOffset;
  for (const row of plan.rows) {
    if (row.kind === "item") {
      const circleSize = Math.round(plan.size * 0.75);
      const circle = Buffer.from(
        `<svg width="${circleSize + 10}" height="${circleSize + 10}" xmlns="http://www.w3.org/2000/svg"><circle cx="${(circleSize + 10) / 2}" cy="${(circleSize + 10) / 2}" r="${circleSize / 2}" fill="none" stroke="#c7c7cc" stroke-width="2.5"/></svg>`,
      );
      overlays.push({ input: circle, left: startX, top: cursorY + Math.round((plan.lineHeight - circleSize - 10) / 2) });
      overlays.push({ input: row.image, left: startX + 56, top: cursorY });
    } else {
      // Room kept for one CortiFree line under the list (filled by the CortiFree integration).
      cursorY += plan.gap;
      overlays.push({ input: await noteRule(textWidth + 56), left: startX, top: cursorY - plan.gap });
      overlays.push({ input: row.image, left: startX, top: cursorY });
    }
    cursorY += row.height + plan.gap;
  }
  return overlays;
}
