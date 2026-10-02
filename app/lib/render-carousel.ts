import sharp, { type OverlayOptions } from "sharp";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chooseAssets, loadSelectableAssets, requiresOfficialAppScreenshot, visualPersonaIdFor, type AssetMatch } from "./asset-selector";
import { getSlideGeometry } from "./layout-geometry.js";
import { dataBackend } from "./data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "./workspace";
import { uploadConvexFile } from "./convex-storage";
import { analyzeHookComposition, type HookDesign } from "./hook-design";
import { processImageGenerationJob } from "./image-generation";
import { buildImagePrompt, imageGenerationInputSchema } from "../../src/image-generation/core";
import { isAutomaticVisualReference, scoreVisualReferenceForScene, visualReferenceSchema } from "../../src/visual-references";
import { loadRuntimePersonaConfigs } from "../../src/runtime/config";
import { downloadDriveFile } from "./google/drive";
import { canonicalLayoutFor } from "./canonical-layout";
import { typographyForCarousel } from "./carousel-typography";

const WIDTH = 1080;
const HEIGHT = 1350;
const FONT_ROOT = path.join(process.cwd(), "public", "fonts", "curated");
const FONT_FILES: Record<string, string> = {
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
function resolveFontPath(family = "TikTok Sans", weight = 500) {
  const slug = FONT_FILES[family] ?? FONT_FILES["TikTok Sans"];
  const exact = path.join(FONT_ROOT, `${slug}-${weight}.ttf`);
  if (existsSync(exact)) return exact;
  const nearest = [700, 600, 500, 400].map((item) => path.join(FONT_ROOT, `${slug}-${item}.ttf`)).find(existsSync);
  if (!nearest) throw new Error(`Downloaded carousel font missing for ${family}`);
  return nearest;
}
function embeddedFontForFamily(family: string) {
  const fontPath = resolveFontPath(family, 500);
  return existsSync(fontPath) ? readFileSync(fontPath).toString("base64") : "";
}

export type GeneratedSlide = {
  position: number;
  role: string;
  layout: string;
  headline: string;
  body: string;
  assetQuery: string;
  visualIntent: string;
  assetType?: string;
};

function labeledEducationalVisual(value: string, label: "top-left" | "bottom-left" | "bottom-right") {
  const source = value.replace(/^\s*Three differentiated visuals:\s*/i, "").trim();
  const labels = "top-left|bottom-left|bottom-right|top-right";
  const match = source.match(new RegExp(`(?:^|;\\s*)${label}\\s+([\\s\\S]*?)(?=;\\s*(?:${labels})\\b|$)`, "i"));
  return match?.[1]?.replace(/^(?:proof\/example|support visual|proof|example)\s+(?:of\s+)?/i, "").trim() ?? "";
}

export function educationalAssetSlideForSlot(slide: GeneratedSlide, slotIndex: number): GeneratedSlide {
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  if (isHook) return slide;
  const labels = ["top-left", "bottom-left", "bottom-right"] as const;
  const label = labels[Math.max(0, Math.min(labels.length - 1, slotIndex))]!;
  const visual = labeledEducationalVisual(slide.visualIntent, label)
    || labeledEducationalVisual(slide.assetQuery, label);
  const fallback = `${slide.headline}. ${slide.body.split("|").slice(1).join(". ")}`.trim();
  const intent = visual || fallback;
  return {
    ...withoutAppScreenshotDirective(slide),
    position: Math.max(2, slide.position),
    role: slotIndex === 0 ? slide.role : "SUPPORT",
    assetType: slotIndex === 0 ? slide.assetType : "stock",
    assetQuery: intent,
    visualIntent: intent,
  };
}

function twoByTwoVisualParts(value: string) {
  let source = value
    .replace(/^\s*(?:Editorial\s+)?2x2\s+grid\s+with\s+/i, "")
    .replace(/^\s*(?:Exactly\s+)?two\s+unique(?:\s+cohesive)?(?:\s+lifestyle)?\s+photos?(?:\s+only)?(?:,?\s+repeated\s+diagonally(?:\s+in\s+the\s+2x2\s+grid)?)?\s*:\s*/i, "")
    .trim();
  const labeled = source.match(/top-left(?:\s+and\s+bottom-right)?\s+(?:show|shows)?\s*([\s\S]*?);\s*top-right(?:\s+and\s+bottom-left)?\s+(?:show|shows)?\s*([\s\S]*)/i);
  if (labeled) return [labeled[1]!.trim(), labeled[2]!.trim()];
  const numbered = source.match(/1\)\s*([\s\S]*?)(?:;|,)?\s*2\)\s*([\s\S]*)/i);
  if (numbered) return [numbered[1]!.trim(), numbered[2]!.trim()];
  const plus = source.split(/\s*,?\s+plus\s+/i).map((part) => part.trim()).filter(Boolean);
  if (plus.length >= 2) return [plus[0]!, plus.slice(1).join(" plus ")];
  const semicolon = source.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
  return semicolon.length >= 2 ? [semicolon[0]!, semicolon[1]!] : [source];
}

export function gridAssetSlideForSlot(slide: GeneratedSlide, slotIndex: 0 | 1): GeneratedSlide {
  const visualParts = twoByTwoVisualParts(slide.visualIntent);
  const queryParts = twoByTwoVisualParts(slide.assetQuery);
  const intent = visualParts[slotIndex] || queryParts[slotIndex] || visualParts[0] || queryParts[0] || slide.headline;
  return {
    ...withoutAppScreenshotDirective(slide),
    role: slotIndex === 0 ? slide.role : "SUPPORT",
    assetType: slotIndex === 0 ? slide.assetType : "stock",
    assetQuery: intent,
    visualIntent: intent,
  };
}

function withoutAppScreenshotDirective(slide: GeneratedSlide): GeneratedSlide {
  if (!requiresOfficialAppScreenshot(slide)) return slide;
  const fallbackIntent = `${slide.headline}. ${slide.body}`.trim();
  return {
    ...slide,
    assetQuery: fallbackIntent,
    visualIntent: fallbackIntent,
  };
}

type Frame = {
  x: number; y: number; width: number; height?: number; fit?: "cover" | "contain"; cropX?: number; cropY?: number; zoom?: number;
  mode?: "single" | "routine-timeline" | "three-rect-educational" | "grid-2x2" | "editorial-collage" | "editorial-asym-hero" | "interactive-checklist" | "persona-explainer" | "ranking" | "lifestyle-3stack";
};
type Geometry = {
  canvas?: { width: number; height: number };
  safeZone?: Frame;
  image?: Frame;
  imageSlots?: Frame[];
  text?: Frame & {
    align?: "left" | "center" | "right";
    headlineX?: number;
    bodyX?: number;
    headlineY?: number;
    bodyY?: number;
    headlineSize?: number;
    bodySize?: number;
    headlineWeight?: number;
    bodyWeight?: number;
    headlineColor?: string;
    bodyColor?: string;
    maxHeadlineLines?: number;
    maxBodyLines?: number;
    accentColor?: string;
    fontFamily?: string;
    hookFontFamily?: string;
    hookSize?: number;
    shadow?: string;
    routineKickerX?: number;
    routineKickerY?: number;
    routineKickerWidth?: number;
    routineKickerSize?: number;
    routineContextY?: number;
    routineTimeX?: number;
    routineTimeY?: number;
    routineTimeWidth?: number;
    routineTimeSize?: number;
    eduBodyX?: number;
    eduBodyY?: number;
    eduBodyWidth?: number;
    editorialKickerX?: number;
    editorialKickerY?: number;
    editorialKickerWidth?: number;
    editorialKickerSize?: number;
    rankingScoreX?: number;
    rankingScoreY?: number;
    rankingScoreWidth?: number;
    rankingScoreSize?: number;
    rankingKickerX?: number;
    rankingKickerY?: number;
    rankingKickerWidth?: number;
    rankingKickerSize?: number;
    checklistPanelX?: number;
    checklistPanelY?: number;
    checklistPanelWidth?: number;
    checklistPanelHeight?: number;
    checklistKickerX?: number;
    checklistKickerY?: number;
    checklistKickerWidth?: number;
    checklistKickerSize?: number;
    checklistChoicesX?: number;
    checklistChoicesY?: number;
    checklistChoicesWidth?: number;
    checklistChoiceGap?: number;
  };
  overlay?: { color?: string; opacity?: number };
};

