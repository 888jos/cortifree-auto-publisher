import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

function loadLocalDotEnv() {
  const file = path.resolve('.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match?.[1] && process.env[match[1]] === undefined) process.env[match[1]] = match[2]?.replace(/^['"]|['"]$/g, '') ?? '';
  }
}

const bool = z.preprocess((v) => v === undefined ? undefined : String(v).toLowerCase() === 'true', z.boolean().default(true));
const boolDefaultFalse = z.preprocess((v) => v === undefined ? undefined : String(v).toLowerCase() === 'true', z.boolean().default(false));
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATA_BACKEND: z.enum(['convex', 'supabase']).default('convex'),
  DRIVE_ROOT: z.string().default('./CORTIFREE_CONTENT'),
  NEXT_PUBLIC_CONVEX_URL: z.string().optional(), CORTIFREE_BACKEND_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(), SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_PRIMARY: z.string().default('gpt-5.6-luna'), OPENAI_MODEL_QA: z.string().default('gpt-5.6-terra'),
  AI_GENERATION_ENABLED: bool, OPENAI_QA_ENABLED: bool, OPENAI_QA_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  OPENAI_MAX_MONTHLY_USD: z.coerce.number().positive().default(15), OPENAI_TIMEOUT_MS: z.coerce.number().int().min(5000).default(45000),
  MODELARK_API_KEY: z.string().optional(), MODELARK_MODEL_ID: z.string().optional(),
  IMAGE_GENERATION_ENABLED: boolDefaultFalse, IMAGE_GENERATION_MAX_RETRIES: z.coerce.number().int().min(1).max(3).default(3),
  IMAGE_GENERATION_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(3).default(3), IMAGE_GENERATION_DAILY_CAP_USD: z.coerce.number().nonnegative().default(0),
  IMAGE_GENERATION_UNIT_COST_USD: z.coerce.number().nonnegative().default(0), MAX_NEW_AI_IMAGES_PER_CAROUSEL: z.coerce.number().int().min(0).max(3).default(2),
  UPLOAD_POST_API_KEY: z.string().optional(), TELEGRAM_BOT_TOKEN: z.string().optional(), TELEGRAM_CHAT_ID: z.string().optional(),
  DRY_RUN: bool, REQUIRE_APPROVAL: bool, AI_DISCLOSURE_MODE: z.enum(['auto', 'always', 'never']).default('auto'),
  TARGET_READY_BUFFER_DAYS: z.coerce.number().int().positive().default(3),
  MAX_TEXT_RETRIES: z.coerce.number().int().min(0).default(3), MAX_IMAGE_RETRIES: z.coerce.number().int().min(0).default(3), MAX_RENDER_RETRIES: z.coerce.number().int().min(0).default(2)
});
export type AppEnv = z.infer<typeof schema>;
export function loadEnv(): AppEnv {
  loadLocalDotEnv();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid environment configuration:\n${parsed.error.message}`);
  return parsed.data;
}
