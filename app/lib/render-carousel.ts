import sharp, { type OverlayOptions } from "sharp";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chooseAssets, loadSelectableAssets, type AssetMatch } from "./asset-selector";
import { getSlideGeometry } from "./layout-geometry.js";
import { dataBackend } from "./data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "./workspace";
import { uploadConvexFile } from "./convex-storage";
import { analyzeHookComposition, type HookDesign } from "./hook-design";

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

type Frame = { x: number; y: number; width: number; height?: number; fit?: "cover" | "contain"; mode?: "single" | "grid-2x2" };
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
  };
  overlay?: { color?: string; opacity?: number };
};

type StoredReference = { id?: string; slides?: Array<{ geometry?: Geometry }> };

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
    const hookTop = 790;
    // The composition heuristic can prefer the visually quieter side while
    // still crossing a centered portrait. Keep long hooks in the opposite
    // lateral safe zone instead of covering the face or phone.
    const hookX = 88;
    const hookWidth = 904;
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
  if (imageFrame.mode === "grid-2x2") {
    const tileWidth = 500;
    const tileHeight = 635;
    const positions = [[32, 32], [548, 32], [32, 683], [548, 683]];
    for (const [index, match] of matches.slice(0, 4).entries()) {
      const imageResponse = await fetch(match.asset.public_url);
      if (!imageResponse.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
      if (index === 0) {
        const stats = await sharp(imageBytes).stats();
        averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
      }
      const fitted = await sharp(imageBytes).rotate().resize({ width: tileWidth, height: tileHeight, fit: "cover", position: "centre" }).png().toBuffer();
      if (index === 0) hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
      const [left, top] = positions[index]!;
      composites.push({ input: fitted, left, top });
    }
  } else {
    const match = matches[0]!;
    const imageResponse = await fetch(match.asset.public_url);
    if (!imageResponse.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    const stats = await sharp(imageBytes).stats();
    averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
    const fitted = await sharp(imageBytes).rotate().resize({ width: imageFrame.width, height: imageFrame.height ?? HEIGHT, fit: imageFrame.fit ?? "cover", position: "centre" }).png().toBuffer();
    hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
    composites.push({ input: fitted, left: imageFrame.x, top: imageFrame.y });
  }
  const readablePalette = averageLuminance > 158
    ? { headlineColor: "#243047", bodyColor: "#6b3157", accentColor: "#8b416f" }
    : averageLuminance < 96
      ? { headlineColor: "#fff7f0", bodyColor: "#cfe8ff", accentColor: "#ffd1e1" }
      : { headlineColor: "#fffaf2", bodyColor: "#ead7ff", accentColor: "#ffd4a8" };
  const readableGeometry = { ...geometry, text: geometry.text ? { ...geometry.text, ...readablePalette } : geometry.text } as Geometry;
  composites.push(...await makeRasterTextOverlays(slide, geometryForVisualMetadata(readableGeometry, matches[0]), hookDesign));
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
  const assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  // A mixed carousel only needs the persona asset for the hook here; the
  // remaining 2×2 tiles are selected from persona-generated assets below.
  const matches = chooseAssets({ assets, carouselType: input.carouselType, personaId: input.personaId, slides: input.layout === "grid-2x2" ? [input.slides[0]!] : input.slides });
  const reservedGridAssets = new Set<string>();
  const gridMatches = input.layout === "grid-2x2"
    ? input.slides.map((slide, index) => {
      if (index === 0 || slide.role.toUpperCase() === "HOOK") return [matches[0]!];
      const personaAssets = assets.filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === input.personaId);
      if (personaAssets.length < 2) throw new Error(`PERSONA_ASSETS_REQUIRED:${input.personaId ?? "unknown"}:need_2:found_${personaAssets.length}:slide_${slide.position}`);
      const selected = chooseAssets({ assets: personaAssets, carouselType: input.carouselType, personaId: input.personaId, personaOnly: true, slides: [{ ...slide, assetType: "persona" }, { ...slide, assetType: "persona" }] });
      selected.forEach((match) => reservedGridAssets.add(match.asset.id));
      // Editorial 2×2 pattern: two distinct images repeated diagonally.
      return [selected[0]!, selected[1]!, selected[1]!, selected[0]!];
    })
    : input.slides.map((_, index) => [matches[index]!]);
  const prepared = await Promise.all(input.slides.map(async (slide, index) => {
    const slideMatches = gridMatches[index]!;
    // The selected model is authoritative. AI copy may return an old layout alias;
    // never let that silently turn a 2x2 request back into a single-photo slide.
    const slideLayout = index === 0 || slide.role.toUpperCase() === "HOOK" ? "single-image" : input.layout;
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