async function selectedAssetBytes(match: AssetMatch) {
  if (match.asset.source_type === "app_screenshot") {
    const driveId = match.asset.drive_file_id
      ?? (match.asset.metadata && typeof match.asset.metadata.drive_file_id === "string"
        ? match.asset.metadata.drive_file_id
        : null);
    if (!driveId) throw new Error(`APP_SCREEN_DRIVE_ID_MISSING:${match.asset.id}`);
    const downloaded = await downloadDriveFile(driveId);
    return Buffer.from(downloaded.bytes);
  }
  const response = await fetch(match.asset.public_url);
  if (!response.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
  return Buffer.from(await response.arrayBuffer());
}

type StoredReference = { id?: string; slides?: Array<{ geometry?: Geometry }> };

export function rankingAssetCountForSlide(slide: Pick<GeneratedSlide, "position" | "role">) {
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  return isHook ? 2 : 0;
}

export function generationCategory(slide: GeneratedSlide) {
  const text = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.toLowerCase();
  if (/\b(?:walk|walking|outdoor|outdoors|street|park|outside|nature|sidewalk|commute)\b/.test(text)) return "outdoors";
  if (/\b(?:gym|workout|exercise|fitness|pilates|yoga|run|running|stretch|movement)\b/.test(text)) return "fitness";
  if (/\b(?:food|meal|breakfast|lunch|dinner|eat|eating|drink|coffee|matcha|grocery|groceries|snack)\b/.test(text)) return "food";
  if (/\b(?:study|work|desk|laptop|exam|task|focus|office)\b/.test(text)) return "work_study";
  if (/\b(?:skin|skincare|beauty|glow|face|makeup|hair|grooming|shower|bathroom|blowout|bun)\b|self[ -]?care|claw[ -]?clip/.test(text)) return "self_care";
  return "home";
}

function referenceSceneIntent(slide: GeneratedSlide) {
  const scene = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.trim();
  const category = generationCategory(slide);
  const recommended_reference_categories =
    category === "outdoors" ? ["outdoors_walk"] :
    category === "fitness" ? ["fitness_pilates"] :
    category === "food" ? ["food_grocery", "kitchen"] :
    category === "work_study" ? ["work_study"] :
    category === "self_care" ? ["self_care", "bathroom"] :
    ["morning_home", "bedroom"];
  return {
    category,
    scene_description: scene,
    recommended_reference_categories,
    broad_match_only: slide.position === 1 || slide.role.toUpperCase() === "HOOK",
  };
}

async function generateRepairAsset(options: { input: { id: string; personaId?: string }; slide: GeneratedSlide; position: number; usedReferenceIds: Set<string> }) {
  if (!options.input.personaId) throw new Error(`MODELARK_REPAIR_REQUIRES_PERSONA:slide_${options.position}`);
  const visualPersonaId = visualPersonaIdFor(options.input.personaId);
  if (!visualPersonaId) throw new Error(`MODELARK_REPAIR_REQUIRES_PERSONA:slide_${options.position}`);
  const [personas, mastersResponse, referencesResponse] = await Promise.all([
    loadRuntimePersonaConfigs(),
    dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&persona_id=eq.${encodeURIComponent(visualPersonaId)}&source_type=eq.persona_master&enabled=eq.true&public_url=not.is.null&select=id&limit=1`),
    dataBackend(`visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&enabled=eq.true&select=*&limit=500`),
  ]);
  if (!mastersResponse.ok) throw new Error(`MODELARK_MASTER_LOOKUP_FAILED:${await mastersResponse.text()}`);
  if (!referencesResponse.ok) throw new Error(`MODELARK_REFERENCE_LOOKUP_FAILED:${await referencesResponse.text()}`);
  const masters = await mastersResponse.json() as Array<{ id: string | number }>;
  const master = masters[0];
  if (!master) throw new Error(`MODELARK_MASTER_MISSING:${visualPersonaId}`);
  const referenceRows = await referencesResponse.json() as unknown[];
  const references = referenceRows
    .map((row) => visualReferenceSchema.safeParse(row))
    .flatMap((result) => result.success && isAutomaticVisualReference(result.data) ? [result.data] : [])
    .filter((reference) => !options.usedReferenceIds.has(reference.id));
  const referenceIntent = referenceSceneIntent(options.slide);
  const rankedReferences = references
    .map((reference) => ({ reference, score: scoreVisualReferenceForScene(reference, referenceIntent) }))
    .sort((a, b) => b.score - a.score);
  const bestReference = rankedReferences[0];
  if (!bestReference) throw new Error(`MODELARK_REFERENCE_MISSING:slide_${options.position}`);
  const referenceFloor = referenceIntent.broad_match_only ? 8 : 20;
  if (bestReference.score < referenceFloor) {
    throw new Error(`MODELARK_REFERENCE_LOW_CONFIDENCE:slide_${options.position}:score_${bestReference.score}:required_${referenceFloor}:candidates_${rankedReferences.length}`);
  }
  const reference = bestReference.reference;
  const persona = personas.find((item) => item.id === visualPersonaId);
  if (!persona) throw new Error(`MODELARK_PERSONA_MISSING:${visualPersonaId}`);
  const generationInput = imageGenerationInputSchema.parse({
    persona_id: visualPersonaId, master_asset_id: master.id, visual_reference_id: reference.id,
    carousel_id: options.input.id, slide_id: `slide_${options.position}`, scene: options.slide.visualIntent || options.slide.assetQuery || options.slide.headline,
    category: generationCategory(options.slide), framing: "portrait",
    prompt_additions: "Automatic carousel repair. Image 1 is only the identity master and Image 2 is only the Pinterest visual reference. Never place either source image directly in the carousel. Generate a new distinct natural photo and do not repeat any previously generated scene in this carousel.",
  });
  const prompt = buildImagePrompt(persona, reference, generationInput);
  const jobResponse = await dataBackend("image_generation_jobs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, persona_id: visualPersonaId, master_asset_id: master.id, visual_reference_id: reference.id, carousel_id: options.input.id, slide_id: `slide_${options.position}`, category: generationInput.category, scene: generationInput.scene, input: generationInput, prompt, provider: "modelark_seedream", model: process.env.MODELARK_MODEL_ID ?? "", status: "PENDING", attempts: 0, attempt_count: 0, metadata: {
      automatic_repair: true,
      source: "carousel_render",
      visual_intent: options.slide.visualIntent || options.slide.assetQuery || options.slide.headline,
      reference_score: bestReference.score,
      top_reference_candidates: rankedReferences.slice(0, 5).map((item) => ({ id: item.reference.id, score: item.score })),
    } }),
  });
  if (!jobResponse.ok) throw new Error(`MODELARK_JOB_CREATE_FAILED:${await jobResponse.text()}`);
  const jobs = await jobResponse.json() as Array<{ id: string | number }>;
  if (!jobs[0]) throw new Error("MODELARK_JOB_CREATE_FAILED:no_job_id");
  const generated = await processImageGenerationJob(String(jobs[0].id));
  options.usedReferenceIds.add(reference.id);
  return generated;
}

const defaultGeometry: Geometry = {
  canvas: { width: WIDTH, height: HEIGHT },
  safeZone: { x: 64, y: 64, width: 952, height: 1222 },
  image: { x: 0, y: 0, width: WIDTH, height: HEIGHT, fit: "cover", mode: "single" },
  text: {
    x: 82, y: 810, width: 916, headlineY: 810, bodyY: 980, align: "left",
    headlineSize: 52, bodySize: 28, headlineWeight: 700, bodyWeight: 500,
    headlineColor: "#fffdf8", bodyColor: "#f7f4ed", maxHeadlineLines: 3, maxBodyLines: 5,
  },
  overlay: { color: "#122019", opacity: 0.3 },
};

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function wrap(value: string, maxChars: number, maxLines: number) {
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

function wrapHook(value: string, maxWords: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    if (lines.length >= maxLines) break;
    lines.push(words.slice(index, index + maxWords).join(" "));
  }
  if (lines.length === maxLines && words.length > maxLines * maxWords) lines[lines.length - 1] = `${lines.at(-1)}…`;
  return lines;
}

function textBlock(lines: string[], x: number, y: number, width: number, size: number, weight: number, color: string, align: string, lineHeight: number, fontFamily: string) {
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const textX = align === "center" ? x + width / 2 : align === "right" ? x + width : x;
  return `<text x="${textX}" y="${y}" fill="${color}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

function geometryForVisualMetadata(geometry: Geometry, match: AssetMatch | undefined): Geometry {
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

async function rasterText(text: string, options: { width: number; height: number; size: number; weight: number; color: string; align: "left" | "center" | "right"; spacing: number; fontFamily?: string }) {
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



async function roundedPhoto(bytes: Buffer, width: number, height: number, radius = 24) {
  const resized = await sharp(bytes)
    .rotate()
    .resize({ width, height, fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function fitEducationalHeadline(value: string, width: number, preferredSize: number) {
  const text = value.replace(/^\d+[.)]\s*/, "").trim();
  const estimateCapacity = (size: number) => Math.max(8, Math.floor(width / (size * 0.56)));
  for (let size = preferredSize; size >= 42; size -= 2) {
    if (text.length <= estimateCapacity(size)) return { text, size, lines: 1 };
  }
  for (let size = Math.min(preferredSize, 54); size >= 40; size -= 2) {
    const wrapped = wrap(text, estimateCapacity(size), 2);
    if (wrapped.length <= 2 && !wrapped.some((line) => line.endsWith("…"))) {
      return { text: wrapped.join("\n"), size, lines: wrapped.length };
    }
  }
  return { text: wrap(text, estimateCapacity(40), 2).join("\n"), size: 40, lines: 2 };
}

async function threeRectEducationalTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Inter Tight";
  const overlays: OverlayOptions[] = [];
  const isCover = slide.position === 1 || slide.role.toUpperCase() === "HOOK";

  if (isCover) {
    const title = wrap(slide.headline.replace(/^\d+[.)]\s*/, ""), 22, 3).join("\n");
    const titleImage = await rasterText(title, {
      width: frame.width,
      height: 270,
      size: frame.headlineSize ?? 72,
      weight: frame.headlineWeight ?? 800,
      color: frame.headlineColor ?? "#2b2725",
      align: "center",
      spacing: 2,
      fontFamily: hookFontFamily,
    });
    overlays.push({ input: titleImage, left: frame.x, top: frame.headlineY ?? frame.y });
    const accentImage = await rasterText(slide.body.trim() || "✦ · ✧", {
      width: frame.eduBodyWidth ?? 300,
      height: 48,
      size: frame.bodySize ?? 22,
      weight: 600,
      color: frame.accentColor ?? "#8a6659",
      align: "center",
      spacing: 1,
      fontFamily,
    });
    overlays.push({ input: accentImage, left: frame.eduBodyX ?? 390, top: frame.eduBodyY ?? 735 });
    return overlays;
  }

  const fittedSubject = fitEducationalHeadline(slide.headline, frame.width, frame.headlineSize ?? 58);
  const subjectImage = await rasterText(fittedSubject.text, {
    width: frame.width,
    height: fittedSubject.lines === 1 ? 90 : 150,
    size: fittedSubject.size,
    weight: frame.headlineWeight ?? 800,
    color: frame.headlineColor ?? "#2b2725",
    align: "center",
    spacing: 0,
    fontFamily: hookFontFamily,
  });
  overlays.push({ input: subjectImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });

  const rawBody = String(slide.body ?? "").trim();
  const parts = rawBody.split("|").map((item) => item.trim()).filter(Boolean);
  const hasExplicitLabel = parts.length > 1;
  const explicitLabel = hasExplicitLabel ? (parts.shift() ?? "") : "";
  const label = (explicitLabel || slide.role || "NOTES").toUpperCase();
  const bullets = (hasExplicitLabel
    ? parts
    : rawBody.split(/(?<=[.!?])\s+|\s*[;•]\s*/).map((item) => item.trim()).filter(Boolean)
  ).slice(0, 5);
  const labelImage = await rasterText(label, {
    width: frame.eduBodyWidth ?? 390,
    height: 46,
    size: 20,
    weight: 800,
    color: frame.accentColor ?? "#8a6659",
    align: "left",
    spacing: 1,
    fontFamily,
  });
  const eduBodyX = frame.bodyX ?? frame.eduBodyX ?? 610;
  const eduBodyY = frame.bodyY ?? frame.eduBodyY ?? 170;
  overlays.push({ input: labelImage, left: eduBodyX, top: eduBodyY });

  const bulletText = bullets.map((bullet) => `• ${bullet}`).join("\n");
  if (bulletText) {
    const bulletImage = await rasterText(bulletText, {
      width: frame.eduBodyWidth ?? 390,
      height: 270,
      size: frame.bodySize ?? 25,
      weight: frame.bodyWeight ?? 500,
      color: frame.bodyColor ?? "#2b2725",
      align: "left",
      spacing: 10,
      fontFamily,
    });
    overlays.push({ input: bulletImage, left: eduBodyX, top: eduBodyY + 55 });
  }
  return overlays;
}

async function editorialAsymTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const kicker = await rasterText("THE EDIT", {
      width: frame.editorialKickerWidth ?? 300,
      height: 34,
      size: frame.editorialKickerSize ?? 18,
      weight: 700,
      color: frame.bodyColor ?? "#3f3631",
      align: "left",
      spacing: 1,
      fontFamily,
    });
    overlays.push({
      input: kicker,
      left: frame.editorialKickerX ?? 74,
      top: frame.editorialKickerY ?? 90,
    });

    const hook = wrapHook(slide.headline.toLowerCase(), 4, 3).join("\n");
    const hookImage = await rasterText(hook, {
      width: frame.width,
      height: 220,
      size: frame.hookSize ?? 58,
      weight: frame.headlineWeight ?? 700,
      color: frame.headlineColor ?? "#241f1c",
      align: "left",
      spacing: 0,
      fontFamily: hookFontFamily,
    });
    overlays.push({ input: hookImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });

    if (slide.body.trim()) {
      const context = wrap(slide.body.trim(), 38, frame.maxBodyLines ?? 3).join("\n");
      const contextImage = await rasterText(context, {
        width: frame.width,
        height: 120,
        size: frame.bodySize ?? 26,
        weight: frame.bodyWeight ?? 500,
        color: frame.bodyColor ?? "#3f3631",
        align: "left",
        spacing: 2,
        fontFamily,
      });
      overlays.push({ input: contextImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 990 });
    }
    return overlays;
  }

  const headline = wrap(slide.headline.replace(/^\d+[.)]\s*/, ""), 28, frame.maxHeadlineLines ?? 2).join("\n");
  const headlineImage = await rasterText(headline, {
    width: frame.width,
    height: 115,
    size: frame.headlineSize ?? 44,
    weight: frame.headlineWeight ?? 700,
    color: frame.headlineColor ?? "#241f1c",
    align: "left",
    spacing: 0,
    fontFamily: hookFontFamily,
  });
  overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 960 });

  if (slide.body.trim()) {
    const body = wrap(slide.body.trim(), 44, frame.maxBodyLines ?? 4).join("\n");
    const bodyImage = await rasterText(body, {
      width: frame.width,
      height: 170,
      size: frame.bodySize ?? 26,
      weight: frame.bodyWeight ?? 500,
      color: frame.bodyColor ?? "#3f3631",
      align: "left",
      spacing: 2,
      fontFamily,
    });
    overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 1075 });
  }
  return overlays;
}

