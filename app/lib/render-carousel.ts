import sharp, { type OverlayOptions } from "sharp";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chooseAssets, loadSelectableAssets, type AssetMatch } from "./asset-selector";
import { getSlideGeometry } from "./layout-geometry";
import { dataBackend } from "./data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "./workspace";
import { uploadConvexFile } from "./convex-storage";
import { analyzeHookComposition, type HookDesign } from "./hook-design";
import { processImageGenerationJob } from "./image-generation";
import { buildImagePrompt, imageGenerationInputSchema } from "../../src/image-generation/core";
import { isAutomaticVisualReference, scoreVisualReferenceForScene, visualReferenceSchema } from "../../src/visual-references";
import { loadRuntimePersonaConfigs } from "../../src/runtime/config";
import { downloadDriveFile } from "./google/drive";

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
const ROTATING_BODY_FONTS = Object.keys(FONT_FILES);
function typographyForCarousel(carouselId: string) {
  const hash = [...carouselId].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 7);
  const bodyIndex = hash % ROTATING_BODY_FONTS.length;
  const bodyFontFamily = ROTATING_BODY_FONTS[bodyIndex] ?? "TikTok Sans";
  const hookFontFamily = bodyFontFamily === "Bricolage Grotesque"
    ? "TikTok Sans"
    : "Bricolage Grotesque";
  return { hookFontFamily, bodyFontFamily, hookSize: 44, titleSize: 52, bodySize: 28, maxDistinctSizes: 3 };
}
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

type GeneratedSlide = {
  position: number;
  role: string;
  layout: string;
  headline: string;
  body: string;
  assetQuery: string;
  visualIntent: string;
  assetType?: string;
};

