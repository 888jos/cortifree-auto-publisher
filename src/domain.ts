import { z } from 'zod';
export const languageSchema = z.enum(['en', 'fr']);
export const platformSchema = z.enum(['tiktok', 'instagram']);
export const contentTypeSchema = z.enum(['C01_MORNING_ROUTINE', 'C02_CHECKLIST', 'C03_THINGS_I_STOPPED', 'C04_THINGS_I_STARTED', 'C05_GLOW_UP', 'C06_POV_RELATABLE', 'C07_MISTAKES', 'C08_MY_REALISTIC', 'C09_LIST', 'C10_BEFORE_AFTER', 'C11_HORMONE_EDUCATION', 'C12_NIGHT_ROUTINE']);
export const ctaTypeSchema = z.enum(['none', 'soft', 'save', 'comment', 'follow']);
export const personaConfigSchema = z.object({
  id: z.string().regex(/^P\d{2}$/), name: z.string().min(1), age: z.number().int().min(18).max(80), background: z.string().min(1),
  physical: z.object({ skin: z.string(), hair: z.string(), eyes: z.string(), face: z.string(), build: z.string() }), situation: z.string(), visual_style: z.string(), signature_scene: z.string(),
  image_generation: z.object({ master_prompt: z.string(), identity_reference_prompt: z.string(), negative_prompt: z.string() }),
  content: z.object({ primary_topics: z.array(z.string()).min(1), voice: z.string(), cta_style: z.string(), medical_guardrails: z.array(z.string()).min(1) })
});
export type PersonaConfig = z.infer<typeof personaConfigSchema>;
export const accountSchema = z.object({ id: z.string().min(1), name: z.string().min(1), persona_id: z.string().regex(/^P\d{2}$/), language: languageSchema, market: z.string().min(2), timezone: z.string().min(1), platforms: z.array(platformSchema).min(1), upload_post_profile: z.string().optional(), daily_target: z.number().int().min(0).max(2), posting_slots: z.array(z.string().regex(/^\d{2}:\d{2}$/)), enabled: z.boolean(), warmup_status: z.enum(['CREATED', 'WARMING', 'ACTIVE', 'PAUSED', 'ERROR']).default('CREATED'), created_at: z.string().datetime().optional() });
export type Account = z.infer<typeof accountSchema>;
export const templateConstraintSchema = z.object({ id: z.string(), requires_image: z.boolean(), supports_subheadline: z.boolean(), max_headline_chars: z.number().int().positive(), max_body_chars: z.number().int().nonnegative(), max_items: z.number().int().nonnegative(), allowed_slide_positions: z.array(z.number().int().positive()) });
export type TemplateConstraint = z.infer<typeof templateConstraintSchema>;
export const assetRequirementSchema = z.object({ type: z.enum(['persona', 'stock', 'generated']), category: z.string(), query: z.string().min(1) });
export const carouselSlideSchema = z.object({ position: z.number().int().min(1).max(12), template_id: z.string(), headline: z.string().min(1), subheadline: z.string().nullable(), body: z.string().nullable().optional(), items: z.array(z.string()).max(10).optional(), asset_requirement: assetRequirementSchema, asset_id: z.string().optional() });
export const carouselSpecSchema = z.object({ id: z.string().regex(/^CF_[A-Z0-9_]+$/), account_id: z.string(), persona_id: z.string().regex(/^P\d{2}$/), language: languageSchema, content_type: contentTypeSchema, topic: z.string().min(1), angle: z.string().min(1), caption: z.string().min(1), cta_type: ctaTypeSchema, status: z.enum(['GENERATED', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED', 'POSTED', 'FAILED']).default('GENERATED'), slides: z.array(carouselSlideSchema).min(1).max(12) });
export type CarouselSpec = z.infer<typeof carouselSpecSchema>;
export const assetRecordSchema = z.object({ id: z.string(), path: z.string(), relative_path: z.string(), filename: z.string(), category: z.string(), persona_id: z.string().nullable(), source_type: z.enum(['stock', 'persona_generated', 'persona_master', 'persona_reference', 'visual_reference']), width: z.number().int().positive(), height: z.number().int().positive(), hash: z.string(), created_at: z.string().datetime(), indexed_at: z.string().datetime(), last_used_at: z.string().datetime().nullable(), use_count: z.number().int().nonnegative(), enabled: z.boolean() });
export type AssetRecord = z.infer<typeof assetRecordSchema>;
