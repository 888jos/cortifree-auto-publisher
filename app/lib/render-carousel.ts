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
function resolveFontPath(family = "TikTok Sans", weight = 500) {
  const slug = FONT_FILES[family] ?? FONT_FILES["TikTok Sans"];
  const exact = path.join(FONT_ROOT, `${slug}-${weight}.ttf`);
  if (existsSync(exact)) return exact;
  const nearest = [700, 600, 500, 400].map((item) => path.join(FONT_ROOT, `${slug}-${item}.ttf`)).find(existsSync);
  if (!nearest) throw new Error(`Downloaded carousel font missing for ${family}`);
  return nearest;
}
const FONT_PATH = resolveFontPath("TikTok Sans", 500);
const embeddedFont = (() => {
  return existsSync(FONT_PATH) ? readFileSync(FONT_PATH).toString("base64") : "";
})();

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
    headlineSize: 62, bodySize: 32, headlineWeight: 700, bodyWeight: 500,
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

function textBlock(lines: string[], x: number, y: number, width: number, size: number, weight: number, color: string, align: string, lineHeight: number, fontFamily: string, filter = "url(#shadow)") {
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const textX = align === "center" ? x + width / 2 : align === "right" ? x + width : x;
  return `<text x="${textX}" y="${y}" fill="${color}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" filter="${filter}">${lines.map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

export function makeTextOverlay(slide: GeneratedSlide, geometry: Geometry) {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const headlineSize = frame.headlineSize ?? 62;
  const bodySize = frame.bodySize ?? 32;
  const headlineText = slide.position === 1 || slide.role.toUpperCase() === "HOOK" ? slide.headline : slide.headline.replace(/^\d+[.)]\s*/, "");
  const headline = wrap(headlineText, Math.max(10, Math.floor(frame.width / (headlineSize * 0.56))), frame.maxHeadlineLines ?? 3);
  const body = wrap(slide.body, Math.max(16, Math.floor(frame.width / (bodySize * 0.52))), frame.maxBodyLines ?? 5);
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const filter = frame.shadow === "none" ? "none" : "url(#shadow)";
  const fontFace = embeddedFont ? `<style>@font-face{font-family:'${fontFamily}';src:url(data:font/ttf;base64,${embeddedFont}) format('truetype');font-weight:100 900;}</style>` : "";
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="shadow"><feDropShadow dx="0" dy="3" stdDeviation="7" flood-opacity="0.44"/></filter></defs>${fontFace}<text x="${frame.x}" y="${(frame.headlineY ?? frame.y) - 44}" fill="${frame.accentColor ?? "#ffb6c8"}" font-family="${fontFamily}" font-size="22" font-weight="700" letter-spacing="3" filter="${filter}">${xml(`${String(slide.position).padStart(2, "0")} · ${slide.role}`)}</text>${textBlock(headline, frame.x, frame.headlineY ?? frame.y, frame.width, headlineSize, frame.headlineWeight ?? 700, frame.headlineColor ?? "#fffaf8", frame.align ?? "left", Math.round(headlineSize * 1.1), fontFamily, filter)}${body.length ? textBlock(body, frame.x, frame.bodyY ?? frame.y + 180, frame.width, bodySize, frame.bodyWeight ?? 500, frame.bodyColor ?? "#fff4b8", frame.align ?? "left", Math.round(bodySize * 1.32), fontFamily, filter) : ""}</svg>`);
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
  return sharp({ create: { width, height, channels: 3, background: color } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
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
    const hookHeadline = wrapHook(slide.headline.toLowerCase(), Math.max(2, design.maxWordsPerLine), 5);
    // Keep long hooks in a compact, high-contrast block instead of allowing
    // one word per line to run through the person or the focal object.
    const hookSize = hookHeadline.length > 4 ? Math.min(design.size, 38) : design.size;
    const hookTop = hookHeadline.length > 4 ? 150 : design.y;
    // The composition heuristic can prefer the visually quieter side while
    // still crossing a centered portrait. Keep long hooks in the opposite
    // lateral safe zone instead of covering the face or phone.
    const hookX = design.x >= WIDTH / 2 ? 80 : design.x;
    const hookWidth = Math.max(design.width, 440);
    for (const [index, line] of hookHeadline.entries()) {
      const lineImage = await rasterText(line, { width: hookWidth, height: Math.ceil(hookSize * 1.35), size: hookSize, weight: design.weight, color: design.hookColor, align: design.align, spacing: 0, fontFamily: "TikTok Sans" });
      overlays.push({ input: lineImage, left: hookX, top: hookTop + index * (hookSize + Math.max(8, design.lineGap)) });
    }
    return overlays;
  }
  const fontFamily = FONT_FILES[frame.fontFamily ?? ""] ? frame.fontFamily! : "TikTok Sans";
  const headlineImage = await rasterText(headline.join("\n"), { width: frame.width, height: headline.length * headlineLineHeight + 18, size: headlineSize, weight: frame.headlineWeight ?? 700, color: hookDesign?.hookColor ?? frame.headlineColor ?? "#fffaf8", align, spacing: Math.max(0, headlineLineHeight - headlineSize), fontFamily });
  overlays.push({ input: headlineImage, left: frame.x, top: frame.headlineY ?? frame.y });
  if (body.length) {
    const bodyImage = await rasterText(body.join("\n"), { width: frame.width, height: body.length * bodyLineHeight + 18, size: bodySize, weight: frame.bodyWeight ?? 500, color: hookDesign?.textColor ?? frame.bodyColor ?? "#fff4b8", align, spacing: Math.max(0, bodyLineHeight - bodySize), fontFamily });
    const bodyTop = (frame.headlineY ?? frame.y) + headline.length * headlineLineHeight + 22;
    overlays.push({ input: bodyImage, left: frame.x, top: bodyTop });
  }
  return overlays;
}

