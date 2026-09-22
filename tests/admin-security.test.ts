import assert from "node:assert/strict";
import test from "node:test";
import { isAdminRequest, isCronRequest } from "../app/lib/admin-auth";
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
    carouselType: "C05_GLOW_UP",
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