function checklistChoices(slide: GeneratedSlide) {
  return String(slide.body ?? "")
    .split(/\s*(?:\||\n|;)\s*/)
    .map((item) => item.replace(/^[□☐○◯✓✔•\-–—]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function checklistPanel(width: number, height: number) {
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

async function checklistTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
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

function rankingCopyParts(slide: GeneratedSlide) {
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

async function rankingTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const isFinal = new Set(["CTA", "TAKEAWAY"]).has(slide.role.toUpperCase());
  const overlays: OverlayOptions[] = [];

  if (isHook) {
    const hook = wrapHook(slide.headline.toLowerCase(), 5, 3).join("\n");
    const hookImage = await rasterText(hook, {
      width: frame.width, height: 235, size: frame.hookSize ?? 68, weight: 800,
      color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily: hookFontFamily,
    });
    overlays.push({ input: hookImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 120 });
    if (slide.body.trim()) {
      const body = wrap(slide.body.trim(), 52, frame.maxBodyLines ?? 2).join("\n");
      const bodyImage = await rasterText(body, {
        width: frame.width, height: 105, size: frame.bodySize ?? 29, weight: 500,
        color: frame.bodyColor ?? "#4b4145", align: "center", spacing: 2, fontFamily,
      });
      overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 305 });
    }
    return overlays;
  }

  if (isFinal) {
    const headline = wrap(slide.headline, 30, frame.maxHeadlineLines ?? 3).join("\n");
    const headlineImage = await rasterText(headline, {
      width: frame.width, height: 220, size: frame.headlineSize ?? 58, weight: 800,
      color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily: hookFontFamily,
    });
    overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 390 });
    if (slide.body.trim()) {
      const body = wrap(slide.body.trim(), 46, frame.maxBodyLines ?? 5).join("\n");
      const bodyImage = await rasterText(body, {
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

  const itemText = wrap(item.toUpperCase(), 34, frame.maxHeadlineLines ?? 2).join("\n");
  const itemImage = await rasterText(itemText, {
    width: frame.width, height: 140, size: frame.headlineSize ?? 42, weight: 800,
    color: frame.headlineColor ?? "#211d1f", align: "center", spacing: 0, fontFamily,
  });
  overlays.push({ input: itemImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? 335 });

  if (slide.body.trim()) {
    const paragraphs = slide.body.split(/\n+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
    const reason = paragraphs.map((p) => wrap(p, 58, 3).join("\n")).join("\n\n");
    const reasonImage = await rasterText(reason, {
      width: frame.width, height: 300, size: frame.bodySize ?? 28, weight: 500,
      color: frame.bodyColor ?? "#4b4145", align: "center", spacing: 5, fontFamily,
    });
    overlays.push({ input: reasonImage, left: frame.bodyX ?? frame.x, top: frame.bodyY ?? 505 });
  }
  return overlays;
}

function routineKicker(slide: GeneratedSlide) {
  const text = `${slide.headline} ${slide.body}`.toLowerCase();
  if (/college|school|class/.test(text)) return "COLLEGE GIRL";
  if (/sunday/.test(text)) return "SUNDAY";
  if (/realistic/.test(text)) return "MY REALISTIC";
  return "THAT GIRL";
}

function routineCoverTitle(slide: GeneratedSlide) {
  const text = String(slide.headline ?? "").trim();
  if (/night|bedtime|evening/i.test(text)) return "NIGHT ROUTINE";
  if (/day in (?:my|the) life|day-in-the-life/i.test(text)) return "DAY IN MY LIFE";
  if (/morning|a\.m\.|\bam\b/i.test(text)) return "MORNING ROUTINE";
  if (/reset/i.test(text)) return "RESET ROUTINE";
  return text.replace(/^(?:my|that girl|realistic)\s+/i, "").toUpperCase().slice(0, 42) || "DAILY ROUTINE";
}

function routineCopyParts(slide: GeneratedSlide) {
  const source = String(slide.headline ?? "").trim();
  const time = "(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?\\s*(?:AM|PM)?|(?:[01]?\\d|2[0-3])h(?:[0-5]\\d)?";
  const range = new RegExp(`^((?:${time})\\s*(?:-|–|—|→)\\s*(?:${time}))\\s*(?:[·•|:]|\\s{2,})?\\s*(.*)$`, "i");
  const rangeMatch = source.match(range);
  if (rangeMatch) return { time: rangeMatch[1]!.trim().toUpperCase(), headline: rangeMatch[2]!.trim() };
  const single = new RegExp(`^(${time})\\s*(?:[·•|—–-]|:)\\s*(.+)$`, "i");
  const singleMatch = source.match(single);
  if (!singleMatch) return { time: "", headline: source };
  return { time: singleMatch[1]!.trim().toUpperCase(), headline: singleMatch[2]!.trim() };
}

async function routineTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const isFinal = slide.role.toUpperCase() === "CTA" || slide.role.toUpperCase() === "TAKEAWAY";
  const overlays: OverlayOptions[] = [];
  const pushShadowed = async (text: string, opts: { left: number; top: number; width: number; height: number; size: number; weight: number; align: "left" | "center" | "right"; fontFamily: string; color?: string; spacing?: number }) => {
    const shadow = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: "#171717", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily });
    const foreground = await rasterText(text, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: opts.color ?? "#fffaf8", align: opts.align, spacing: opts.spacing ?? 0, fontFamily: opts.fontFamily });
    overlays.push({ input: shadow, left: opts.left + 3, top: opts.top + 3 });
    overlays.push({ input: foreground, left: opts.left, top: opts.top });
  };

  if (isHook) {
    const kicker = routineKicker(slide);
    await pushShadowed(kicker, {
      left: frame.routineKickerX ?? 78,
      top: frame.routineKickerY ?? 96,
      width: frame.routineKickerWidth ?? 430,
      height: 70,
      size: frame.routineKickerSize ?? 44,
      weight: 400,
      align: "center",
      fontFamily: "TikTok Sans",
      spacing: 2,
    });
    const lines = wrapHook(routineCoverTitle(slide), 2, 2).join("\n");
    await pushShadowed(lines, {
      left: frame.headlineX ?? frame.x,
      top: frame.headlineY ?? frame.y,
      width: frame.width,
      height: 240,
      size: frame.hookSize ?? 76,
      weight: 800,
      align: "center",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      await pushShadowed(slide.body.trim(), {
        left: frame.bodyX ?? frame.x,
        top: frame.routineContextY ?? frame.bodyY ?? 365,
        width: Math.min(frame.width, 520),
        height: 90,
        size: frame.bodySize ?? 32,
        weight: 600,
        align: "center",
        fontFamily,
      });
    }
    return overlays;
  }

  if (isFinal) {
    const headline = wrap(slide.headline, 24, frame.maxHeadlineLines ?? 3).join("\n");
    await pushShadowed(headline, {
      left: frame.headlineX ?? frame.x,
      top: frame.headlineY ?? frame.y,
      width: frame.width,
      height: 230,
      size: frame.headlineSize ?? 58,
      weight: 700,
      align: "center",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      const body = wrap(slide.body, 42, frame.maxBodyLines ?? 3).join("\n");
      await pushShadowed(body, {
        left: frame.bodyX ?? frame.x,
        top: frame.bodyY ?? 475,
        width: frame.width,
        height: 150,
        size: frame.bodySize ?? 30,
        weight: 500,
        align: "center",
        fontFamily,
      });
    }
    return overlays;
  }

  const parts = routineCopyParts(slide);
  if (parts.time) {
    await pushShadowed(parts.time, {
      left: frame.routineTimeX ?? 390,
      top: frame.routineTimeY ?? 110,
      width: frame.routineTimeWidth ?? 300,
      height: 58,
      size: frame.routineTimeSize ?? 28,
      weight: 600,
      align: "center",
      fontFamily,
    });
  }
  const action = wrap(parts.headline, 24, frame.maxHeadlineLines ?? 2).join("\n");
  await pushShadowed(action, {
    left: frame.headlineX ?? frame.x,
    top: frame.headlineY ?? frame.y,
    width: frame.width,
    height: 170,
    size: frame.headlineSize ?? 30,
    weight: 600,
    align: "center",
    fontFamily,
  });
  if (slide.body.trim()) {
    const support = wrap(slide.body, 46, frame.maxBodyLines ?? 2).join("\n");
    await pushShadowed(support, {
      left: frame.bodyX ?? frame.x,
      top: frame.bodyY ?? 715,
      width: frame.width,
      height: 120,
      size: frame.bodySize ?? 20,
      weight: 400,
      align: "center",
      fontFamily,
    });
  }
  return overlays;
}

async function lifestyleThreeStackTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];
  const pushShadowed = async (value: string, left: number, top: number, size: number, weight: number, family: string, maxChars: number, maxLines: number) => {
    const copy = wrap(value, maxChars, maxLines).join("\n");
    const height = Math.max(70, Math.ceil(size * 1.28 * maxLines));
    const shadow = await rasterText(copy, { width: frame.width, height, size, weight, color: "#191713", align: "left", spacing: 1, fontFamily: family });
    const text = await rasterText(copy, { width: frame.width, height, size, weight, color: "#fff0a6", align: "left", spacing: 1, fontFamily: family });
    overlays.push({ input: shadow, left: left + 3, top: top + 3 });
    overlays.push({ input: text, left, top });
  };
  await pushShadowed(slide.headline.toLowerCase(), frame.headlineX ?? frame.x, frame.headlineY ?? frame.y, frame.headlineSize ?? 43, 700, isHook ? hookFontFamily : fontFamily, isHook ? 24 : 30, frame.maxHeadlineLines ?? 2);
  if (slide.body.trim()) {
    await pushShadowed(slide.body.trim(), frame.bodyX ?? frame.x, frame.bodyY ?? 735, frame.bodySize ?? 27, 550, fontFamily, isHook ? 46 : 48, frame.maxBodyLines ?? 4);
  }
  return overlays;
}

async function personaExplainerTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  const overlays: OverlayOptions[] = [];
  const shadowed = async (value: string, opts: { left: number; top: number; width: number; height: number; size: number; weight: number; family: string; align?: "left" | "center" | "right"; color?: string }) => {
    const shadow = await rasterText(value, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: "#15110f", align: opts.align ?? "left", spacing: 2, fontFamily: opts.family });
    const foreground = await rasterText(value, { width: opts.width, height: opts.height, size: opts.size, weight: opts.weight, color: opts.color ?? "#fffaf8", align: opts.align ?? "left", spacing: 2, fontFamily: opts.family });
    overlays.push({ input: shadow, left: opts.left + 3, top: opts.top + 3 });
    overlays.push({ input: foreground, left: opts.left, top: opts.top });
  };

  const headline = wrap(slide.headline, isHook ? 22 : 30, frame.maxHeadlineLines ?? (isHook ? 3 : 2)).join("\n");
  await shadowed(headline, {
    left: frame.headlineX ?? frame.x,
    top: frame.headlineY ?? frame.y,
    width: frame.width,
    height: Math.max(120, Math.round((frame.headlineSize ?? 48) * 1.25 * (frame.maxHeadlineLines ?? 3))),
    size: frame.headlineSize ?? 48,
    weight: frame.headlineWeight ?? 800,
    family: isHook ? hookFontFamily : fontFamily,
    color: frame.headlineColor ?? "#fffaf8",
  });

  const raw = String(slide.body ?? "").trim();
  if (!raw) return overlays;
  const observations = raw.includes("|")
    ? raw.split("|").map((item) => item.trim()).filter(Boolean)
    : raw.split(/(?<=[.!?])\s+|\s*[;•]\s*/).map((item) => item.trim()).filter(Boolean);
  const body = observations.slice(0, isHook ? 2 : 4).map((item) => isHook ? item : "• " + item).join("\n");
  await shadowed(body, {
    left: frame.bodyX ?? frame.x,
    top: frame.bodyY ?? ((frame.headlineY ?? frame.y) + 190),
    width: frame.width,
    height: isHook ? 170 : 300,
    size: frame.bodySize ?? 27,
    weight: frame.bodyWeight ?? 550,
    family: fontFamily,
    color: frame.bodyColor ?? "#fffaf8",
  });
  return overlays;
}