type Frame = {
  x: number; y: number; width: number; height?: number; fit?: "cover" | "contain";
  mode?: "single" | "routine-timeline" | "three-rect-educational" | "grid-2x2" | "editorial-collage" | "editorial-asym-hero" | "interactive-checklist" | "ranking";
};
type Geometry = {
  canvas?: { width: number; height: number };
  safeZone?: Frame;
  image?: Frame;
  text?: Frame & {
    align?: "left" | "center" | "right";
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

function generationCategory(slide: GeneratedSlide) {
  const text = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.toLowerCase();
  if (/walk|outdoor|street|park|outside|nature/.test(text)) return "outdoors";
  if (/gym|workout|exercise|fitness|pilates|yoga|run/.test(text)) return "fitness";
  if (/food|meal|breakfast|lunch|dinner|eat|drink|coffee|matcha|grocery/.test(text)) return "food";
  if (/study|work|desk|laptop|exam|task|focus/.test(text)) return "work_study";
  if (/skin|beauty|glow|face|self.?care|makeup/.test(text)) return "self_care";
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
  const [personas, mastersResponse, referencesResponse] = await Promise.all([
    loadRuntimePersonaConfigs(),
    dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&persona_id=eq.${encodeURIComponent(options.input.personaId)}&source_type=eq.persona_master&enabled=eq.true&public_url=not.is.null&select=id&limit=1`),
    dataBackend(`visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&enabled=eq.true&select=*&limit=500`),
  ]);
  if (!mastersResponse.ok) throw new Error(`MODELARK_MASTER_LOOKUP_FAILED:${await mastersResponse.text()}`);
  if (!referencesResponse.ok) throw new Error(`MODELARK_REFERENCE_LOOKUP_FAILED:${await referencesResponse.text()}`);
  const masters = await mastersResponse.json() as Array<{ id: string | number }>;
  const master = masters[0];
  if (!master) throw new Error(`MODELARK_MASTER_MISSING:${options.input.personaId}`);
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
  const persona = personas.find((item) => item.id === options.input.personaId);
  if (!persona) throw new Error(`MODELARK_PERSONA_MISSING:${options.input.personaId}`);
  const generationInput = imageGenerationInputSchema.parse({
    persona_id: options.input.personaId, master_asset_id: master.id, visual_reference_id: reference.id,
    carousel_id: options.input.id, slide_id: `slide_${options.position}`, scene: options.slide.visualIntent || options.slide.assetQuery || options.slide.headline,
    category: generationCategory(options.slide), framing: "portrait",
    prompt_additions: "Automatic carousel repair. Image 1 is only the identity master and Image 2 is only the Pinterest visual reference. Never place either source image directly in the carousel. Generate a new distinct natural photo and do not repeat any previously generated scene in this carousel.",
  });
  const prompt = buildImagePrompt(persona, reference, generationInput);
  const jobResponse = await dataBackend("image_generation_jobs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, persona_id: options.input.personaId, master_asset_id: master.id, visual_reference_id: reference.id, carousel_id: options.input.id, slide_id: `slide_${options.position}`, category: generationInput.category, scene: generationInput.scene, input: generationInput, prompt, provider: "modelark_seedream", model: process.env.MODELARK_MODEL_ID ?? "", status: "PENDING", attempts: 0, attempt_count: 0, metadata: {
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

async function threeRectEducationalTextOverlays(slide: GeneratedSlide, geometry: Geometry): Promise<OverlayOptions[]> {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const hookFontFamily = FONT_FILES[frame.hookFontFamily ?? ""] ? frame.hookFontFamily! : "Bricolage Grotesque";
  const overlays: OverlayOptions[] = [];
  const headline = wrap(
    slide.headline.replace(/^\d+[.)]\s*/, ""),
    slide.position === 1 ? 24 : 30,
    frame.maxHeadlineLines ?? 3,
  ).join("\n");
  const headlineImage = await rasterText(headline, {
    width: frame.width,
    height: slide.position === 1 ? 220 : 150,
    size: frame.headlineSize ?? 42,
    weight: frame.headlineWeight ?? 700,
    color: frame.headlineColor ?? "#2b2725",
    align: "left",
    spacing: 0,
    fontFamily: slide.position === 1 ? hookFontFamily : fontFamily,
  });
  overlays.push({ input: headlineImage, left: frame.x, top: frame.headlineY ?? frame.y });

  if (slide.body.trim()) {
    const body = wrap(slide.body.trim(), 44, frame.maxBodyLines ?? 4).join("\n");
    const bodyWidth = frame.eduBodyWidth ?? 770;
    const bodyImage = await rasterText(body, {
      width: bodyWidth,
      height: 180,
      size: frame.bodySize ?? 30,
      weight: frame.bodyWeight ?? 500,
      color: frame.bodyColor ?? "#2b2725",
      align: "center",
      spacing: 2,
      fontFamily,
    });
    overlays.push({
      input: bodyImage,
      left: frame.eduBodyX ?? 155,
      top: frame.eduBodyY ?? frame.bodyY ?? 960,
    });
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
    overlays.push({ input: hookImage, left: frame.x, top: frame.headlineY ?? frame.y });

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
      overlays.push({ input: contextImage, left: frame.x, top: frame.bodyY ?? 990 });
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
  overlays.push({ input: headlineImage, left: frame.x, top: frame.headlineY ?? 960 });

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
    overlays.push({ input: bodyImage, left: frame.x, top: frame.bodyY ?? 1075 });
  }
  return overlays;
}

function routineKicker(slide: GeneratedSlide) {
  const text = `${slide.headline} ${slide.body}`.toLowerCase();
  if (/night|bedtime|evening/.test(text)) return "NIGHT ROUTINE";
  if (/morning|a\.m\.|\bam\b/.test(text)) return "MORNING ROUTINE";
  if (/day in (my|the) life|day in the life|day-in-the-life/.test(text)) return "DAY IN MY LIFE";
  return "MY ROUTINE";
}

function routineCopyParts(slide: GeneratedSlide) {
  const source = String(slide.headline ?? "").trim();
  const match = source.match(/^((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM)?|(?:[01]?\d|2[0-3])h(?:[0-5]\d)?)\s*(?:[·•|—–-]|:)\s*(.+)$/i);
  if (!match) return { time: "", headline: source };
  return { time: match[1]!.trim().toUpperCase(), headline: match[2]!.trim() };
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
      height: 38,
      size: frame.routineKickerSize ?? 20,
      weight: 700,
      align: "left",
      fontFamily,
      spacing: 1,
    });
    const lines = wrapHook(slide.headline.toLowerCase(), 4, 3).join("\n");
    await pushShadowed(lines, {
      left: frame.x,
      top: frame.headlineY ?? frame.y,
      width: frame.width,
      height: 240,
      size: frame.hookSize ?? 64,
      weight: 700,
      align: "left",
      fontFamily: hookFontFamily,
    });
    if (slide.body.trim()) {
      await pushShadowed(slide.body.trim(), {
        left: frame.x,
        top: frame.routineContextY ?? frame.bodyY ?? 365,
        width: Math.min(frame.width, 520),
        height: 90,
        size: frame.bodySize ?? 26,
        weight: 600,
        align: "left",
        fontFamily,
      });
    }
    return overlays;
  }

  if (isFinal) {
    const headline = wrap(slide.headline, 24, frame.maxHeadlineLines ?? 3).join("\n");
    await pushShadowed(headline, {
      left: frame.x,
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
        left: frame.x,
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
      size: frame.routineTimeSize ?? 30,
      weight: 700,
      align: "center",
      fontFamily,
    });
  }
  const action = wrap(parts.headline, 24, frame.maxHeadlineLines ?? 2).join("\n");
  await pushShadowed(action, {
    left: frame.x,
    top: frame.headlineY ?? frame.y,
    width: frame.width,
    height: 170,
    size: frame.headlineSize ?? 54,
    weight: 700,
    align: "center",
    fontFamily: hookFontFamily,
  });
  if (slide.body.trim()) {
    const support = wrap(slide.body, 46, frame.maxBodyLines ?? 2).join("\n");
    await pushShadowed(support, {
      left: frame.x,
      top: frame.bodyY ?? 715,
      width: frame.width,
      height: 120,
      size: frame.bodySize ?? 26,
      weight: 500,
      align: "center",
      fontFamily,
    });
  }
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
  overlays.push({ input: headlineImage, left: frame.x, top: frame.headlineY ?? frame.y });
  if (body.length) {
    const bodyImage = await rasterText(body.join("\n"), { width: frame.width, height: body.length * bodyLineHeight + 18, size: bodySize, weight: frame.bodyWeight ?? 500, color: frame.bodyColor ?? "#fff4b8", align, spacing: Math.max(0, bodyLineHeight - bodySize), fontFamily });
    const bodyTop = (frame.headlineY ?? frame.y) + headline.length * headlineLineHeight + 22;
    overlays.push({ input: bodyImage, left: frame.x, top: bodyTop });
  }
  return overlays;
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
      const fitted = await sharp(imageBytes).rotate().resize({ width: tileWidth, height: tileHeight, fit: "cover", position: "centre" }).png().toBuffer();
      if (index === 0) hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
      const [left, top] = positions[index]!;
      composites.push({ input: fitted, left, top });
    }
  } else if (imageFrame.mode === "three-rect-educational") {
    const placements = [
      { left: 74, top: 355, width: 280, height: 500 },
      { left: 400, top: 300, width: 280, height: 590 },
      { left: 726, top: 355, width: 280, height: 500 },
    ];
    for (const [index, match] of matches.slice(0, 3).entries()) {
      const imageBytes = await selectedAssetBytes(match);
      const place = placements[index]!;
      const fitted = await roundedPhoto(imageBytes, place.width, place.height, 24);
      composites.push({ input: fitted, left: place.left, top: place.top });
    }
    averageLuminance = 235;
  } else if (imageFrame.mode === "editorial-asym-hero") {
    const placements = [
      { left: 60, top: 190, width: 590, height: 770 },
      { left: 690, top: 215, width: 310, height: 310 },
      { left: 690, top: 555, width: 310, height: 310 },
    ];
    for (const [index, match] of matches.slice(0, 3).entries()) {
      const imageBytes = await selectedAssetBytes(match);
      const place = placements[index]!;
      const fitted = await sharp(imageBytes).rotate().resize({ width: place.width, height: place.height, fit: "cover", position: "centre" }).png().toBuffer();
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
      const place = placements[index]!;
      const fitted = await sharp(imageBytes).rotate().resize({ width: place.width, height: place.height, fit: "cover", position: "centre" }).png().toBuffer();
      composites.push({ input: fitted, left: place.left, top: place.top });
    }
    averageLuminance = 220;
  } else if (imageFrame.mode === "ranking") {
    if (isHook && matches.length >= 2) {
      const placements = [{ left: 66, top: 120, width: 455, height: 650 }, { left: 560, top: 210, width: 455, height: 650 }];
      for (const [index, match] of matches.slice(0, 2).entries()) {
        const imageBytes = await selectedAssetBytes(match);
        const place = placements[index]!;
        const fitted = await sharp(imageBytes).rotate().resize({ width: place.width, height: place.height, fit: "cover", position: "centre" }).png().toBuffer();
        composites.push({ input: fitted, left: place.left, top: place.top });
      }
    } else {
      const imageBytes = await selectedAssetBytes(matches[0]!);
      const fitted = await sharp(imageBytes).rotate().resize({ width: 880, height: 760, fit: "cover", position: "centre" }).png().toBuffer();
      composites.push({ input: fitted, left: 100, top: 70 });
    }
    averageLuminance = 220;
  } else {
    const match = matches[0]!;
    const imageBytes = await selectedAssetBytes(match);
    const stats = await sharp(imageBytes).stats();
    averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
    const fitted = await sharp(imageBytes).rotate().resize({ width: imageFrame.width, height: imageFrame.height ?? HEIGHT, fit: imageFrame.fit ?? "cover", position: "centre" }).png().toBuffer();
    hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
    composites.push({ input: fitted, left: imageFrame.x, top: imageFrame.y });
    if (imageFrame.mode === "interactive-checklist") {
      const panel = await sharp({ create: { width: 900, height: 860, channels: 4, background: { r: 255, g: 252, b: 247, alpha: 0.92 } } }).png().toBuffer();
      composites.push({ input: panel, left: 90, top: 300 });
    }
  }

  const forceDark = imageFrame.mode === "three-rect-educational" || imageFrame.mode === "editorial-asym-hero" || imageFrame.mode === "editorial-collage" || imageFrame.mode === "ranking" || imageFrame.mode === "interactive-checklist";
  const readablePalette = forceDark || averageLuminance > 158
    ? { headlineColor: "#1f2933", bodyColor: "#1f2933", accentColor: "#1f2933" }
    : { headlineColor: "#fffaf5", bodyColor: "#fffaf5", accentColor: "#fffaf5" };
  const readableGeometry = { ...geometry, text: geometry.text ? { ...geometry.text, ...readablePalette } : geometry.text } as Geometry;
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
  if (imageFrame.mode === "routine-timeline") {
    composites.push(...await routineTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "three-rect-educational") {
    composites.push(...await threeRectEducationalTextOverlays(slide, readableGeometry));
  } else if (imageFrame.mode === "editorial-asym-hero") {
    composites.push(...await editorialAsymTextOverlays(slide, readableGeometry));
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
  let assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  const personaHookIds = assets
    .filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === input.personaId)
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
  let gridMatches: AssetMatch[][] = [];
  for (let attempt = 0; attempt <= Math.max(2, input.slides.length); attempt += 1) {
    try {
      // Masters and raw Pinterest references are never renderable output. They
      // may only enter through the ModelArk repair path above.
      const multiImageLayout = input.layout === "three-rect-educational" || input.layout === "editorial-asym-hero" || input.layout === "editorial-collage" || input.layout === "ranking";
      const matches = chooseAssets({
        assets,
        carouselType: input.carouselType,
        personaId: input.personaId,
        excludedAssetIds: recentHookAssetIds,
        slides: input.layout === "grid-2x2" ? [input.slides[0]!] : input.slides,
      });
      if (input.layout !== "grid-2x2" && !multiImageLayout) {
        gridMatches = input.slides.map((_, index) => [matches[index]!]);
        break;
      }

      const usedCarouselAssets = new Set<string>(matches.filter(Boolean).map((match) => String(match.asset.id)));
      if (multiImageLayout) {
        gridMatches = input.slides.map((slide, index) => {
          const primary = matches[index]!;
          const desiredCount = input.layout === "three-rect-educational" || input.layout === "editorial-asym-hero"
            ? 3
            : input.layout === "editorial-collage"
              ? 2
              : (index === 0 || slide.role.toUpperCase() === "HOOK") ? 2 : 1;
          if (desiredCount === 1) return [primary];
          const selected: AssetMatch[] = [primary];
          while (selected.length < desiredCount) {
            try {
              const next = chooseAssets({
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: usedCarouselAssets,
                slides: [{ ...slide, assetType: slide.assetType === "text_only" ? "stock" : (slide.assetType ?? "stock") }],
              })[0]!;
              selected.push(next);
              usedCarouselAssets.add(String(next.asset.id));
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              throw new Error(`${message}:slide_${slide.position}`);
            }
          }
          return selected;
        });
        break;
      }

      const usedGridAssets = new Set<string>([matches[0]!.asset.id]);
      gridMatches = input.slides.map((slide, index) => {
        if (index === 0 || slide.role.toUpperCase() === "HOOK") return [matches[0]!];
        const personaAssets = assets.filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === input.personaId);
        const selected = chooseAssets({ assets: personaAssets, carouselType: input.carouselType, personaId: input.personaId, personaOnly: true, excludedAssetIds: usedGridAssets, slides: [{ ...slide, assetType: "persona" }, { ...slide, assetType: "persona" }] });
        selected.forEach((match) => usedGridAssets.add(match.asset.id));
        // Keep the established 2x2 editorial pattern, but each source image
        // appears only on its own tile pair and never on a later slide.
        return [selected[0]!, selected[1]!, selected[1]!, selected[0]!];
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const position = Number(message.match(/slide_(\d+)/)?.[1] ?? 0);
      if (!position || repairedPositions.has(position)) throw error;
      repairedPositions.add(position);
      await generateRepairAsset({ input, slide: input.slides[position - 1]!, position, usedReferenceIds });
      assets = await loadSelectableAssets();
    }
  }
  if (!gridMatches.length) throw new Error("CAROUSEL_RENDER_SELECTION_FAILED");
  const prepared = await Promise.all(input.slides.map(async (slide, index) => {
    const slideMatches = gridMatches[index]!;
    // The selected model is authoritative. AI copy may return an old layout alias;
    // never let that silently turn a 2x2 request back into a single-photo slide.
    const slideLayout = input.layout === "grid-2x2" && (index === 0 || slide.role.toUpperCase() === "HOOK")
      ? "single-image"
      : input.layout;
    const typography = typographyForCarousel(input.id);
    const geometry = getSlideGeometry({ ...slide, layout: slideLayout }, index === 0, index === input.slides.length - 1, typography) as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0]!;
    const renderMetadata = {
      geometry,
      storage_path: upload.storagePath,
      asset_score: primaryMatch.score,
      matched_terms: primaryMatch.matchedTerms,
      selection: {
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
      },
      asset_ids: slideMatches.map((match) => match.asset.id),
      asset_source_types: slideMatches.map((match) => match.asset.source_type ?? null),
    };
    return {
      databaseRow: { workspace_id: CORTIFREE_WORKSPACE_ID, carousel_id: input.id, position: slide.position, template_id: input.layout, headline: slide.headline, body: slide.body, asset_requirement: { query: slide.assetQuery, visual_intent: slide.visualIntent }, asset_id: primaryMatch.asset.id, rendered_url: upload.publicUrl, render_metadata: renderMetadata },
      result: { position: slide.position, url: upload.publicUrl, assetId: primaryMatch.asset.id, assetFilename: primaryMatch.asset.filename, score: primaryMatch.score, matchedTerms: primaryMatch.matchedTerms, geometry, assetIds: slideMatches.map((match) => match.asset.id), assetSourceTypes: slideMatches.map((match) => match.asset.source_type ?? null) },
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

    if (!visualChanges.has(slide.position)) {
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
            const matches = chooseAssets({
              assets: personaAssets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              personaOnly: true,
              slides: [{ ...slide, assetType: "persona" }, { ...slide, assetType: "persona" }],
            });
            slideMatches = [matches[0]!, matches[1]!, matches[1]!, matches[0]!];
          } else if (input.layout === "three-rect-educational" || input.layout === "editorial-asym-hero") {
            const used = new Set<string>();
            slideMatches = [];
            while (slideMatches.length < 3) {
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
    const primaryMatch = slideMatches[0]!;
    const persistedAssetId = assetMap.has(String(primaryMatch.asset.id)) ? primaryMatch.asset.id : null;
    const renderMetadata = {
      geometry,
      storage_path: upload.storagePath,
      asset_score: primaryMatch.score,
      matched_terms: primaryMatch.matchedTerms,
      selection: {
        selected_asset_id: primaryMatch.asset.id,
        fallback_path: primaryMatch.fallbackPath ?? (visualChanges.has(slide.position) ? "review_visual_reselect" : "review_preserved_visual"),
        threshold_bypassed: primaryMatch.thresholdBypassed ?? false,
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
        assetId: primaryMatch.asset.id,
        assetFilename: primaryMatch.asset.filename,
        score: primaryMatch.score,
        matchedTerms: primaryMatch.matchedTerms,
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
  };
  const carouselResponse = await dataBackend(
    `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(input.id)}`,
    { method: "PATCH", body: JSON.stringify({ spec: updatedSpec, updated_at: now }) },
  );
  if (!carouselResponse.ok) throw new Error(`Carousel revision render save failed: ${await carouselResponse.text()}`);
  return rendered;
}
