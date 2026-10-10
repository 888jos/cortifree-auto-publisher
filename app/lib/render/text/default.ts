import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import type { AssetMatch } from "../../asset-selector";
import type { HookDesign } from "../../hook-design";
import { defaultGeometry, HEIGHT, WIDTH, type Frame, type GeneratedSlide, type Geometry } from "../types";
import { embeddedFontForFamily, FONT_FILES, rasterText, textBlock, wrap, wrapHook, xml } from "./shared";

export function geometryForVisualMetadata(geometry: Geometry, match: AssetMatch | undefined): Geometry {
  if (!match) return geometry;
  const asset = match.asset;
  const field = (name: string) => {
    const direct = (asset as unknown as Record<string, unknown>)[name];
    return direct !== undefined && direct !== null && direct !== "" ? direct : asset.metadata?.[name];
  };
  const text = { ...defaultGeometry.text, ...geometry.text } as Frame & NonNullable<Geometry["text"]>;
  const composition = `${field("composition") ?? ""} ${field("specific_details") ?? ""}`.toLowerCase();
  const people = String(field("people_visibility") ?? "").toLowerCase();
  const focalObject = `${field("visible_objects") ?? []} ${field("body_parts_visible") ?? []}`.toLowerCase();
  const nextText = { ...text };
  if (/subject[_ ]?on[_ ]?right|person[_ ]?right|right[_ ]?space/.test(composition)) {
    nextText.x = 72; nextText.width = 470; nextText.align = "left";
  } else if (/subject[_ ]?on[_ ]?left|person[_ ]?left|left[_ ]?space/.test(composition)) {
    nextText.x = 570; nextText.width = 440; nextText.align = "left";
  } else if (people && !/no_person|none/.test(people) && /face|head|body/.test(focalObject)) {
    nextText.x = 72; nextText.width = 936; nextText.headlineY = 1010; nextText.bodyY = 1160; nextText.maxHeadlineLines = 2; nextText.maxBodyLines = 3;
  } else if (/phone|laptop|notebook|journal|food|plate|product/.test(focalObject)) {
    nextText.headlineY = 930; nextText.bodyY = 1080; nextText.maxHeadlineLines = 2; nextText.maxBodyLines = 3;
  }
  return { ...geometry, text: nextText } as Geometry;
}

export function makeTextOverlay(slide: GeneratedSlide, geometry: Geometry) {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const headlineSize = frame.headlineSize ?? 62;
  const bodySize = frame.bodySize ?? 32;
  const headlineText = slide.position === 1 || slide.role.toUpperCase() === "HOOK" ? slide.headline : slide.headline.replace(/^\d+[.)]\s*/, "");
  const headline = wrap(headlineText, Math.max(10, Math.floor(frame.width / (headlineSize * 0.56))), frame.maxHeadlineLines ?? 3);
  const body = wrap(slide.body, Math.max(16, Math.floor(frame.width / (bodySize * 0.52))), frame.maxBodyLines ?? 5);
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const embeddedFont = embeddedFontForFamily(fontFamily);
  const fontFace = embeddedFont ? `<style>@font-face{font-family:'${fontFamily}';src:url(data:font/ttf;base64,${embeddedFont}) format('truetype');font-weight:100 900;}</style>` : "";
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><defs></defs>${fontFace}<text x="${frame.x}" y="${(frame.headlineY ?? frame.y) - 44}" fill="${frame.accentColor ?? "#ffb6c8"}" font-family="${fontFamily}" font-size="${bodySize}" font-weight="700" letter-spacing="3">${xml(`${String(slide.position).padStart(2, "0")} · ${slide.role}`)}</text>${textBlock(headline, frame.x, frame.headlineY ?? frame.y, frame.width, headlineSize, frame.headlineWeight ?? 700, frame.headlineColor ?? "#fffaf8", frame.align ?? "left", Math.round(headlineSize * 1.1), fontFamily)}${body.length ? textBlock(body, frame.x, frame.bodyY ?? frame.y + 180, frame.width, bodySize, frame.bodyWeight ?? 500, frame.bodyColor ?? "#fff4b8", frame.align ?? "left", Math.round(bodySize * 1.32), fontFamily) : ""}</svg>`);
}

