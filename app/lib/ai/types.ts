export const CAROUSEL_TYPE_IDS = [
  "F01_LIFESTYLE_GUIDE",
  "F02_EDITORIAL_COLLAGE",
  "F03_ROUTINE_TIMELINE",
  "F04_AESTHETIC_EDUCATIONAL",
  "F05_INTERACTIVE_CHECKLIST",
  "F06_PERSONA_EXPLAINER",
  "F07_RANKING",
  "F08_2X2",
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
export type GoldenExampleReference = {
  id: string;
  formatId: string;
  pillarId: string;
  topic: string;
  hook: string;
  slides: string[];
  toneNotes: string;
  whyItWorks: string;
  visualDirection: string;
};
export type EditorialContext = {
  search_query: string;
  primary_keyword: string;
  secondary_keywords: string[];
  language_profile: "GENZ_GIRLY_US" | string;
  language_version: string;
  trend_terms: string[];
  persona_voice: string;
  golden_example_ids: string[];
  golden_examples?: GoldenExampleReference[];
  /** Real creator hooks from 06_HOOKS (STYLE_REFERENCE) for this format. */
  hook_style_references?: string[];
  /** Creator-voice carousels from 20_GOLDEN_CAROUSELS compatible with this format. */
  voice_examples?: GoldenExampleReference[];
  /** The operator's own corrections (generated → kept) on recent carousels of this format. */
  operator_edits?: Array<{ field: "headline" | "body"; before: string; after: string }>;
  operator_rules?: string[];
  concept_id?: string;
  topic_id: string;
  hook_id: string;
  format_id: string;
  account_id: string;
  persona_id: string;
  brand_integration: {
    required: boolean;
    mention: string;
    screenshot_required: boolean;
    integration_type?: string;
    slide?: string;
    intensity?: number;
    app_screen_category?: string;
    app_screen_asset_id?: string | null;
    copy_bank_seed_id?: string | null;
  };
};
export type HealthGuardrails = {
  sources: Array<{
    sourceId: string; topic: string; organization: string | null; title: string; url: string;
    evidenceLevel: string | null; allowedClaims: string | null;
  }>;
  rules: Array<{
    ruleId: string; topic: string; riskLevel: string; claimType: string | null;
    allowedWording: string | null; avoidWording: string | null; exampleSafe: string | null;
    requiresSource: boolean; sourceIds: string[];
  }>;
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
  healthGuardrails?: HealthGuardrails;
  requireCanonicalContext?: boolean;
};
export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
export type AssetAnalysisMetadata = { scene: string; activity: string; framing: string; lighting: string; mood: string; category: string; goodFor: string[] };