async function renderSlide(slide: GeneratedSlide, matches: AssetMatch[], geometry: Geometry) {
  const imageFrame = { ...defaultGeometry.image, ...geometry.image } as Frame;
  const composites: OverlayOptions[] = [];
  let hookDesign: HookDesign | undefined;
  if (imageFrame.mode === "grid-2x2") {
    const tileWidth = 500;
    const tileHeight = 635;
    const positions = [[32, 32], [548, 32], [32, 683], [548, 683]];
    for (const [index, match] of matches.slice(0, 4).entries()) {
      const imageResponse = await fetch(match.asset.public_url);
      if (!imageResponse.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
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
    const fitted = await sharp(imageBytes).rotate().resize({ width: imageFrame.width, height: imageFrame.height ?? HEIGHT, fit: imageFrame.fit ?? "cover", position: "centre" }).png().toBuffer();
    hookDesign = await analyzeHookComposition(imageBytes, `${slide.headline}:${slide.position}`);
    composites.push({ input: fitted, left: imageFrame.x, top: imageFrame.y });
  }
  composites.push(...await makeRasterTextOverlays(slide, geometry, hookDesign));
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
  const matches = chooseAssets({ assets, carouselType: input.carouselType, personaId: input.personaId, slides: input.slides });
  const reservedGridAssets = new Set<string>();
  const gridMatches = input.layout === "grid-2x2"
    ? input.slides.map((slide, index) => {
      if (index === 0 || slide.role.toUpperCase() === "HOOK") return [matches[0]!];
      const available = assets.filter((asset) => !reservedGridAssets.has(asset.id));
      const selected = chooseAssets({ assets: available.length >= 4 ? available : assets, carouselType: input.carouselType, personaId: input.personaId, slides: [slide, slide, slide, slide] });
      selected.forEach((match) => reservedGridAssets.add(match.asset.id));
      return selected;
    })
    : input.slides.map((_, index) => [matches[index]!]);
  const prepared = await Promise.all(input.slides.map(async (slide, index) => {
    const slideMatches = gridMatches[index]!;
    // The selected model is authoritative. AI copy may return an old layout alias;
    // never let that silently turn a 2x2 request back into a single-photo slide.
    const slideLayout = index === 0 || slide.role.toUpperCase() === "HOOK" ? "single-image" : input.layout;
    const geometry = getSlideGeometry({ ...slide, layout: slideLayout }, index === 0, index === input.slides.length - 1) as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0]!;
    const renderMetadata = { geometry, storage_path: upload.storagePath, asset_score: primaryMatch.score, matched_terms: primaryMatch.matchedTerms, asset_ids: slideMatches.map((match) => match.asset.id) };
    return {
      databaseRow: { workspace_id: CORTIFREE_WORKSPACE_ID, carousel_id: input.id, position: slide.position, template_id: input.layout, headline: slide.headline, body: slide.body, asset_requirement: { query: slide.assetQuery, visual_intent: slide.visualIntent }, asset_id: primaryMatch.asset.id, rendered_url: upload.publicUrl, render_metadata: renderMetadata },
      result: { position: slide.position, url: upload.publicUrl, assetId: primaryMatch.asset.id, assetFilename: primaryMatch.asset.filename, score: primaryMatch.score, matchedTerms: primaryMatch.matchedTerms, geometry, assetIds: slideMatches.map((match) => match.asset.id) },
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

  const updatedSpec = { ...input.spec, rendered_slides: rendered, rendered_at: now };
  const carouselResponse = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(input.id)}`, { method: "PATCH", body: JSON.stringify({ spec: updatedSpec, updated_at: now }) });
  if (!carouselResponse.ok) throw new Error(`Carousel render state save failed: ${await carouselResponse.text()}`);
  return rendered;
}
