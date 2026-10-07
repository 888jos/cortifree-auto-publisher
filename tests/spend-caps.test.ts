import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { processImageGenerationJob } from "../app/lib/image-generation.js";
import { generateCarousel } from "../app/lib/ai/carousel-generator.js";
import { reviewCarouselDraft } from "../app/lib/ai/carousel-reviewer.js";
import { estimateCostUsd } from "../app/lib/ai/pricing.js";
import { carouselSpecSchema } from "../app/lib/ai/schemas.js";
import { getMonthlyUsage } from "../app/lib/ai/usage.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

const originalEnv = { ...process.env };
let fake: FakePostgrest;

beforeEach(() => {
  fake = new FakePostgrest().install();
});
afterEach(() => {
  fake.restore();
  process.env = { ...originalEnv };
});

function usageRows(count: number, costUsd: number, createdAt = new Date().toISOString()) {
  return Array.from({ length: count }, () => ({ estimated_cost_usd: costUsd, created_at: createdAt }));
}

describe("image generation budget", () => {
  beforeEach(() => {
    process.env.IMAGE_GENERATION_ENABLED = "true";
    process.env.MODELARK_API_KEY = "modelark-test";
    process.env.MODELARK_MODEL_ID = "seedream-test";
    process.env.IMAGE_GENERATION_UNIT_COST_USD = "0.04";
    process.env.IMAGE_GENERATION_MONTHLY_CAP_USD = "50";
    process.env.IMAGE_GENERATION_DAILY_CAP_USD = "0";
    fake.seed("image_generation_jobs", [{ id: "JOB_1", status: "PENDING" }]);
  });
  const jobUntouched = () => assert.equal(fake.requestsTo("image_generation_jobs", "PATCH").length, 0, "the job must not be claimed");

  it("refuses when the unit cost is 0", async () => {
    process.env.IMAGE_GENERATION_UNIT_COST_USD = "0";
    await assert.rejects(processImageGenerationJob("JOB_1"), /IMAGE_GENERATION_UNIT_COST_USD must be > 0/);
    jobUntouched();
  });

  it("refuses when the monthly cap is reached", async () => {
    process.env.IMAGE_GENERATION_MONTHLY_CAP_USD = "1";
    fake.seed("image_generation_usage", usageRows(25, 0.04));
    await assert.rejects(processImageGenerationJob("JOB_1"), /Monthly ModelArk image budget reached \(1\.00 \/ 1\.00 USD\)/);
    jobUntouched();
  });

  it("refuses when the daily cap is reached", async () => {
    process.env.IMAGE_GENERATION_DAILY_CAP_USD = "0.1";
    fake.seed("image_generation_usage", usageRows(2, 0.04));
    await assert.rejects(processImageGenerationJob("JOB_1"), /Daily image generation cost cap reached/);
    jobUntouched();
  });

  it("only counts today's spend against the daily cap", async () => {
    process.env.IMAGE_GENERATION_DAILY_CAP_USD = "0.1";
    const yesterday = new Date(Date.now() - 86_400_000);
    // Stay inside the current month so the monthly query still sees the row.
    const createdAt = yesterday.getUTCMonth() === new Date().getUTCMonth() ? yesterday.toISOString() : "1999-01-01T00:00:00.000Z";
    fake.seed("image_generation_usage", usageRows(5, 0.04, createdAt));
    // The budget passes, so the job is claimed and then fails on the missing persona config.
    await assert.rejects(processImageGenerationJob("JOB_1"), /personas/i);
    assert.ok(fake.requestsTo("image_generation_jobs", "PATCH").length > 0);
  });

  it("sums every page of usage, not just the first 1000 rows", async () => {
    process.env.IMAGE_GENERATION_UNIT_COST_USD = "0.01";
    process.env.IMAGE_GENERATION_MONTHLY_CAP_USD = "15.005";
    // 1500 rows = $15.00; a single 1000-row page would read $10.00 and let it through.
    fake.seed("image_generation_usage", usageRows(1500, 0.01));
    await assert.rejects(processImageGenerationJob("JOB_1"), /Monthly ModelArk image budget reached \(15\.00 \/ 15\.01 USD\)/);
    assert.ok(fake.requestsTo("image_generation_usage", "GET").length >= 2);
    jobUntouched();
  });

  it("refuses when spend cannot be read", async () => {
    fake.failWhen((request) => request.table === "image_generation_usage");
    await assert.rejects(processImageGenerationJob("JOB_1"), /Cannot verify image generation budget/);
    jobUntouched();
  });
});

