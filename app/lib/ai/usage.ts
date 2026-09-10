import { supabase } from "../supabase.js";
import { estimateCostUsd } from "./pricing";
import type { TokenUsage } from "./types";
import { CORTIFREE_WORKSPACE_ID } from "../workspace";

export class MonthlyCapExceededError extends Error {
  constructor(public readonly spent: number, public readonly cap: number) {
    super(`Monthly OpenAI safety cap reached ($${spent.toFixed(4)} / $${cap.toFixed(2)})`);
  }
}

export type MonthlyUsage = { costUsd: number; calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number };

export function assertWithinMonthlyCap(spent: number, cap: number, bypass = false): void {
  if (!bypass && spent >= cap) throw new MonthlyCapExceededError(spent, cap);
}

export async function getMonthlyUsage(): Promise<MonthlyUsage> {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  try {
    const response = await supabase(`ai_usage_logs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=estimated_cost_usd,input_tokens,cached_input_tokens,output_tokens&created_at=gte.${encodeURIComponent(monthStart)}`);
    if (!response.ok) throw new Error("Usage query failed");
    const rows = await response.json() as Array<Record<string, number | string | null>>;
    return rows.reduce<MonthlyUsage>((total, row) => ({
      costUsd: total.costUsd + Number(row.estimated_cost_usd ?? 0),
      calls: total.calls + 1,
      inputTokens: total.inputTokens + Number(row.input_tokens ?? 0),
      cachedInputTokens: total.cachedInputTokens + Number(row.cached_input_tokens ?? 0),
      outputTokens: total.outputTokens + Number(row.output_tokens ?? 0),
    }), { costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  } catch {
    return { costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  }
}

export async function logAIUsage(entry: {
  operation: string;
  model: string;
  carouselId?: string;
  usage?: TokenUsage;
  success: boolean;
  error?: string;
}): Promise<void> {
  const usage = entry.usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  const row = {
    workspace_id: CORTIFREE_WORKSPACE_ID,
    operation: entry.operation,
    model: entry.model,
    carousel_id: entry.carouselId ?? null,
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens,
    estimated_cost_usd: estimateCostUsd(entry.model, usage),
    success: entry.success,
    error: entry.error?.slice(0, 1_000) ?? null,
  };
  try {
    await supabase("ai_usage_logs", { method: "POST", body: JSON.stringify(row) });
  } catch {
    // Usage storage must never turn a valid draft into a failed draft.
  }
}
