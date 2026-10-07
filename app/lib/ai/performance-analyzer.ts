import { getAIConfig } from "./config";
import { requestStructured } from "./openai-client";
import { PERFORMANCE_ANALYZER_INSTRUCTIONS, PERFORMANCE_ANALYZER_PROMPT_VERSION } from "./prompts";
import { performanceAnalysisSchema, performanceInputSchema, type PerformanceAnalysis, type PerformanceInput } from "./schemas";
import { assertWithinMonthlyCap, getMonthlyUsage, logAIUsage } from "./usage";
import { assertKnownModelPricing } from "./pricing";

export async function analyzePerformance(input: PerformanceInput): Promise<PerformanceAnalysis> {
  const config = getAIConfig();
  const parsed = performanceInputSchema.parse(input);
  assertKnownModelPricing(config.OPENAI_MODEL_QA);
  assertWithinMonthlyCap((await getMonthlyUsage()).costUsd, config.OPENAI_MAX_MONTHLY_USD);
  const result = await requestStructured({
    model: config.OPENAI_MODEL_QA,
    schema: performanceAnalysisSchema,
    schemaName: "cortifree_performance_analysis",
    instructions: PERFORMANCE_ANALYZER_INSTRUCTIONS,
    input: `${PERFORMANCE_ANALYZER_PROMPT_VERSION}\nPOST DATA\n${JSON.stringify(parsed)}`,
    maxOutputTokens: 2_000,
  });
  await logAIUsage({ operation: "performance.analyze", model: config.OPENAI_MODEL_QA, usage: result.usage, success: true });
  return performanceAnalysisSchema.parse(result.data);
}
