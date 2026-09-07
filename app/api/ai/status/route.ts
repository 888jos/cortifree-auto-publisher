import { getAIConfig } from "../../../lib/ai/config";

export const runtime = "nodejs";

export async function GET() {
  const config = getAIConfig();
  return Response.json({
    configured: Boolean(config.OPENAI_API_KEY), enabled: config.AI_GENERATION_ENABLED,
    primaryModel: config.OPENAI_MODEL_PRIMARY, qaModel: config.OPENAI_MODEL_QA,
    qaEnabled: config.OPENAI_QA_ENABLED, qaSampleRate: config.OPENAI_QA_SAMPLE_RATE,
    monthlyCapUsd: config.OPENAI_MAX_MONTHLY_USD,
  });
}