export async function makeRasterTextOverlays(slide: GeneratedSlide, geometry: Geometry, hookDesign?: HookDesign): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const headlineSize = frame.headlineSize ?? 62;
  const bodySize = frame.bodySize ?? 32;
  const headlineText = slide.position === 1 || slide.role.toUpperCase() === "HOOK" ? slide.headline : slide.headline.replace(/^\d+[.)]\s*/, "");
  const headline = wrap(headlineText, Math.max(10, Math.floor(frame.width / (headlineSize * 0.56))), frame.maxHeadlineLines ?? 3);
  const body = wrap(slide.body, Math.max(16, Math.floor(frame.width / (bodySize * 0.52))), frame.maxBodyLines ?? 5);
  const align = frame.align ?? "left";
  const headlineLineHeight = Math.round(headlineSize * 1.1);
  const bodyLineHeight = Math.round(bodySize * 1.32);
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];
  if (isHook) {
    const design = hookDesign ?? { format: "fallback", x: 600, y: 300, width: 390, size: 72, weight: 700, maxWordsPerLine: 2, lineGap: 8, align: "left" as const, textColor: "#20243A", accentColor: "#FFE26E", hookColor: "#FFE26E" };
    const hookHeadline = wrapHook(slide.headline.toLowerCase(), 4, 4);
    // Keep long hooks in a compact, high-contrast block instead of allowing
    // one word per line to run through the person or the focal object.
    const hookSize = frame.hookSize ?? 44;
    const hookTop = Math.max(96, Math.min(930, design.y ?? 790));
    // The composition heuristic can prefer the visually quieter side while
    // still crossing a centered portrait. Keep long hooks in the opposite
    // lateral safe zone instead of covering the face or phone.
    const hookX = Math.max(64, Math.min(620, design.x ?? 88));
    const hookWidth = Math.max(360, Math.min(920, design.width ?? 904));
    // One block wrapped at the real width: per-line images re-wrapped a line
    // that was too wide and overlapped the next one.
    const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
    const hookImage = await rasterText(slide.headline.toLowerCase(), { maxLines: Math.max(4, hookHeadline.length), width: hookWidth, height: Math.ceil((hookSize + Math.max(8, design.lineGap)) * 5), size: hookSize, weight: design.weight, color: frame.headlineColor ?? "#fffaf8", align: "left", spacing: Math.max(8, design.lineGap), fontFamily: hookFontFamily });
    overlays.push({ input: hookImage, left: hookX, top: hookTop });
    return overlays;
  }
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const headlineImage = await rasterText(headlineText, { maxLines: frame.maxHeadlineLines ?? 3, width: frame.width, height: headline.length * headlineLineHeight + 18, size: headlineSize, weight: frame.headlineWeight ?? 700, color: frame.headlineColor ?? "#fffaf8", align, spacing: Math.max(0, headlineLineHeight - headlineSize), fontFamily });
  overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });
  if (body.length) {
    const bodyImage = await rasterText(slide.body, { maxLines: frame.maxBodyLines ?? 5, width: frame.width, height: body.length * bodyLineHeight + 18, size: bodySize, weight: frame.bodyWeight ?? 500, color: frame.bodyColor ?? "#fff4b8", align, spacing: Math.max(0, bodyLineHeight - bodySize), fontFamily });
    const headlineHeight = (await sharp(headlineImage).metadata()).height ?? headline.length * headlineLineHeight;
    // Never above the headline's real bottom, even when a fixed bodyY is set.
    const bodyTop = Math.max(frame.bodyY ?? 0, (frame.headlineY ?? frame.y) + headlineHeight + 22);
    overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: bodyTop });
  }
  return overlays;
}
