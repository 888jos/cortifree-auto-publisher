import type { TokenUsage } from "./types";

export const MODEL_PRICING_USD_PER_MILLION = {
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
} as const;

// Pricing must be reviewed periodically against the official OpenAI pricing page.
// Unknown models fail closed: a $0 estimate would silently disable the monthly cap.
export function assertKnownModelPricing(model: string) {
  if (!(model in MODEL_PRICING_USD_PER_MILLION)) throw new Error(`No pricing for model "${model}"; add it to MODEL_PRICING_USD_PER_MILLION before using it`);
}

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  assertKnownModelPricing(model);
  const pricing = MODEL_PRICING_USD_PER_MILLION[model as keyof typeof MODEL_PRICING_USD_PER_MILLION];
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return Number(((uncachedInput * pricing.input + usage.cachedInputTokens * pricing.cachedInput + usage.outputTokens * pricing.output) / 1_000_000).toFixed(8));
}