async function makeRasterTextOverlays(slide: GeneratedSlide, geometry: Geometry, hookDesign?: HookDesign): Promise<OverlayOptions[]> {
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
    for (const [index, line] of hookHeadline.entries()) {
      const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
      const lineImage = await rasterText(line, { width: hookWidth, height: Math.ceil(hookSize * 1.22), size: hookSize, weight: design.weight, color: frame.headlineColor ?? "#fffaf8", align: "left", spacing: 0, fontFamily: hookFontFamily });
      overlays.push({ input: lineImage, left: hookX, top: hookTop + index * (hookSize + Math.max(8, design.lineGap)) });
    }
    return overlays;
  }
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const headlineImage = await rasterText(headline.join("\n"), { width: frame.width, height: headline.length * headlineLineHeight + 18, size: headlineSize, weight: frame.headlineWeight ?? 700, color: frame.headlineColor ?? "#fffaf8", align, spacing: Math.max(0, headlineLineHeight - headlineSize), fontFamily });
  overlays.push({ input: headlineImage, left: frame.headlineX ?? frame.x, top: frame.headlineY ?? frame.y });
  if (body.length) {
    const bodyImage = await rasterText(body.join("\n"), { width: frame.width, height: body.length * bodyLineHeight + 18, size: bodySize, weight: frame.bodyWeight ?? 500, color: frame.bodyColor ?? "#fff4b8", align, spacing: Math.max(0, bodyLineHeight - bodySize), fontFamily });
    const bodyTop = frame.bodyY ?? ((frame.headlineY ?? frame.y) + headline.length * headlineLineHeight + 22);
    overlays.push({ input: bodyImage, left: frame.bodyX ?? frame.x, top: bodyTop });
  }
  return overlays;
}

