import { z } from "zod";
import { getAIConfig } from "../../../../lib/ai/config";
import { reviewCarouselDraft } from "../../../../lib/ai/carousel-reviewer";
import { carouselSpecSchema } from "../../../../lib/ai/schemas";
import { assertWithinMonthlyCap, getMonthlyUsage, MonthlyCapExceededError } from "../../../../lib/ai/usage";

export const runtime = "nodejs";

const requestSchema = z.object({
  carouselId: z.string().optional(), spec: carouselSpecSchema, expectedSlideCount: z.number().int().min(6).max(8),
  language: z.enum(["en", "fr"]), layout: z.string().min(1), bypassMonthlyCap: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const config = getAIConfig();
    if (!config.OPENAI_QA_ENABLED || !config.OPENAI_API_KEY) return Response.json({ error: "OpenAI QA is unavailable" }, { status: 503 });
    const monthly = await getMonthlyUsage();
    assertWithinMonthlyCap(monthly.costUsd, config.OPENAI_MAX_MONTHLY_USD, body.bypassMonthlyCap);
    const review = await reviewCarouselDraft(body.spec, body);
    return Response.json({ review });
  } catch (error) {
    if (error instanceof MonthlyCapExceededError) return Response.json({ error: error.message, code: "MONTHLY_CAP_EXCEEDED" }, { status: 429 });
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid review request", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Review failed" }, { status: 500 });
  }
}
