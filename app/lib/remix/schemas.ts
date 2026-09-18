import { z } from "zod";
import { carouselTypeSchema, supportedLanguageSchema } from "../ai/schemas";

export const remixSourceSlideSchema = z.object({
  position: z.number().int().min(1).max(30),
  text: z.string().max(1200).default(""),
  imageUrl: z.string().url().optional(),
});

export const remixExtractedPayloadSchema = z.object({
  creator: z.string().max(160).optional(),
  caption: z.string().max(5000).optional(),
  rawText: z.string().max(15000).optional(),
  slides: z.array(remixSourceSlideSchema).max(30).default([]),
});

export const remixImportRequestSchema = z.object({
  url: z.string().url(),
  accountId: z.string().regex(/^CF_[A-Z0-9_]+$/).default("CF_EN_01"),
  personaId: z.string().regex(/^P\d{2}$/).default("P06"),
  language: supportedLanguageSchema.default("en"),
  market: z.string().min(2).max(20).default("US"),
  requestedSlideCount: z.number().int().min(4).max(12).optional(),
  extracted: remixExtractedPayloadSchema.optional(),
  requireAI: z.boolean().default(true),
});

export const remixMaterialSchema = z.object({
  sourceUrl: z.string().url(),
  creator: z.string().max(160).nullable(),
  caption: z.string().max(5000),
  rawText: z.string().max(15000),
  slides: z.array(remixSourceSlideSchema).max(30),
  ingestionQuality: z.enum(["full", "manual", "metadata_only"]),
  provider: z.string().min(1).max(80),
  thumbnailUrl: z.string().url().nullable().default(null),
});

export const remixAnalysisSchema = z.object({
  sourceHook: z.string().max(180),
  adaptedHook: z.string().min(1).max(90),
  topic: z.string().min(1).max(180),
  angle: z.string().min(1).max(300),
  detectedFormat: carouselTypeSchema,
  recommendedSlideCount: z.number().int().min(4).max(12),
  ctaMode: z.enum(["none", "soft", "save", "comment", "follow"]).default("save"),
  mechanics: z.array(z.string().min(1).max(180)).min(1).max(10),
  visualPattern: z.array(z.string().min(1).max(180)).max(12),
  slideBlueprint: z.array(z.object({
    position: z.number().int().min(1).max(12),
    purpose: z.string().min(1).max(180),
    visualIntent: z.string().min(1).max(220),
  })).min(4).max(12),
  adaptationNotes: z.array(z.string().min(1).max(220)).max(10),
});

export type RemixExtractedPayload = z.infer<typeof remixExtractedPayloadSchema>;
export type RemixMaterial = z.infer<typeof remixMaterialSchema>;
export type RemixAnalysis = z.infer<typeof remixAnalysisSchema>;
