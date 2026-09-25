export const CAROUSEL_TYPE_IDS = [
  "F01_LIFESTYLE_GUIDE",
  "F02_EDITORIAL_COLLAGE",
  "F03_ROUTINE_TIMELINE",
  "F04_AESTHETIC_EDUCATIONAL",
  "F05_INTERACTIVE_CHECKLIST",
  "F06_PERSONA_EXPLAINER",
  "F07_RANKING",
  "F08_2X2",
  "F09_LIFESTYLE_3STACK",
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
export type EditorialContext = {
  search_query: string;
  primary_keyword: string;
  secondary_keywords: string[];
  language_profile: "GENZ_GIRLY_US" | string;
  language_version: string;
  trend_terms: string[];
  persona_voice: string;
  golden_example_ids: string[];
  topic_id: string;
  hook_id: string;
  format_id: string;
  account_id: string;
  persona_id: string;
  brand_integration: {
    required: boolean;
    mention: string;
    screenshot_required: boolean;
  };
};
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
  accountId?: string;
  personaId?: string;
  topicId?: string;
  hookId?: string;
  formatId?: string;
  editorialContext?: EditorialContext;
  requireCanonicalContext?: boolean;
};
export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
export type AssetAnalysisMetadata = { scene: string; activity: string; framing: string; lighting: string; mood: string; category: string; goodFor: string[] };
