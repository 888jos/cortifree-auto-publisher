import { z } from "zod";

const booleanValue = (defaultValue: boolean) => z.preprocess(
  (value) => value === undefined || value === "" ? defaultValue : String(value).toLowerCase() === "true", z.boolean(),
);
const aiConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL_PRIMARY: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_MODEL_QA: z.string().min(1).default("gpt-5.6-terra"),
  AI_GENERATION_ENABLED: booleanValue(true), OPENAI_QA_ENABLED: booleanValue(true),
  OPENAI_QA_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  OPENAI_MAX_MONTHLY_USD: z.coerce.number().positive().default(15),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
});
export type AIConfig = z.infer<typeof aiConfigSchema>;
export function getAIConfig(): AIConfig { return aiConfigSchema.parse(process.env); }
