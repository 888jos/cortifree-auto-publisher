import sharp, { type OverlayOptions } from "sharp";
import { chooseAssets, loadSelectableAssets, type AssetMatch } from "./asset-selector";
import { getSlideGeometry } from "./layout-geometry.js";
import { supabase } from "./supabase";

const BUCKET = "cortifree-assets";
const WIDTH = 1080;
const HEIGHT = 1350;

type GeneratedSlide = {
  position: number;
  role: string;
  layout: string;
  headline: string;
  body: string;
  assetQuery: string;
  visualIntent: string;
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

function textBlock(lines: string[], x: number, y: number, width: number, size: number, weight: number, color: string, align: string, lineHeight: number, fontFamily: string, filter = "url(#shadow)") {
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const textX = align === "center" ? x + width / 2 : align === "right" ? x + width : x;
  return `<text x="${textX}" y="${y}" fill="${color}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" filter="${filter}">${lines.map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

export function makeTextOverlay(slide: GeneratedSlide, geometry: Geometry) {
  const frame = { ...defaultGeometry.text, ...geometry.text } as NonNullable<Geometry["text"]>;
  const headlineSize = frame.headlineSize ?? 62;
  const bodySize = frame.bodySize ?? 32;
  const headline = wrap(slide.headline, Math.max(10, Math.floor(frame.width / (headlineSize * 0.56))), frame.maxHeadlineLines ?? 3);
  const body = wrap(slide.body, Math.max(16, Math.floor(frame.width / (bodySize * 0.52))), frame.maxBodyLines ?? 5);
  const fontFamily = frame.fontFamily ?? "Georgia, Times New Roman, serif";
  const filter = frame.shadow === "none" ? "none" : "url(#shadow)";
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="shadow"><feDropShadow dx="0" dy="3" stdDeviation="7" flood-opacity="0.44"/></filter></defs><text x="${frame.x}" y="${(frame.headlineY ?? frame.y) - 44}" fill="${frame.accentColor ?? "#ffb6c8"}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="3" filter="${filter}">${xml(`${String(slide.position).padStart(2, "0")} · ${slide.role}`)}</text>${textBlock(headline, frame.x, frame.headlineY ?? frame.y, frame.width, headlineSize, frame.headlineWeight ?? 700, frame.headlineColor ?? "#fffaf8", frame.align ?? "left", Math.round(headlineSize * 1.1), fontFamily, filter)}${body.length ? textBlock(body, frame.x, frame.bodyY ?? frame.y + 180, frame.width, bodySize, frame.bodyWeight ?? 500, frame.bodyColor ?? "#fff4b8", frame.align ?? "left", Math.round(bodySize * 1.32), "Arial, Helvetica, sans-serif", filter) : ""}</svg>`);
}

async function renderSlide(slide: GeneratedSlide, matches: AssetMatch[], geometry: Geometry) {
  const imageFrame = { ...defaultGeometry.image, ...geometry.image } as Frame;
  const composites: OverlayOptions[] = [];
  if (imageFrame.mode === "grid-2x2") {
    const tileWidth = 500;
    const tileHeight = 635;
    const positions = [[32, 32], [548, 32], [32, 683], [548, 683]];
    for (const [index, match] of matches.slice(0, 4).entries()) {
      const imageResponse = await fetch(match.asset.public_url);
      if (!imageResponse.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
      const fitted = await sharp(imageBytes).rotate().resize({ width: tileWidth, height: tileHeight, fit: "cover", position: "centre" }).png().toBuffer();
      const [left, top] = positions[index]!;
      composites.push({ input: fitted, left, top });
    }
  } else {
    const match = matches[0]!;
    const imageResponse = await fetch(match.asset.public_url);
    if (!imageResponse.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    const fitted = await sharp(imageBytes).rotate().resize({ width: imageFrame.width, height: imageFrame.height ?? HEIGHT, fit: imageFrame.fit ?? "cover", position: "centre" }).png().toBuffer();
    composites.push({ input: fitted, left: imageFrame.x, top: imageFrame.y });
  }
  composites.push({ input: makeTextOverlay(slide, geometry), left: 0, top: 0 });
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: "#f7f3eb" } }).composite(composites).png({ quality: 94 }).toBuffer();
}

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return { url, key };
}

