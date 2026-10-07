// Shared render types and the default slide geometry.
export const WIDTH = 1080;
export const HEIGHT = 1350;

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

export type Frame = {
  x: number; y: number; width: number; height?: number; fit?: "cover" | "contain"; cropX?: number; cropY?: number; zoom?: number;
  mode?: "single" | "routine-timeline" | "three-rect-educational" | "grid-2x2" | "editorial-collage" | "editorial-asym-hero" | "interactive-checklist" | "persona-explainer" | "ranking" | "lifestyle-3stack";
};
export type Geometry = {
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

export type StoredReference = { id?: string; slides?: Array<{ geometry?: Geometry }> };

export const defaultGeometry: Geometry = {
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

export type CarouselRenderInput = {
  id: string;
  carouselType: string;
  layout: string;
  slides: GeneratedSlide[];
  personaId?: string;
  references?: StoredReference[];
  spec: Record<string, unknown>;
};

export type RevisionRenderInput = {
  id: string;
  carouselType: string;
  layout: string;
  slides: GeneratedSlide[];
  personaId?: string;
  spec: Record<string, unknown>;
  changedPositions: number[];
  visualChangePositions?: number[];
};

export type EditorOverrides = Record<string, { headline?: string; body?: string; assetId?: string | number; assetIds?: Array<string | number>; text?: Record<string, unknown>; image?: Record<string, unknown>; imageSlots?: Frame[] }>;

export type ExistingSlideRow = {
  position: number;
  asset_id?: string | number | null;
  rendered_url?: string | null;
  render_metadata?: Record<string, any>;
};
