import { z } from "zod";
import { CAROUSEL_TYPE_IDS, SLIDE_ROLES } from "./types";

export const supportedLanguageSchema = z.enum(["en", "fr"]);
export const carouselTypeSchema = z.enum(CAROUSEL_TYPE_IDS);
export const slideRoleSchema = z.enum(SLIDE_ROLES);
export const ctaTypeSchema = z.enum(["none", "soft", "save", "comment", "follow"]);
export const assetTypeSchema = z.enum(["stock", "persona", "generated", "text_only"]);
export const referenceMetadataSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().min(1).max(180), slideCount: z.number().int().min(1).max(30),
  notes: z.string().max(500).optional(), sourceUrl: z.string().url().optional(),
  templateFamily: z.string().max(120).optional(), rhythm: z.string().max(240).optional(),
  slides: z.array(z.object({
    position: z.number().int().min(1).max(12), role: slideRoleSchema,
    imagePlacement: z.string().min(1).max(80), textPlacement: z.string().min(1).max(80),
    textAlign: z.enum(["left", "center", "right"]),
    geometry: z.record(z.string(), z.unknown()).optional(),
  })).max(12).optional(),
});
export const recentCarouselSchema = z.object({
  id: z.string().min(1).max(120), topic: z.string().min(1).max(180), angle: z.string().min(1).max(300), hook: z.string().max(140).optional(),
});
export const editorialContextSchema = z.object({
  search_query: z.string(), primary_keyword: z.string(), secondary_keywords: z.array(z.string()),
  language_profile: z.string(), language_version: z.string(), trend_terms: z.array(z.string()), persona_voice: z.string(),
  golden_example_ids: z.array(z.string()), topic_id: z.string(), hook_id: z.string(), format_id: z.string(),
  account_id: z.string(), persona_id: z.string(),
  brand_integration: z.object({ required: z.boolean(), mention: z.string(), screenshot_required: z.boolean() }),
});
export const carouselGeneratorInputSchema = z.object({
  carouselType: carouselTypeSchema,
  layout: z.string().min(1).max(80),
  persona: z.string().min(1).max(120).optional(),
  language: supportedLanguageSchema.default("en"),
  market: z.string().min(2).max(20).default("US"),
  references: z.array(referenceMetadataSchema).max(8).default([]),
  recentCarousels: z.array(recentCarouselSchema).max(10).default([]),
  requestedSlideCount: z.number().int().min(4).max(12).default(7),
  preferredHook: z.string().min(1).max(140).optional(),
  ctaMode: ctaTypeSchema.default("save"),
  accountId: z.string().regex(/^CF_/).optional(),
  personaId: z.string().regex(/^P\d{2}$/).optional(),
  topicId: z.string().min(1).optional(),
  hookId: z.string().min(1).optional(),
  formatId: z.string().min(1).optional(),
  editorialContext: editorialContextSchema.optional(),
  requireCanonicalContext: z.boolean().default(false),
});
export const carouselSlideSchema = z.object({
  position: z.number().int().min(1).max(12), role: slideRoleSchema, layout: z.string().min(1).max(80),
  headline: z.string().min(1).max(90), body: z.string().max(280), visualIntent: z.string().min(1).max(240),
  assetType: assetTypeSchema, assetQuery: z.string().min(1).max(180),
});
export const carouselSpecSchema = z.object({
  title: z.string().min(1).max(120), topic: z.string().min(1).max(180), angle: z.string().min(1).max(300),
  hook: z.string().min(1).max(90), language: supportedLanguageSchema, caption: z.string().min(1).max(500),
  ctaType: ctaTypeSchema, slides: z.array(carouselSlideSchema).min(4).max(12),
});
export const reviewIssueSchema = z.object({
  severity: z.enum(["minor", "major"]), code: z.string().min(1).max(60), message: z.string().min(1).max(300),
  slidePosition: z.number().int().min(1).max(12).nullable(),
});
export const carouselReviewSchema = z.object({
  approved: z.boolean(), score: z.number().int().min(0).max(100), issues: z.array(reviewIssueSchema).max(20), correctedSpec: carouselSpecSchema.nullable(),
});
export const performanceInputSchema = z.object({ posts: z.array(z.object({
  id: z.string(), views: z.number().nonnegative(), likes: z.number().nonnegative(), comments: z.number().nonnegative(),
  saves: z.number().nonnegative(), shares: z.number().nonnegative(), contentType: carouselTypeSchema, layout: z.string(),
  hook: z.string(), persona: z.string().nullable(), postingTime: z.string(),
})).min(1).max(100) });
export const performanceAnalysisSchema = z.object({
  summary: z.string().min(1).max(600), winningPatterns: z.array(z.string().min(1).max(240)).max(10),
  weakPatterns: z.array(z.string().min(1).max(240)).max(10), recommendations: z.array(z.string().min(1).max(240)).max(10),
});
export const assetAnalysisSchema = z.object({
  scene: z.string(), activity: z.string(), framing: z.string(), lighting: z.string(), mood: z.string(), category: z.string(), goodFor: z.array(z.string()),
});
export type CarouselSpec = z.infer<typeof carouselSpecSchema>;
export type CarouselReview = z.infer<typeof carouselReviewSchema>;
export type CarouselGeneratorRequest = z.infer<typeof carouselGeneratorInputSchema>;
export type PerformanceInput = z.infer<typeof performanceInputSchema>;
export type PerformanceAnalysis = z.infer<typeof performanceAnalysisSchema>;
