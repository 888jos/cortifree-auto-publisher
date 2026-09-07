export const CAROUSEL_TYPE_IDS = [
  "C01_MORNING_ROUTINE", "C02_CHECKLIST", "C03_THINGS_I_STOPPED", "C04_THINGS_I_STARTED",
  "C05_GLOW_UP", "C06_POV_RELATABLE", "C07_MISTAKES", "C08_MY_REALISTIC", "C09_LIST",
  "C10_BEFORE_AFTER", "C11_HORMONE_EDUCATION", "C12_NIGHT_ROUTINE",
] as const;

export const SLIDE_ROLES = [
  "HOOK", "CONTEXT", "TIP", "STEP", "CHECKLIST", "PROOF", "MYTH", "FACT", "MISTAKE",
  "FIX", "TRANSITION", "TAKEAWAY", "CTA",
] as const;

export type CarouselTypeId = (typeof CAROUSEL_TYPE_IDS)[number];
export type SlideRole = (typeof SLIDE_ROLES)[number];
export type SupportedLanguage = "en" | "fr";
export type ReferenceSlideBlueprint = {
  position: number;
  role: SlideRole;
  imagePlacement: string;
  textPlacement: string;
  textAlign: "left" | "center" | "right";
  geometry?: Record<string, unknown>;
};
export type ReferenceMetadata = {
  id: string;
  title: string;
  slideCount: number;
  notes?: string;
  sourceUrl?: string;
  templateFamily?: string;
  rhythm?: string;
  slides?: ReferenceSlideBlueprint[];
};
export type RecentCarousel = { id: string; topic: string; angle: string; hook?: string };
export type CarouselGeneratorInput = {
  carouselType: CarouselTypeId;
  layout: string;
  persona?: string;
  language: SupportedLanguage;
  market: string;
  references: ReferenceMetadata[];
  recentCarousels: RecentCarousel[];
  requestedSlideCount: number;
  preferredHook?: string;
  ctaMode: "none" | "soft" | "save" | "comment" | "follow";
};
export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
export type AssetAnalysisMetadata = { scene: string; activity: string; framing: string; lighting: string; mood: string; category: string; goodFor: string[] };