describe("monthly OpenAI usage", () => {
  it("pages past the 1000-row response cap", async () => {
    fake.seed("ai_usage_logs", Array.from({ length: 2500 }, () => ({
      estimated_cost_usd: 0.002, input_tokens: 10, cached_input_tokens: 2, output_tokens: 5, created_at: new Date().toISOString(),
    })));
    fake.seed("ai_usage_logs", [{ estimated_cost_usd: 100, input_tokens: 1, created_at: "1999-01-01T00:00:00.000Z" }]);

    const usage = await getMonthlyUsage();

    assert.equal(usage.calls, 2500);
    assert.equal(usage.inputTokens, 25_000);
    assert.equal(usage.cachedInputTokens, 5_000);
    assert.equal(usage.outputTokens, 12_500);
    assert.ok(Math.abs(usage.costUsd - 5) < 1e-9);
    assert.equal(fake.requestsTo("ai_usage_logs", "GET").length, 3);
  });

  it("throws instead of reporting $0 when usage cannot be read", async () => {
    fake.failWhen((request) => request.table === "ai_usage_logs");
    await assert.rejects(getMonthlyUsage(), /Cannot verify monthly OpenAI usage/);
  });
});

describe("unknown OpenAI model", () => {
  const spec = carouselSpecSchema.parse({
    title: "A softer everyday routine", topic: "A softer everyday routine", angle: "Realistic habits without medical promises.",
    hook: "A softer everyday routine", language: "en", caption: "Save this for later.", ctaType: "save",
    slides: [
      ["A softer everyday routine", "Simple ideas for a less rushed day."], ["Start with daylight", "Open the curtains for a few minutes."],
      ["Keep breakfast simple", "Choose a meal that feels satisfying."], ["Take a screen-free pause", "Give yourself one real break."],
      ["Try an easy walk", "Move without a performance goal."], ["Make evenings quieter", "Dim the lights as the day winds down."],
      ["Keep one idea", "Save this and start small."],
    ].map(([headline, body], index) => ({
      position: index + 1, role: index === 0 ? "HOOK" : index === 6 ? "CTA" : "TIP", layout: "single-image", headline, body,
      visualIntent: "Calm everyday lifestyle scene with negative space", assetType: "stock", assetQuery: `wellness lifestyle ${index + 1}`,
    })),
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "openai-test";
    process.env.AI_GENERATION_ENABLED = "true";
    process.env.OPENAI_QA_ENABLED = "false";
  });

  it("blocks generation before reading spend or calling OpenAI", async () => {
    process.env.OPENAI_MODEL_PRIMARY = "gpt-unpriced";
    let usageReads = 0;
    let requests = 0;
    await assert.rejects(generateCarousel({
      carouselType: "F04_AESTHETIC_EDUCATIONAL", layout: "single-image", persona: "P01", language: "en", market: "US",
      references: [], recentCarousels: [], requestedSlideCount: 7, ctaMode: "save",
    }, {
      monthlyUsage: async () => { usageReads += 1; return { costUsd: 0, calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }; },
      structuredRequest: async () => { requests += 1; throw new Error("must not be called"); },
    }), /No pricing for model "gpt-unpriced"/);
    assert.equal(usageReads, 0);
    assert.equal(requests, 0);
  });

  it("blocks QA review before any request", async () => {
    process.env.OPENAI_MODEL_QA = "gpt-unpriced";
    fake.external.push((url) => { throw new Error(`unexpected request to ${url}`); });
    await assert.rejects(reviewCarouselDraft(spec, { expectedSlideCount: 7, language: "en", layout: "single-image" }), /No pricing for model "gpt-unpriced"/);
    assert.equal(fake.requests.length, 0);
  });

  it("refuses to estimate a $0 cost", () => {
    assert.throws(() => estimateCostUsd("gpt-unpriced", { inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 1_000 }), /No pricing/);
  });
});
