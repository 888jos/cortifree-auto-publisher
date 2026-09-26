import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
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

  it("keeps approval separate from planning and publishing", async () => {
    const approveRoute = await fs.readFile(path.join(process.cwd(), "app/api/review/approve/route.ts"), "utf8");
    const publishing = await fs.readFile(path.join(process.cwd(), "src/autonomy/publishing.ts"), "utf8");
    assert.doesNotMatch(approveRoute, /SCHEDULE_APPROVED_POST/);
    assert.match(publishing, /status=eq\.SCHEDULED&review_status=eq\.SCHEDULED/);
    assert.doesNotMatch(publishing, /status=eq\.APPROVED&review_status=eq\.APPROVED/);
  });

  it("keeps archived history out of the active review queue", async () => {
    const reviewApi = await fs.readFile(path.join(process.cwd(), "app/api/review/route.ts"), "utf8");
    const telegramWebhook = await fs.readFile(path.join(process.cwd(), "app/api/telegram/webhook/route.ts"), "utf8");
    assert.match(reviewApi, /status \?\? ""\) !== "ARCHIVED"/);
    assert.match(reviewApi, /status !== "AWAITING_REVIEW" \|\| String\(row\.status \?\? ""\) === "READY_FOR_REVIEW"/);
    assert.match(telegramWebhook, /review_status=eq\.AWAITING_REVIEW&status=eq\.READY_FOR_REVIEW/);
  });

  it("ships dedicated Review and Planning workspaces", async () => {
    const review = await fs.readFile(path.join(process.cwd(), "app/review/page.tsx"), "utf8");
    const planning = await fs.readFile(path.join(process.cwd(), "app/planning/page.tsx"), "utf8");
    assert.match(review, /Refuser définitivement/);
    assert.match(review, /Refuser \+ demander une correction/);
    assert.match(planning, /BACKLOG APPROUVÉ/);
    assert.match(planning, /Prochain créneau/);
  });
});
