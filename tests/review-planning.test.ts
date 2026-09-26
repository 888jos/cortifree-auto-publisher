import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextAccountPostingTime } from "../app/lib/planning.js";
import { REVIEW_REASONS, reviewReasonLabel } from "../app/lib/review-reasons.js";
import { carouselButtons, rejectionReasonButtons } from "../app/lib/telegram.js";

function nyParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { day:get("day"), hour:get("hour"), minute:get("minute") };
}

describe("review planning workflow", () => {
  it("chooses the next configured account slot", () => {
    const next = nextAccountPostingTime(["18:10","20:40","22:05"], "America/New_York", new Date("2026-09-26T23:30:00Z"));
    const parts = nyParts(next);
    assert.equal(parts.hour, 20);
    assert.equal(parts.minute, 40);
  });

  it("moves to tomorrow after the last slot", () => {
    const now = new Date("2026-09-27T03:30:00Z");
    const nowParts = nyParts(now);
    const nextParts = nyParts(nextAccountPostingTime(["18:10","20:40"], "America/New_York", now));
    assert.notEqual(nextParts.day, nowParts.day);
    assert.equal(nextParts.hour, 18);
    assert.equal(nextParts.minute, 10);
  });

  it("keeps rejection reasons stable and human-readable", () => {
    assert.ok(REVIEW_REASONS.length >= 8);
    assert.equal(reviewReasonLabel("HOOK_WEAK"), "Hook faible");
    assert.equal(reviewReasonLabel("UNKNOWN"), "Autre");
  });

  it("exposes Telegram review and planning actions with compact callbacks", () => {
    const buttons = carouselButtons("CF_TEST", { canPlan: true }).inline_keyboard.flat();
    assert.ok(buttons.some((button) => button.callback_data === "a:CF_TEST"));
    assert.ok(buttons.some((button) => button.callback_data === "r:CF_TEST"));
    assert.ok(buttons.some((button) => button.callback_data === "p:CF_TEST"));
    const reject = rejectionReasonButtons("CF_TEST").inline_keyboard.flat();
    assert.ok(reject.some((button) => button.callback_data === "rr:COPY_AI:CF_TEST"));
    assert.ok(reject.every((button) => !button.callback_data || button.callback_data.length <= 64));
  });
});