async function fitEditorImage(bytes: Buffer, frame: Frame) {
  const width = Math.max(1, Math.round(frame.width));
  const height = Math.max(1, Math.round(frame.height ?? HEIGHT));
  const zoom = Math.max(1, Math.min(4, Number(frame.zoom ?? 1)));
  const cropX = Math.max(0, Math.min(100, Number(frame.cropX ?? 50))) / 100;
  const cropY = Math.max(0, Math.min(100, Number(frame.cropY ?? 50))) / 100;
  if (frame.fit === "contain" && zoom === 1) {
    return sharp(bytes).rotate().resize({ width, height, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  const metadata = await sharp(bytes).rotate().metadata();
  const sourceW = metadata.width ?? width;
  const sourceH = metadata.height ?? height;
  const scale = Math.max(width / sourceW, height / sourceH) * zoom;
  const resizedW = Math.max(width, Math.ceil(sourceW * scale));
  const resizedH = Math.max(height, Math.ceil(sourceH * scale));
  const resized = await sharp(bytes).rotate().resize({ width: resizedW, height: resizedH, fit: "fill" }).png().toBuffer();
  const maxLeft = Math.max(0, resizedW - width);
  const maxTop = Math.max(0, resizedH - height);
  return sharp(resized).extract({
    left: Math.min(maxLeft, Math.round(maxLeft * cropX)),
    top: Math.min(maxTop, Math.round(maxTop * cropY)),
    width,
    height,
  }).png().toBuffer();
}

function editorSlot(geometry: Geometry, index: number, fallback: { left: number; top: number; width: number; height: number }) {
  const custom = geometry.imageSlots?.[index];
  return custom ? {
    left: Math.round(custom.x ?? fallback.left), top: Math.round(custom.y ?? fallback.top),
    width: Math.round(custom.width ?? fallback.width), height: Math.round(custom.height ?? fallback.height),
    cropX: custom.cropX, cropY: custom.cropY, zoom: custom.zoom, fit: custom.fit ?? "cover",
  } : { ...fallback, cropX: 50, cropY: 50, zoom: 1, fit: "cover" as const };
}

async function renderSlide(slide: GeneratedSlide, matches: AssetMatch[], geometry: Geometry) {
  const imageFrame = { ...defaultGeometry.image, ...geometry.image } as Frame;
  const composites: OverlayOptions[] = [];
  let hookDesign: HookDesign | undefined;
  let averageLuminance = 128;
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";

  if (imageFrame.mode === "grid-2x2") {
    const tileWidth = 500;
    const tileHeight = 635;
    const positions = [[32, 32], [548, 32], [32, 683], [548, 683]];
    for (const [index, match] of matches.slice(0, 4).entries()) {
      const imageBytes = await selectedAssetBytes(match);
      if (index === 0) {
        const stats = await sharp(imageBytes).stats();
        averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
      }
      const [fallbackLeft, fallbackTop] = positions[index]!;
      const place = editorSlot(geometry, index, { left: fallbackLeft, top: fallbackTop, width: tileWidth, height: tileHeight });
      const fitted = await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place });
      if (index === 0) hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
      composites.push({ input: fitted, left: place.left, top: place.top });
    }
  } else if (imageFrame.mode === "three-rect-educational") {
    const placements = isHook
      ? [
          { left: 690, top: 90, width: 300, height: 390 },
          { left: 90, top: 830, width: 300, height: 390 },
        ]
      : [
          { left: 80, top: 110, width: 450, height: 430 },
          { left: 90, top: 820, width: 390, height: 390 },
          { left: 600, top: 820, width: 390, height: 390 },
        ];
    for (const [index, match] of matches.slice(0, isHook ? 2 : 3).entries()) {
      const imageBytes = await selectedAssetBytes(match);
      const place = editorSlot(geometry, index, placements[index]!);
      const fitted = geometry.imageSlots?.[index] ? await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place }) : await roundedPhoto(imageBytes, place.width, place.height, 22);
      composites.push({ input: fitted, left: place.left, top: place.top });
    }
    averageLuminance = 245;
  } else if (imageFrame.mode === "editorial-asym-hero") {
    const placements = [
      { left: 60, top: 190, width: 590, height: 770 },
      { left: 690, top: 215, width: 310, height: 310 },
      { left: 690, top: 555, width: 310, height: 310 },
    ];
    for (const [index, match] of matches.slice(0, 3).entries()) {
      const imageBytes = await selectedAssetBytes(match);
      const place = editorSlot(geometry, index, placements[index]!);
      const fitted = await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place });
      composites.push({ input: fitted, left: place.left, top: place.top });
    }
    averageLuminance = 235;
  } else if (imageFrame.mode === "editorial-collage") {
    const pair = matches.slice(0, 2);
    const placements = isHook
      ? [{ left: 42, top: 70, width: 570, height: 760 }, { left: 610, top: 210, width: 420, height: 600 }]
      : [{ left: 50, top: 70, width: 500, height: 700 }, { left: 560, top: 150, width: 470, height: 620 }];
    for (const [index, match] of pair.entries()) {
      const imageBytes = await selectedAssetBytes(match);
      const place = editorSlot(geometry, index, placements[index]!);
      const fitted = await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place });
      composites.push({ input: fitted, left: place.left, top: place.top });
    }
    averageLuminance = 220;
  } else if (imageFrame.mode === "lifestyle-3stack") {
    if (isHook) {
      const imageBytes = await selectedAssetBytes(matches[0]!);
      const stats = await sharp(imageBytes).stats();
      averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
      const place = editorSlot(geometry, 0, { left: 0, top: 0, width: 1080, height: 1350 });
      const fitted = await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place });
      composites.push({ input: fitted, left: place.left, top: place.top });
    } else {
      const placements = [
        { left: 0, top: 0, width: 1080, height: 450 },
        { left: 0, top: 450, width: 1080, height: 450 },
        { left: 0, top: 900, width: 1080, height: 450 },
      ];
      for (const [index, match] of matches.slice(0, 3).entries()) {
        const imageBytes = await selectedAssetBytes(match);
        const place = editorSlot(geometry, index, placements[index]!);
        const fitted = await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place });
        composites.push({ input: fitted, left: place.left, top: place.top });
      }
      averageLuminance = 100;
    }
  } else if (imageFrame.mode === "ranking") {
    const isFinal = new Set(["CTA", "TAKEAWAY"]).has(slide.role.toUpperCase());
    const tier = rankingCopyParts(slide).score.toUpperCase();
    const tierWash: Record<string, string> = {
      F: "#FCE7E7", D: "#FDEBE5", C: "#FFF0E2", B: "#FFF8DD",
      A: "#EDF4FF", S: "#EAF7EC", SS: "#F5EFFF",
    };
    const wash = isHook || isFinal ? "#ffffff" : (tierWash[tier] ?? "#ffffff");
    composites.push({ input: Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="50%" r="72%"><stop offset="0%" stop-color="#ffffff"/><stop offset="72%" stop-color="#ffffff"/><stop offset="100%" stop-color="${wash}"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#g)"/></svg>`), left: 0, top: 0 });
    if (isHook && matches.length >= 2) {
      const placements = [
        { left: 70, top: 650, width: 450, height: 420 },
        { left: 560, top: 650, width: 450, height: 420 },
      ];
      for (const [index, match] of matches.slice(0, 2).entries()) {
        const imageBytes = await selectedAssetBytes(match);
        const place = editorSlot(geometry, index, placements[index]!);
        const fitted = geometry.imageSlots?.[index]
          ? await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place })
          : await roundedPhoto(imageBytes, place.width, place.height, 24);
        composites.push({ input: fitted, left: place.left, top: place.top });
      }
    }
    // Body and final tier slides are intentionally text-first. No decorative image by default.
    averageLuminance = 235;
  } else {
    const match = matches[0]!;
    const imageBytes = await selectedAssetBytes(match);
    const stats = await sharp(imageBytes).stats();
    averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
    const fitted = await fitEditorImage(imageBytes, imageFrame);
    hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
    composites.push({ input: fitted, left: imageFrame.x, top: imageFrame.y });
    if (imageFrame.mode === "persona-explainer") {
      composites.push({
        input: Buffer.from('<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="38%" stop-color="#12100f" stop-opacity="0"/><stop offset="72%" stop-color="#12100f" stop-opacity=".42"/><stop offset="100%" stop-color="#12100f" stop-opacity=".78"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/></svg>'),
        left: 0,
        top: 0,
      });
    }
    if (imageFrame.mode === "interactive-checklist" && !isHook) {
      const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
      const panelWidth = frame.checklistPanelWidth ?? 850;
      const panelHeight = frame.checklistPanelHeight ?? 930;
      composites.push({ input: await checklistPanel(panelWidth, panelHeight), left: frame.checklistPanelX ?? 115, top: frame.checklistPanelY ?? 235 });
    }
  }

  const forceDark = imageFrame.mode === "three-rect-educational" || imageFrame.mode === "editorial-asym-hero" || imageFrame.mode === "editorial-collage" || imageFrame.mode === "ranking" || imageFrame.mode === "interactive-checklist";
  const readablePalette = forceDark || averageLuminance > 158
    ? { headlineColor: "#1f2933", bodyColor: "#1f2933", accentColor: "#1f2933" }
    : { headlineColor: "#fffaf5", bodyColor: "#fffaf5", accentColor: "#fffaf5" };
  const manualText = (geometry.text ?? {}) as Record<string, unknown>;
  const readableGeometry = { ...geometry, text: geometry.text ? {
    ...geometry.text,
    headlineColor: manualText.editorHeadlineColor ?? readablePalette.headlineColor,
    bodyColor: manualText.editorBodyColor ?? readablePalette.bodyColor,
    accentColor: manualText.editorAccentColor ?? readablePalette.accentColor,
  } : geometry.text } as Geometry;
  const textFrame = readableGeometry.text;
  const layoutHookDesign: HookDesign | undefined = isHook && forceDark && textFrame
    ? {
        format: imageFrame.mode ?? "single",
        x: textFrame.x,
        y: textFrame.headlineY ?? textFrame.y,
        width: textFrame.width,
        size: textFrame.hookSize ?? 44,
        weight: textFrame.headlineWeight ?? 700,
        maxWordsPerLine: 4,
        lineGap: 8,
        align: textFrame.align ?? "left",
        textColor: readablePalette.headlineColor,
        accentColor: readablePalette.accentColor,
        hookColor: readablePalette.headlineColor,
      }
    : hookDesign;
  if (imageFrame.mode === "lifestyle-3stack") {
    composites.push(...await lifestyleThreeStackTextOverlays(slide, geometry));
  } else if (imageFrame.mode === "routine-timeline") {
    composites.push(...await routineTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "three-rect-educational") {
    composites.push(...await threeRectEducationalTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "editorial-asym-hero") {
    composites.push(...await editorialAsymTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "ranking") {
    composites.push(...await rankingTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "interactive-checklist") {
    composites.push(...await checklistTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "persona-explainer") {
    composites.push(...await personaExplainerTextOverlays(slide, readableGeometry));
  } else {
    composites.push(...await makeRasterTextOverlays(slide, geometryForVisualMetadata(readableGeometry, matches[0]), layoutHookDesign));
  }
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: "#f7f3eb" } }).composite(composites).png({ quality: 94 }).toBuffer();
}

async function uploadRender(carouselId: string, position: number, bytes: Buffer) {
  const storagePath = `renders/${carouselId}/slide_${String(position).padStart(2, "0")}.png`;
  const upload = await uploadConvexFile(new Uint8Array(bytes), "image/png");
  return { storagePath, ...upload };
}

export async function renderCarousel(input: {
  id: string;
  carouselType: string;
  layout: string;
  slides: GeneratedSlide[];
  personaId?: string;
  references?: StoredReference[];
  spec: Record<string, unknown>;
}) {
  assertCortiFreeCarouselId(input.id);
  input = { ...input, layout: canonicalLayoutFor(input.carouselType, input.layout) };
  const visualPersonaId = visualPersonaIdFor(input.personaId);
  let assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  const personaHookIds = assets
    .filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === visualPersonaId)
    .map((asset) => String(asset.id));
  let recentHookAssetIds = new Set<string>();
  if (input.personaId && personaHookIds.length) {
    const history = await dataBackend(`asset_usage_history?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&asset_id=in.(${personaHookIds.map(encodeURIComponent).join(',')})&slide_position=eq.1&select=asset_id&order=used_at.desc&limit=10`);
    if (history.ok) {
      const recent = await history.json() as Array<{ asset_id?: string | number }>;
      recentHookAssetIds = new Set(recent.map((row) => String(row.asset_id ?? '')).filter(Boolean));
    }
  }
  const usedReferenceIds = new Set<string>();
  const repairedPositions = new Set<number>();
  const editorOverrides = ((input.spec.editor_overrides ?? {}) as Record<string, { headline?: string; body?: string; assetId?: string | number; assetIds?: Array<string | number>; text?: Record<string, unknown>; image?: Record<string, unknown>; imageSlots?: Frame[] }>);
  const previousRendered = Array.isArray(input.spec.rendered_slides) ? input.spec.rendered_slides as Array<Record<string, unknown>> : [];
  function lockedIdsForSlide(slide: GeneratedSlide, index: number) {
    const override = editorOverrides[String(slide.position)] ?? {};
    if (override.assetIds?.length) return override.assetIds;
    if (override.assetId != null) return [override.assetId];
    const previous = previousRendered.find((item) => Number(item.position) === Number(slide.position)) ?? previousRendered[index];
    const previousIds = Array.isArray(previous?.assetIds) ? previous!.assetIds as Array<string | number> : [];
    if (previousIds.length) return previousIds;
    return previous?.assetId != null ? [previous.assetId as string | number] : [];
  }
  function lockedMatchesForSlide(slide: GeneratedSlide, index: number): AssetMatch[] {
    return lockedIdsForSlide(slide, index).map((id) => {
      const asset = assets.find((item) => String(item.id) === String(id));
      return asset ? { asset, score: 999, matchedTerms: ["locked_existing_asset"], fallbackPath: "locked_existing_asset", thresholdBypassed: true } as AssetMatch : null;
    }).filter((item): item is AssetMatch => Boolean(item));
  }
  function rerenderSupportFallback(primary: AssetMatch, used: Set<string>): AssetMatch | null {
    if (!previousRendered.length) return null;
    const candidates = assets.filter((asset) => !used.has(String(asset.id)));
    const ranked = candidates.sort((a, b) => {
      const score = (asset: typeof a) =>
        (asset.persona_id === input.personaId ? 100 : 0)
        + (asset.category === primary.asset.category ? 30 : 0)
        + (asset.source_type === "persona_generated" ? 10 : 0)
        - Number(asset.use_count ?? 0);
      return score(b) - score(a);
    });
    const asset = ranked[0];
    return asset ? { asset, score: 0, matchedTerms: [], fallbackPath: "rerender_support_fallback", thresholdBypassed: true } as AssetMatch : null;
  }
  const multiImageLayout = input.layout === "three-rect-educational"
    || input.layout === "editorial-asym-hero"
    || input.layout === "editorial-collage"
    || input.layout === "ranking"
    || input.layout === "lifestyle-3stack";

  function primarySelectionSlide(slide: GeneratedSlide): GeneratedSlide {
    const slotAware = input.layout === "three-rect-educational"
      ? educationalAssetSlideForSlot(slide, 0)
      : input.layout === "grid-2x2"
        ? gridAssetSlideForSlot(slide, 0)
        : slide;
    const normalized = (multiImageLayout || input.layout === "grid-2x2")
      ? withoutAppScreenshotDirective(slotAware)
      : slotAware;
    return normalized.assetType === "generated"
      ? { ...normalized, assetType: "persona" }
      : normalized;
  }

  let gridMatches: AssetMatch[][] = [];
  for (let attempt = 0; attempt <= Math.max(2, input.slides.length); attempt += 1) {
    try {
      // Masters and raw Pinterest references are never renderable output. They
      // may only enter through the ModelArk repair path above.
      const selectionSlides = input.slides;
      const matches = selectionSlides.map((slide, selectionIndex): AssetMatch | undefined => {
        const actualIndex = selectionIndex;
        if (input.layout === "ranking" && rankingAssetCountForSlide(slide) === 0) return undefined;
        const locked = lockedMatchesForSlide(slide, actualIndex)[0];
        if (locked) return locked;
        return chooseAssets({
          assets,
          carouselType: input.carouselType,
          personaId: input.personaId,
          excludedAssetIds: recentHookAssetIds,
          slides: [primarySelectionSlide(slide)],
        })[0]!;
      });
      if (input.layout === "interactive-checklist") {
        const usedChecklistAssets = new Set<string>();
        gridMatches = input.slides.map((slide, index) => {
          const locked = lockedMatchesForSlide(slide, index)[0];
          if (locked) {
            usedChecklistAssets.add(String(locked.asset.id));
            return [locked];
          }
          const category = generationCategory(slide);
          const preferPersona = category === "self_care"
            || category === "fitness"
            || category === "outdoors"
            || (category === "home" && index % 2 === 0);
          const preferredSlide = { ...slide, assetType: preferPersona ? "persona" : "stock" };
          let selected: AssetMatch;
          try {
            selected = chooseAssets({
              assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              excludedAssetIds: new Set([...recentHookAssetIds, ...usedChecklistAssets]),
              slides: [preferredSlide],
            })[0]!;
          } catch {
            selected = chooseAssets({
              assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              excludedAssetIds: new Set([...recentHookAssetIds, ...usedChecklistAssets]),
              slides: [slide],
            })[0]!;
          }
          usedChecklistAssets.add(String(selected.asset.id));
          return [selected];
        });
        break;
      }
      if (input.layout !== "grid-2x2" && !multiImageLayout) {
        gridMatches = input.slides.map((_, index) => [matches[index]!]);
        break;
      }

      const usedCarouselAssets = new Set<string>(matches.filter((match): match is AssetMatch => Boolean(match)).map((match) => String(match.asset.id)));
      if (multiImageLayout) {
        gridMatches = input.slides.map((slide, index) => {
          const locked = lockedMatchesForSlide(slide, index);
          const desiredCount = input.layout === "three-rect-educational"
            ? ((index === 0 || slide.role.toUpperCase() === "HOOK") ? 2 : 3)
            : input.layout === "editorial-asym-hero"
              ? 3
            : input.layout === "editorial-collage"
              ? 2
            : input.layout === "lifestyle-3stack"
              ? ((index === 0 || slide.role.toUpperCase() === "HOOK") ? 1 : 3)
            : input.layout === "ranking"
              ? rankingAssetCountForSlide(slide)
              : (index === 0 || slide.role.toUpperCase() === "HOOK") ? 2 : 1;
          if (desiredCount === 0) return [];
          const primary = locked[0] ?? matches[index];
          if (!primary) throw new Error(`ASSET_SELECTION_MISSING:slide_${slide.position}`);
          if (desiredCount === 1) return [primary];
          const selected: AssetMatch[] = locked.length ? locked.slice(0, desiredCount) : [primary];
          selected.forEach((match) => usedCarouselAssets.add(String(match.asset.id)));
          while (selected.length < desiredCount) {
            try {
              const needsAppScreenshot = requiresOfficialAppScreenshot(slide);
              const alreadyHasAppScreenshot = selected.some((match) => match.asset.source_type === "app_screenshot");
              const supportSlide = needsAppScreenshot && !alreadyHasAppScreenshot
                ? slide
                : input.layout === "three-rect-educational"
                  ? educationalAssetSlideForSlot(slide, selected.length)
                  : {
                      ...withoutAppScreenshotDirective(slide),
                      position: Math.max(2, slide.position),
                      role: "SUPPORT",
                      assetType: input.layout === "lifestyle-3stack" ? "persona" : "stock",
                    };
              const next = chooseAssets({
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: usedCarouselAssets,
                slides: [supportSlide],
              })[0]!;
              selected.push(next);
              usedCarouselAssets.add(String(next.asset.id));
            } catch (error) {
              const fallback = rerenderSupportFallback(primary, usedCarouselAssets);
              if (fallback) {
                selected.push(fallback);
                usedCarouselAssets.add(String(fallback.asset.id));
                continue;
              }
              const message = error instanceof Error ? error.message : String(error);
              throw new Error(`${message}:slide_${slide.position}`);
            }
          }
          return selected;
        });
        break;
      }

      const usedGridAssets = new Set<string>();
      gridMatches = input.slides.map((slide, index) => {
        const locked = lockedMatchesForSlide(slide, index);
        const primary = locked[0] ?? matches[index];
        if (!primary) throw new Error(`ASSET_SELECTION_MISSING:slide_${slide.position}`);
        usedGridAssets.add(String(primary.asset.id));
        const isHook = index === 0 || slide.role.toUpperCase() === "HOOK";
        if (isHook) return [primary];
        if (locked.length >= 4) return locked.slice(0, 4);
        if (locked.length >= 2) return [locked[0]!, locked[1]!, locked[1]!, locked[0]!];

        const supportSlide = requiresOfficialAppScreenshot(slide)
          ? slide
          : gridAssetSlideForSlot(slide, 1);
        let secondary: AssetMatch;
        try {
          secondary = chooseAssets({
            assets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            excludedAssetIds: new Set([...usedGridAssets, String(primary.asset.id)]),
            slides: [supportSlide],
          })[0]!;
        } catch {
          // Prefer carousel-wide novelty, but do not make novelty itself a
          // render blocker. Reuse elsewhere is acceptable; duplicate within
          // this 2x2 slide is not.
          try {
            secondary = chooseAssets({
              assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              excludedAssetIds: new Set([String(primary.asset.id)]),
              slides: [supportSlide],
            })[0]!;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${message}:slide_${slide.position}`);
          }
        }
        usedGridAssets.add(String(secondary.asset.id));
        return [primary, secondary, secondary, primary];
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const position = Number(message.match(/slide_(\d+)/)?.[1] ?? 0);
      if (!position || repairedPositions.has(position)) throw error;
      const failedSlide = input.slides[position - 1]!;
      const isHook = failedSlide.position === 1 || failedSlide.role.toUpperCase() === "HOOK";
      const repairCanBecomeSelectable = isHook
        || failedSlide.assetType === "persona"
        || failedSlide.assetType === "generated"
        || input.layout === "grid-2x2"
        || input.layout === "lifestyle-3stack";
      // ModelArk repair currently creates persona-generated assets. Generating
      // one for a stock-only F04/F05 slot cannot satisfy that slot and merely
      // burns time/cost before failing again.
      if (!repairCanBecomeSelectable) throw error;
      repairedPositions.add(position);
      await generateRepairAsset({ input, slide: failedSlide, position, usedReferenceIds });
      assets = await loadSelectableAssets();
    }
  }
  if (!gridMatches.length) throw new Error("CAROUSEL_RENDER_SELECTION_FAILED");
  const prepared = await Promise.all(input.slides.map(async (sourceSlide, index) => {
    const override = editorOverrides[String(sourceSlide.position)] ?? {};
    const slide = { ...sourceSlide, headline: override.headline ?? sourceSlide.headline, body: override.body ?? sourceSlide.body };
    let slideMatches = gridMatches[index] ?? [];
    const isTextOnlyRanking = input.layout === "ranking" && rankingAssetCountForSlide(slide) === 0;
    if (!isTextOnlyRanking && override.assetIds?.length) {
      slideMatches = slideMatches.map((match, slot) => {
        const requested = override.assetIds?.[slot];
        const forced = requested == null ? null : assets.find((asset) => String(asset.id) === String(requested));
        return forced ? { asset: forced, score: 999, matchedTerms: ["editor_override"], fallbackPath: "editor_override" } : match;
      });
    } else if (!isTextOnlyRanking && override.assetId != null) {
      const forced = assets.find((asset) => String(asset.id) === String(override.assetId));
      if (forced) slideMatches = [{ asset: forced, score: 999, matchedTerms: ["editor_override"], fallbackPath: "editor_override" }, ...slideMatches.slice(1)];
    }
    // The selected model is authoritative. AI copy may return an old layout alias;
    // never let that silently turn a 2x2 request back into a single-photo slide.
    const slideLayout = input.layout === "grid-2x2" && (index === 0 || slide.role.toUpperCase() === "HOOK")
      ? "single-image"
      : input.layout;
    const typography = typographyForCarousel(input.id);
    const isRoutineCtaFinal = input.layout === "routine-timeline"
      && index === input.slides.length - 1
      && new Set(["CTA", "TAKEAWAY"]).has(slide.role.toUpperCase());
    const isVisualFinal = index === input.slides.length - 1
      && (input.layout !== "routine-timeline" || isRoutineCtaFinal);
    const baseGeometry = getSlideGeometry({ ...slide, layout: slideLayout }, index === 0, isVisualFinal, typography) as Geometry;
    const singleImageMode = new Set(["single", "routine-timeline", "interactive-checklist", "persona-explainer"]).has(String(baseGeometry.image?.mode ?? "single"));
    const slotZeroImage = singleImageMode && override.imageSlots?.[0] ? override.imageSlots[0] : {};
    const geometry = {
      ...baseGeometry,
      image: { ...(baseGeometry.image ?? {}), ...slotZeroImage, ...(override.image ?? {}) },
      imageSlots: override.imageSlots,
      text: { ...(baseGeometry.text ?? {}), ...(override.text ?? {}) },
    } as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0];
    const renderMetadata = {
      geometry,
      storage_path: upload.storagePath,
      asset_score: primaryMatch?.score ?? null,
      matched_terms: primaryMatch?.matchedTerms ?? [],
      selection: primaryMatch ? {
        candidate_pool_size: primaryMatch.candidatePoolSize ?? null,
        selected_asset_id: primaryMatch.asset.id,
        final_score: primaryMatch.score,
        fallback_path: primaryMatch.fallbackPath ?? "primary",
        threshold: primaryMatch.threshold ?? null,
        threshold_bypassed: primaryMatch.thresholdBypassed ?? false,
        visual_intent: primaryMatch.visualIntent ?? null,
        matched_dimensions: primaryMatch.matchedDimensions ?? [],
        matched_settings: primaryMatch.matchedSettings ?? [],
        matched_compositions: primaryMatch.matchedCompositions ?? [],
        description_score: primaryMatch.descriptionScore ?? null,
        object_score: primaryMatch.objectScore ?? null,
        action_score: primaryMatch.actionScore ?? null,
        setting_score: primaryMatch.settingScore ?? null,
        composition_score: primaryMatch.compositionScore ?? null,
        repetition_penalty: primaryMatch.repetitionPenalty ?? null,
        top_candidates: primaryMatch.topCandidates ?? [],
        category_bonus: primaryMatch.categoryBonus ?? null,
      } : {
        candidate_pool_size: 0,
        selected_asset_id: null,
        final_score: null,
        fallback_path: "text_only",
        threshold: null,
        threshold_bypassed: false,
        visual_intent: null,
        matched_dimensions: [],
        matched_settings: [],
        matched_compositions: [],
        description_score: null,
        object_score: null,
        action_score: null,
        setting_score: null,
        composition_score: null,
        repetition_penalty: null,
        top_candidates: [],
        category_bonus: null,
      },
      asset_ids: slideMatches.map((match) => match.asset.id),
      asset_source_types: slideMatches.map((match) => match.asset.source_type ?? null),
    };
    return {
      databaseRow: { workspace_id: CORTIFREE_WORKSPACE_ID, carousel_id: input.id, position: slide.position, template_id: input.layout, headline: slide.headline, body: slide.body, asset_requirement: { query: slide.assetQuery, visual_intent: slide.visualIntent }, asset_id: primaryMatch?.asset.id ?? null, rendered_url: upload.publicUrl, render_metadata: renderMetadata },
      result: { position: slide.position, url: upload.publicUrl, assetId: primaryMatch?.asset.id ?? null, assetFilename: primaryMatch?.asset.filename ?? null, score: primaryMatch?.score ?? null, matchedTerms: primaryMatch?.matchedTerms ?? [], geometry, assetIds: slideMatches.map((match) => match.asset.id), assetSourceTypes: slideMatches.map((match) => match.asset.source_type ?? null) },
    };
  }));
  const slideResponse = await dataBackend("carousel_slides?on_conflict=carousel_id,position", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(prepared.map((item) => item.databaseRow)),
  });
  if (!slideResponse.ok) throw new Error(`Slide save failed: ${await slideResponse.text()}`);
  const rendered = prepared.map((item) => item.result).sort((a, b) => a.position - b.position);

  const now = new Date().toISOString();
  await Promise.all(gridMatches.flatMap((slideMatches, index) => slideMatches.map(async (match) => {
    if (match !== slideMatches[0]) {
      await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(match.asset.id)}`, { method: "PATCH", body: JSON.stringify({ use_count: (match.asset.use_count ?? 0) + 1, last_used_at: now }) });
      return;
    }
    await dataBackend("asset_usage_history?on_conflict=carousel_id,slide_position", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, asset_id: match.asset.id, carousel_id: input.id, slide_position: input.slides[index].position, match_score: match.score, matched_terms: match.matchedTerms }),
    });
    await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(match.asset.id)}`, { method: "PATCH", body: JSON.stringify({ use_count: (match.asset.use_count ?? 0) + 1, last_used_at: now }) });
  })));

  const updatedSpec = {
    ...input.spec,
    typography: typographyForCarousel(input.id),
    rendered_slides: rendered,
    rendered_at: now,
    editor_structure_dirty: false,
  };
  const carouselResponse = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(input.id)}`, { method: "PATCH", body: JSON.stringify({ spec: updatedSpec, updated_at: now }) });
  if (!carouselResponse.ok) throw new Error(`Carousel render state save failed: ${await carouselResponse.text()}`);
  return rendered;
}


