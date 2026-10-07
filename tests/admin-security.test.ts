import assert from "node:assert/strict";
import test from "node:test";
import { CRON_PATHS, isAdminRequest, isCronRequest, isEmailAllowed } from "../app/lib/admin-auth";
import { signedOAuthState, verifyOAuthState } from "../app/lib/google/auth";
import { assertKnownModelPricing, estimateCostUsd } from "../app/lib/ai/pricing";
import { parseResource } from "../app/lib/data-backend";
import { carouselGeneratorInputSchema } from "../app/lib/ai/schemas";

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

test("admin authentication accepts only the configured Basic or Bearer credential", () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.CORTIFREE_ADMIN_USER = "admin";
  process.env.CORTIFREE_ADMIN_PASSWORD = "correct-secret";
  try {
    assert.equal(isAdminRequest(new Request("https://example.com", { headers: { authorization: basic("admin", "correct-secret") } })), true);
    assert.equal(isAdminRequest(new Request("https://example.com", { headers: { authorization: "Bearer correct-secret" } })), true);
    assert.equal(isAdminRequest(new Request("https://example.com", { headers: { authorization: basic("admin", "wrong") } })), false);
    assert.equal(isAdminRequest(new Request("https://example.com")), false);
  } finally {
    process.env = previous;
  }
});

test("cron authentication is separate from the admin password", () => {
  const previous = { ...process.env };
  process.env.CRON_SECRET = "cron-secret";
  try {
    assert.equal(isCronRequest(new Request("https://example.com", { headers: { authorization: "Bearer cron-secret" } })), true);
    assert.equal(isCronRequest(new Request("https://example.com", { headers: { authorization: "Bearer admin-secret" } })), false);
  } finally {
    process.env = previous;
  }
});

test("client carousel input cannot enable the monthly-cap bypass", () => {
  const parsed = carouselGeneratorInputSchema.parse({
    carouselType: "F01_LIFESTYLE_GUIDE",
    layout: "single-image",
    language: "en",
    market: "US",
    references: [],
    recentCarousels: [],
    requestedSlideCount: 7,
    ctaMode: "save",
    bypassMonthlyCap: true,
  });
  assert.equal("bypassMonthlyCap" in parsed, false);
});

test("dashboard sessions are limited to the email allowlist, closed by default in production", () => {
  const previous = { ...process.env };
  try {
    assert.equal(isEmailAllowed("Owner@Example.com", ["owner@example.com"]), true);
    assert.equal(isEmailAllowed("stranger@example.com", ["owner@example.com"]), false);
    assert.equal(isEmailAllowed(undefined, ["owner@example.com"]), false);
    process.env.NODE_ENV = "production";
    assert.equal(isEmailAllowed("owner@example.com", []), false);
  } finally {
    process.env = previous;
  }
});

test("the cron bearer only opens machine routes", () => {
  assert.equal(CRON_PATHS.has("/api/autonomy/run"), true);
  assert.equal(CRON_PATHS.has("/api/carousels"), false);
  assert.equal(CRON_PATHS.has("/api/ai/generate"), false);
});

test("Google OAuth state needs a real secret and the browser nonce", () => {
  const previous = { ...process.env };
  try {
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.throws(() => signedOAuthState("nonce-a"), /OAUTH_STATE_SECRET/);
    process.env.OAUTH_STATE_SECRET = "state-secret";
    const state = signedOAuthState("nonce-a");
    assert.equal(verifyOAuthState(state, "nonce-a"), true);
    assert.equal(verifyOAuthState(state, "nonce-b"), false);
    assert.equal(verifyOAuthState(state, undefined), false);
  } finally {
    process.env = previous;
  }
});

test("unknown OpenAI models fail closed instead of costing $0", () => {
  assert.throws(() => assertKnownModelPricing("gpt-unknown"), /No pricing/);
  assert.throws(() => estimateCostUsd("gpt-unknown", { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }), /No pricing/);
});

test("the data adapter keeps offset, logical and unknown PostgREST filters", () => {
  const parsed = parseResource("image_generation_usage?created_at=gte.2026-10-01&or=(next_attempt_at.is.null,next_attempt_at.lte.2026-10-07)&last_error=ilike.*Overdue*&limit=1000&offset=2000");
  assert.equal(parsed.offset, 2000);
  assert.deepEqual(parsed.filters.find((filter) => filter.field === "or"), { field: "or", op: "raw", value: "(next_attempt_at.is.null,next_attempt_at.lte.2026-10-07)" });
  assert.deepEqual(parsed.filters.find((filter) => filter.field === "last_error"), { field: "last_error", op: "raw", value: "ilike.*Overdue*" });
});

test("operator routes accept only the middleware-set session marker, cron or admin", async () => {
  const { isOperatorRequest } = await import("../app/lib/admin-auth");
  const previous = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.CORTIFREE_ADMIN_PASSWORD = "admin-secret";
  process.env.CRON_SECRET = "cron-secret";
  try {
    assert.equal(isOperatorRequest(new Request("https://example.com", { headers: { "x-cortifree-session": "allowed" } })), true);
    assert.equal(isOperatorRequest(new Request("https://example.com", { headers: { authorization: "Bearer cron-secret" } })), true);
    assert.equal(isOperatorRequest(new Request("https://example.com", { headers: { "x-cortifree-session": "yes" } })), false);
    assert.equal(isOperatorRequest(new Request("https://example.com")), false);
  } finally {
    process.env = previous;
  }
});
