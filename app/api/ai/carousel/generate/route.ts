import { z } from "zod";
import { generateCarousel } from "../../../../lib/ai/carousel-generator";
import { carouselGeneratorInputSchema } from "../../../../lib/ai/schemas";
import { MonthlyCapExceededError } from "../../../../lib/ai/usage";
import { getRecentCarousels, saveGeneratedCarousel } from "../../../../lib/carousel-store";
import { selectAutomaticHook } from "../../../../lib/hook-selector";

export const runtime = "nodejs";

const requestSchema = carouselGeneratorInputSchema.extend({
  id: z.string().regex(/^CF_[A-Z0-9_]+$/).optional(),
  accountId: z.string().min(1).optional(),
  personaId: z.string().regex(/^P\d{2}$/).optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const id = body.id ?? `CF_${Date.now()}`;
    const recentCarousels = body.recentCarousels.length ? body.recentCarousels : await getRecentCarousels();
    const preferredHook = body.preferredHook ?? selectAutomaticHook({
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
      ctaMode: body.ctaMode,
      bypassMonthlyCap: body.bypassMonthlyCap,
    };
    const result = await generateCarousel(input, {}, { carouselId: id });

    let saved = false;
    let carousel: unknown = { id, topic: result.spec.topic, angle: result.spec.angle, caption: result.spec.caption };
    let storageWarning: string | null = null;
    try {
      carousel = await saveGeneratedCarousel({ id, input, result, accountId: body.accountId, personaId: body.personaId });
      saved = true;
    } catch (error) {
      storageWarning = `Draft generated but Supabase save failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }

    return Response.json({ carousel, spec: result.spec, generation: { source: result.source, model: result.model, generatedAt: result.generatedAt, warning: result.warning, qa: result.qa }, saved, storageWarning }, { status: 201 });
  } catch (error) {
    if (error instanceof MonthlyCapExceededError) {
      return Response.json({ error: error.message, code: "MONTHLY_CAP_EXCEEDED" }, { status: 429 });
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid generation request", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Generation failed" }, { status: 500 });
  }
}
