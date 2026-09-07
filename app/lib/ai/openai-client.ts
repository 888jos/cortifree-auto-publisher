import OpenAI, { APIConnectionError, APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { getAIConfig } from "./config";
import type { TokenUsage } from "./types";

let singleton: OpenAI | null = null;

export class AIUnavailableError extends Error {}
export class InvalidStructuredOutputError extends Error {}

export function getOpenAIClient(): OpenAI {
  const config = getAIConfig();
  if (!config.OPENAI_API_KEY) throw new AIUnavailableError("OPENAI_API_KEY is not configured");
  singleton ??= new OpenAI({ apiKey: config.OPENAI_API_KEY, maxRetries: 0 });
  return singleton;
}

export function isRetryableOpenAIError(error: unknown): boolean {
  if (error instanceof APIConnectionError) return true;
  if (error instanceof APIError) return error.status === 429 || (typeof error.status === "number" && error.status >= 500);
  return error instanceof Error && /timeout|timed out|ECONNRESET|fetch failed/i.test(error.message);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 350;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableOpenAIError(error)) throw error;
      await sleep(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export type StructuredResult<T> = { data: T; usage: TokenUsage };

export async function requestStructured<T>(options: {
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}): Promise<StructuredResult<T>> {
  const config = getAIConfig();
  const client = getOpenAIClient();
  return withRetry(async () => {
    const response = await client.responses.parse({
      model: options.model,
      instructions: options.instructions,
      input: options.input,
      max_output_tokens: options.maxOutputTokens ?? 2_400,
      store: false,
      text: { format: zodTextFormat(options.schema, options.schemaName) },
    }, { timeout: config.OPENAI_TIMEOUT_MS, maxRetries: 0 });

    if (!response.output_parsed) {
      throw new InvalidStructuredOutputError("OpenAI returned no parsed structured output");
    }

    return {
      data: options.schema.parse(response.output_parsed),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  });
}
