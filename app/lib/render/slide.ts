import sharp, { type OverlayOptions } from "sharp";
import type { AssetMatch } from "../asset-selector";
import { analyzeHookComposition, type HookDesign } from "../hook-design";
import { uploadFile } from "../storage";
import { selectedAssetBytes } from "./assets";
import { focusCrop, subjectBox } from "./framing";
import { defaultGeometry, HEIGHT, WIDTH, type Frame, type GeneratedSlide, type Geometry } from "./types";
import { checklistPanel, checklistTextOverlays } from "./text/checklist";
import { geometryForVisualMetadata, makeRasterTextOverlays } from "./text/default";
import { editorialAsymTextOverlays } from "./text/editorial-asym";
import { threeRectEducationalTextOverlays } from "./text/educational";
import { lifestyleThreeStackTextOverlays } from "./text/lifestyle";
import { personaExplainerTextOverlays } from "./text/persona-explainer";
import { rankingCopyParts, rankingTextOverlays } from "./text/ranking";
import { routineTextOverlays } from "./text/routine";

// F01 body slides: three edge-to-edge horizontal bands.
export const LIFESTYLE_BANDS = [
  { left: 0, top: 0, width: 1080, height: 450 },
  { left: 0, top: 450, width: 1080, height: 450 },
  { left: 0, top: 900, width: 1080, height: 450 },
];

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

export async function renderSlide(slide: GeneratedSlide, matches: AssetMatch[], geometry: Geometry) {
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
          { left: 90, top: 880, width: 300, height: 390 },
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
    // Without an operator crop, each photo is framed on its face or main
    // subject (vision subject_box); the centre crop cut faces in the bands.
    const framed = async (match: AssetMatch, index: number, fallback: { left: number; top: number; width: number; height: number }) => {
      const imageBytes = await selectedAssetBytes(match);
      const place = editorSlot(geometry, index, fallback);
      if (!geometry.imageSlots?.[index]) {
        const source = await sharp(imageBytes).rotate().metadata();
        Object.assign(place, focusCrop({ width: source.width ?? place.width, height: source.height ?? place.height }, place, subjectBox(match.asset.metadata)));
      }
      return { imageBytes, place, fitted: await fitEditorImage(imageBytes, { x: place.left, y: place.top, ...place }) };
    };
    if (isHook) {
      const { imageBytes, place, fitted } = await framed(matches[0]!, 0, { left: 0, top: 0, width: 1080, height: 1350 });
      const stats = await sharp(imageBytes).stats();
      averageLuminance = (stats.channels[0]?.mean ?? 128) * 0.2126 + (stats.channels[1]?.mean ?? 128) * 0.7152 + (stats.channels[2]?.mean ?? 128) * 0.0722;
      composites.push({ input: fitted, left: place.left, top: place.top });
    } else {
      for (const [index, match] of matches.slice(0, 3).entries()) {
        const { place, fitted } = await framed(match, index, LIFESTYLE_BANDS[index]!);
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

export async function uploadRender(carouselId: string, position: number, bytes: Buffer) {
  const storagePath = `renders/${carouselId}/slide_${String(position).padStart(2, "0")}.png`;
  const upload = await uploadFile(new Uint8Array(bytes), "image/png");
  return { storagePath, ...upload };
}