export async function renderCarouselRevision(input: {
  id: string;
  carouselType: string;
  layout: string;
  slides: GeneratedSlide[];
  personaId?: string;
  spec: Record<string, unknown>;
  changedPositions: number[];
  visualChangePositions?: number[];
}) {
  assertCortiFreeCarouselId(input.id);
  const changed = new Set(input.changedPositions);
  const visualChanges = new Set(input.visualChangePositions ?? []);
  if (!changed.size) return Array.isArray(input.spec.rendered_slides) ? input.spec.rendered_slides as any[] : [];

  let assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  const assetMap = new Map(assets.map((asset) => [String(asset.id), asset]));
  const existingResponse = await dataBackend(
    `carousel_slides?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(input.id)}&select=position,asset_id,rendered_url,render_metadata&order=position.asc`,
  );
  if (!existingResponse.ok) throw new Error(`Existing slide lookup failed: ${await existingResponse.text()}`);
  const existingRows = await existingResponse.json() as Array<{
    position: number;
    asset_id?: string | number | null;
    rendered_url?: string | null;
    render_metadata?: Record<string, any>;
  }>;
  const existingByPosition = new Map(existingRows.map((row) => [Number(row.position), row]));
  const previousRendered = Array.isArray(input.spec.rendered_slides) ? input.spec.rendered_slides as any[] : [];
  const previousByPosition = new Map(previousRendered.map((row: any) => [Number(row.position), row]));
  const usedReferenceIds = new Set<string>();
  const typography = typographyForCarousel(input.id);
  const prepared: Array<{ databaseRow: Record<string, unknown>; result: any }> = [];

  for (const slide of input.slides.filter((item) => changed.has(item.position))) {
    const existing = existingByPosition.get(slide.position);
    let slideMatches: AssetMatch[] = [];
    const isTextOnlyRanking = input.layout === "ranking" && rankingAssetCountForSlide(slide) === 0;

    if (isTextOnlyRanking) {
      slideMatches = [];
    } else if (!visualChanges.has(slide.position)) {
      const previous = previousByPosition.get(slide.position);
      const existingUrl = existing?.rendered_url ?? (typeof previous?.url === "string" ? previous.url : null);
      if (!existingUrl) throw new Error(`REVISION_EXISTING_RENDER_MISSING:slide_${slide.position}`);
      const assetIds: string[] = Array.isArray(existing?.render_metadata?.asset_ids)
        ? existing!.render_metadata!.asset_ids.map(String)
        : Array.isArray(previous?.assetIds)
          ? previous.assetIds.map(String)
          : existing?.asset_id != null
            ? [String(existing.asset_id)]
            : previous?.assetId != null ? [String(previous.assetId)] : [];
      if (!assetIds.length) throw new Error(`REVISION_EXISTING_ASSET_MISSING:slide_${slide.position}`);
      slideMatches = assetIds.map((id, index) => {
        const asset = assetMap.get(id) ?? {
          id,
          filename: String(previous?.assetFilename ?? `preserved-${id}.jpg`),
          category: "preserved",
          subcategory: "review",
          orientation: "portrait",
          framing: "existing",
          activity: "",
          mood: "",
          colors: [],
          tags: [],
          public_url: existingUrl,
          use_count: 0,
          last_used_at: null,
          source_type: Array.isArray(previous?.assetSourceTypes) ? previous.assetSourceTypes[index] ?? "preserved" : "preserved",
        };
        return {
          asset,
          score: Number(existing?.render_metadata?.asset_score ?? previous?.score ?? 100),
          matchedTerms: Array.isArray(existing?.render_metadata?.matched_terms)
            ? existing!.render_metadata!.matched_terms
            : Array.isArray(previous?.matchedTerms) ? previous.matchedTerms : [],
          fallbackPath: assetMap.has(id) ? "review_preserved_visual" : "review_preserved_render_url",
          thresholdBypassed: true,
        } satisfies AssetMatch;
      });
    } else {
      let selected = false;
      for (let attempt = 0; attempt < 2 && !selected; attempt += 1) {
        try {
          const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
          if (input.layout === "grid-2x2" && !isHook) {
            const personaAssets = assets.filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === input.personaId);
            const personaMatch = chooseAssets({
              assets: personaAssets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              slides: [{ ...withoutAppScreenshotDirective(slide), assetType: "persona" }],
            })[0]!;
            if (requiresOfficialAppScreenshot(slide)) {
              const appMatch = chooseAssets({
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: new Set([String(personaMatch.asset.id)]),
                slides: [{ ...slide, assetType: "stock" }],
              })[0]!;
              slideMatches = [personaMatch, appMatch, appMatch, personaMatch];
            } else {
              const secondPersona = chooseAssets({
                assets: personaAssets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                personaOnly: true,
                excludedAssetIds: new Set([String(personaMatch.asset.id)]),
                slides: [{ ...withoutAppScreenshotDirective(slide), assetType: "persona" }],
              })[0]!;
              slideMatches = [personaMatch, secondPersona, secondPersona, personaMatch];
            }
          } else if (input.layout === "three-rect-educational" || input.layout === "editorial-asym-hero") {
            const used = new Set<string>();
            slideMatches = [];
            const desiredCount = input.layout === "three-rect-educational" && isHook ? 2 : 3;
            while (slideMatches.length < desiredCount) {
              const next = chooseAssets({
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: used,
                slides: [{ ...slide, assetType: slide.assetType === "text_only" ? "stock" : (slide.assetType ?? "stock") }],
              })[0]!;
              slideMatches.push(next);
              used.add(String(next.asset.id));
            }
          } else {
            slideMatches = chooseAssets({
              assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              slides: [slide],
            });
          }
          selected = true;
        } catch (error) {
          if (attempt > 0) throw error;
          await generateRepairAsset({ input, slide, position: slide.position, usedReferenceIds });
          assets = await loadSelectableAssets();
          assetMap.clear();
          assets.forEach((asset) => assetMap.set(String(asset.id), asset));
        }
      }
    }

    const slideLayout = input.layout === "grid-2x2" && (slide.position === 1 || slide.role.toUpperCase() === "HOOK")
      ? "single-image"
      : input.layout;
    const geometry = getSlideGeometry(
      { ...slide, layout: slideLayout },
      slide.position === 1,
      slide.position === input.slides.length,
      typography,
    ) as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0];
    const persistedAssetId = primaryMatch && assetMap.has(String(primaryMatch.asset.id)) ? primaryMatch.asset.id : null;
    const renderMetadata = {
      geometry,
      storage_path: upload.storagePath,
      asset_score: primaryMatch?.score ?? null,
      matched_terms: primaryMatch?.matchedTerms ?? [],
      selection: primaryMatch ? {
        selected_asset_id: primaryMatch.asset.id,
        fallback_path: primaryMatch.fallbackPath ?? (visualChanges.has(slide.position) ? "review_visual_reselect" : "review_preserved_visual"),
        threshold_bypassed: primaryMatch.thresholdBypassed ?? false,
      } : {
        selected_asset_id: null,
        fallback_path: "text_only",
        threshold_bypassed: false,
      },
      asset_ids: slideMatches.map((match) => match.asset.id),
      asset_source_types: slideMatches.map((match) => match.asset.source_type ?? null),
      review_revision: true,
      visual_changed: visualChanges.has(slide.position),
    };
    prepared.push({
      databaseRow: {
        workspace_id: CORTIFREE_WORKSPACE_ID,
        carousel_id: input.id,
        position: slide.position,
        template_id: input.layout,
        headline: slide.headline,
        body: slide.body,
        asset_requirement: { query: slide.assetQuery, visual_intent: slide.visualIntent },
        asset_id: persistedAssetId,
        rendered_url: upload.publicUrl,
        render_metadata: renderMetadata,
      },
      result: {
        position: slide.position,
        url: upload.publicUrl,
        assetId: primaryMatch?.asset.id ?? null,
        assetFilename: primaryMatch?.asset.filename ?? null,
        score: primaryMatch?.score ?? null,
        matchedTerms: primaryMatch?.matchedTerms ?? [],
        geometry,
        assetIds: slideMatches.map((match) => match.asset.id),
        assetSourceTypes: slideMatches.map((match) => match.asset.source_type ?? null),
      },
    });
  }

  const slideResponse = await dataBackend("carousel_slides?on_conflict=carousel_id,position", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(prepared.map((item) => item.databaseRow)),
  });
  if (!slideResponse.ok) throw new Error(`Slide revision save failed: ${await slideResponse.text()}`);

  const changedResults = new Map(prepared.map((item) => [item.result.position, item.result]));
  const rendered = input.slides.map((slide) => {
    const revised = changedResults.get(slide.position);
    if (revised) return revised;
    return previousByPosition.get(slide.position)
      ?? { position: slide.position, url: existingByPosition.get(slide.position)?.rendered_url ?? null, assetId: existingByPosition.get(slide.position)?.asset_id ?? null };
  }).filter((item) => item.url).sort((a, b) => a.position - b.position);

  const now = new Date().toISOString();
  const updatedSpec = {
    ...input.spec,
    typography,
    rendered_slides: rendered,
    rendered_at: now,
    editor_structure_dirty: false,
  };
  const carouselResponse = await dataBackend(
    `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(input.id)}`,
    { method: "PATCH", body: JSON.stringify({ spec: updatedSpec, updated_at: now }) },
  );
  if (!carouselResponse.ok) throw new Error(`Carousel revision render save failed: ${await carouselResponse.text()}`);
  return rendered;
}
