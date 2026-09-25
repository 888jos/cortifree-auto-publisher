import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextHumanApprovedPostingTime } from "../app/lib/human-review.js";

function nyParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { day:get("day"), hour:get("hour"), minute:get("minute") };
}

describe("human review scheduling", () => {
  it("schedules an approval before the window at 18:00 New York", () => {
    const scheduled = nextHumanApprovedPostingTime(new Date("2026-09-25T15:00:00Z"));
    const parts = nyParts(scheduled);
    assert.equal(parts.hour, 18);
    assert.equal(parts.minute, 0);
  });

  it("uses a later same-day slot when approval happens during the window", () => {
    const scheduled = nextHumanApprovedPostingTime(new Date("2026-09-25T23:12:00Z"));
    const parts = nyParts(scheduled);
    assert.equal(parts.hour, 19);
    assert.equal(parts.minute, 30);
  });

  it("moves to the next day after 23:00 New York", () => {
    const now = new Date("2026-09-26T03:30:00Z");
    const nowParts = nyParts(now);
    const scheduledParts = nyParts(nextHumanApprovedPostingTime(now));
    assert.notEqual(scheduledParts.day, nowParts.day);
    assert.equal(scheduledParts.hour, 18);
    assert.equal(scheduledParts.minute, 0);
  });
});
