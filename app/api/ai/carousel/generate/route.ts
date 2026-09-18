import { z } from "zod";
import { generateCarousel } from "../../../../lib/ai/carousel-generator";
import { carouselGeneratorInputSchema } from "../../../../lib/ai/schemas";
import { MonthlyCapExceededError } from "../../../../lib/ai/usage";
import { getRecentCarousels, saveGeneratedCarousel } from "../../../../lib/carousel-store";
import { selectAutomaticHook } from "../../../../lib/hook-selector";
import { markEditorialUsage, selectEditorialPackage } from "../../../../lib/editorial-selector";

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
    const recentCarousels = body.recentCarousels.length ? body.recentCarousels : await getRecentCarousels();
    const editorial = (!body.preferredTopic || !body.preferredAngle || !body.preferredHook || !body.preferredCtaText)
      ? await selectEditorialPackage({
          carouselType: body.carouselType,
          personaId: body.personaId,
          recentTopics: recentCarousels.map((carousel) => carousel.topic).filter(Boolean),
          recentHooks: recentCarousels.map((carousel) => carousel.hook).filter((hook): hook is string => Boolean(hook)),
        })
      : null;
    const preferredHook = body.preferredHook ?? editorial?.hookText ?? selectAutomaticHook({
      carouselType: body.carouselType,
      recentHooks: recentCarousels.map((carousel) => carousel.hook).filter((hook): hook is string => Boolean(hook)),
      referenceTitles: body.references.map((reference) => reference.title),
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
      preferredHook,
      preferredTopic: body.preferredTopic ?? editorial?.topic.topic,
      preferredAngle: body.preferredAngle ?? editorial?.topic.angle,
      preferredCtaText: body.preferredCtaText ?? editorial?.cta.text,
      ctaMode: body.ctaMode,
      bypassMonthlyCap: body.bypassMonthlyCap,
    };
    const result = await generateCarousel(input, {}, { carouselId: id });
    if (body.requireAI && result.source !== "openai") {
      return Response.json({ error: result.warning ?? "OpenAI generation failed", code: "AI_REQUIRED" }, { status: 503 });
    }

    let saved = false;
    let carousel: unknown = { id, topic: result.spec.topic, angle: result.spec.angle, caption: result.spec.caption };
    let storageWarning: string | null = null;
    try {
      carousel = await saveGeneratedCarousel({ id, input, result, accountId: body.accountId, personaId: body.personaId });
      saved = true;
      if (editorial) {
        try { await markEditorialUsage(editorial); }
        catch (error) { storageWarning = `Draft saved, but editorial usage tracking failed: ${error instanceof Error ? error.message : "unknown error"}`; }
      }
    } catch (error) {
      storageWarning = `Draft generated but Convex save failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }

    return Response.json({
      carousel,
      spec: result.spec,
      editorial: editorial ? { topicId: editorial.topic.topic_id, hookId: editorial.hook.hook_id, ctaId: editorial.cta.cta_id } : null,
      generation: { source: result.source, model: result.model, generatedAt: result.generatedAt, warning: result.warning, qa: result.qa },
      saved,
      storageWarning,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof MonthlyCapExceededError) {
      return Response.json({ error: error.message, code: "MONTHLY_CAP_EXCEEDED" }, { status: 429 });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid generation request", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Generation failed" }, { status: 500 });
  }
}