async function uploadRender(carouselId: string, position: number, bytes: Buffer) {
  const { url, key } = env();
  const storagePath = `renders/${carouselId}/slide_${String(position).padStart(2, "0")}.png`;
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${encoded}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) throw new Error(`Render upload failed: ${await response.text()}`);
  return { storagePath, publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${encoded}` };
}

export async function renderCarousel(input: {
  id: string;
  carouselType: string;
  layout: string;
  slides: GeneratedSlide[];
  references?: StoredReference[];
  spec: Record<string, unknown>;
}) {
  const assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  const matches = chooseAssets({ assets, carouselType: input.carouselType, slides: input.slides });
  const reservedGridAssets = new Set<string>();
  const gridMatches = input.layout === "grid-2x2"
    ? input.slides.map((slide) => {
      const available = assets.filter((asset) => !reservedGridAssets.has(asset.id));
      const selected = chooseAssets({ assets: available.length >= 4 ? available : assets, carouselType: input.carouselType, slides: [slide, slide, slide, slide] });
      selected.forEach((match) => reservedGridAssets.add(match.asset.id));
      return selected;
    })
    : input.slides.map((_, index) => [matches[index]!]);
  const prepared = await Promise.all(input.slides.map(async (slide, index) => {
    const slideMatches = gridMatches[index]!;
    // The selected model is authoritative. AI copy may return an old layout alias;
    // never let that silently turn a 2x2 request back into a single-photo slide.
    const geometry = getSlideGeometry({ ...slide, layout: input.layout }, index === 0, index === input.slides.length - 1) as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0]!;
    const renderMetadata = { geometry, storage_path: upload.storagePath, asset_score: primaryMatch.score, matched_terms: primaryMatch.matchedTerms, asset_ids: slideMatches.map((match) => match.asset.id) };
    return {
      databaseRow: { carousel_id: input.id, position: slide.position, template_id: input.layout, headline: slide.headline, body: slide.body, asset_requirement: { query: slide.assetQuery, visual_intent: slide.visualIntent }, asset_id: primaryMatch.asset.id, rendered_url: upload.publicUrl, render_metadata: renderMetadata },
      result: { position: slide.position, url: upload.publicUrl, assetId: primaryMatch.asset.id, assetFilename: primaryMatch.asset.filename, score: primaryMatch.score, matchedTerms: primaryMatch.matchedTerms, geometry, assetIds: slideMatches.map((match) => match.asset.id) },
    };
  }));
  const slideResponse = await supabase("carousel_slides?on_conflict=carousel_id,position", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(prepared.map((item) => item.databaseRow)),
  });
  if (!slideResponse.ok) throw new Error(`Slide save failed: ${await slideResponse.text()}`);
  const rendered = prepared.map((item) => item.result).sort((a, b) => a.position - b.position);

  const now = new Date().toISOString();
  await Promise.all(gridMatches.flatMap((slideMatches, index) => slideMatches.map(async (match) => {
    if (match !== slideMatches[0]) {
      await supabase(`assets?id=eq.${encodeURIComponent(match.asset.id)}`, { method: "PATCH", body: JSON.stringify({ use_count: (match.asset.use_count ?? 0) + 1, last_used_at: now }) });
      return;
    }
    await supabase("asset_usage_history?on_conflict=carousel_id,slide_position", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ asset_id: match.asset.id, carousel_id: input.id, slide_position: input.slides[index].position, match_score: match.score, matched_terms: match.matchedTerms }),
    });
    await supabase(`assets?id=eq.${encodeURIComponent(match.asset.id)}`, { method: "PATCH", body: JSON.stringify({ use_count: (match.asset.use_count ?? 0) + 1, last_used_at: now }) });
  })));

  const updatedSpec = { ...input.spec, rendered_slides: rendered, rendered_at: now };
  const carouselResponse = await supabase(`carousels?id=eq.${encodeURIComponent(input.id)}`, { method: "PATCH", body: JSON.stringify({ spec: updatedSpec, updated_at: now }) });
  if (!carouselResponse.ok) throw new Error(`Carousel render state save failed: ${await carouselResponse.text()}`);
  return rendered;
}
