import { getAIConfig } from "../../../lib/ai/config";
import { getMonthlyUsage } from "../../../lib/ai/usage";

export const runtime = "nodejs";

export async function GET() {
  const config = getAIConfig();
  const usage = await getMonthlyUsage();
  return Response.json({ ...usage, monthlyCapUsd: config.OPENAI_MAX_MONTHLY_USD, remainingUsd: Math.max(0, config.OPENAI_MAX_MONTHLY_USD - usage.costUsd) });
}
