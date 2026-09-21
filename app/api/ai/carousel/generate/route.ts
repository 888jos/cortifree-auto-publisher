import { z } from "zod";
import { generateCarousel, CanonicalGenerationBlockedError } from "../../../../lib/ai/carousel-generator";
import { carouselGeneratorInputSchema } from "../../../../lib/ai/schemas";
import { MonthlyCapExceededError } from "../../../../lib/ai/usage";
import { getRecentCarousels, saveGeneratedCarousel } from "../../../../lib/carousel-store";
import { resolveCanonicalEditorialContext } from "../../../../lib/editorial/canonical-context";

export const runtime = "nodejs";

const requestSchema = carouselGeneratorInputSchema.extend({
  id: z.string().regex(/^CF_[A-Z0-9_]+$/).optional(),
  accountId: z.string().min(1).optional(),
  personaId: z.string().regex(/^P\d{2}$/).optional(),
  requireAI: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const id = body.id ?? `CF_${Date.now()}`;
    const accountId = body.accountId ?? "CF_EN_01";
    const personaId = body.personaId ?? "P01";
    const recentCarousels = body.recentCarousels.length ? body.recentCarousels : await getRecentCarousels();
    const canonical = await resolveCanonicalEditorialContext({
      accountId, personaId, formatId: body.carouselType, language: body.language, market: body.market,
      references: body.references.map((reference) => ({ id: reference.id, title: reference.title })), preferredHook: body.preferredHook,
    });
    const input = {
      carouselType: body.carouselType,
      layout: body.layout,
      persona: body.persona,
      language: body.language,
      market: body.market,
      references: body.references,
      recentCarousels,
      requestedSlideCount: body.requestedSlideCount,
      preferredHook: canonical.preferredHook,
      ctaMode: body.ctaMode,
      bypassMonthlyCap: body.bypassMonthlyCap,
      accountId, personaId, topicId: canonical.topicId, hookId: canonical.hookId, formatId: canonical.formatId,
      editorialContext: canonical.editorialContext, requireCanonicalContext: true,
    };
    const result = await generateCarousel(input, {}, { carouselId: id });
    if (body.requireAI && result.source !== "openai") {
      return Response.json({ error: result.warning ?? "OpenAI generation failed", code: "AI_REQUIRED" }, { status: 503 });
    }

    let saved = false;
    let carousel: unknown = { id, topic: result.spec.topic, angle: result.spec.angle, caption: result.spec.caption };
    let storageWarning: string | null = null;
    try {
      carousel = await saveGeneratedCarousel({ id, input, result, accountId, personaId });
      saved = true;
    } catch (error) {
      storageWarning = `Draft generated but Supabase save failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }

    return Response.json({ carousel, spec: result.spec, generation: { source: result.source, model: result.model, generatedAt: result.generatedAt, warning: result.warning, qa: result.qa }, saved, storageWarning }, { status: 201 });
  } catch (error) {
    if (error instanceof MonthlyCapExceededError) {
      return Response.json({ error: error.message, code: "MONTHLY_CAP_EXCEEDED" }, { status: 429 });
    }
    if (error instanceof CanonicalGenerationBlockedError || (error instanceof Error && error.message.startsWith("CANONICAL_CONTEXT_UNAVAILABLE:"))) {
      return Response.json({ error: error instanceof Error ? error.message : "Generation blocked", code: "CANONICAL_CONTEXT_REQUIRED" }, { status: 422 });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid generation request", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Generation failed" }, { status: 500 });
  }
}
