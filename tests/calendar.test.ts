import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalCalendar } from "../app/lib/editorial/calendar";

const accounts = [{
  id: "CF_EN_01", name: "Ava", persona_id: "P06", timezone: "America/New_York",
  enabled: true, posting_enabled: false, daily_target: 1,
}];

test("calendar uses canonical Sheet slots and preserves warm-up/rest cadence", () => {
  const calendar = buildCanonicalCalendar({
    accounts,
    days: 3,
    now: new Date("2026-09-22T12:00:00.000Z"),
    records: [
      { key: "CAL_1", active: true, data: { slot_id: "CAL_1", account_id: "CF_EN_01", persona_id: "P06", username: "ava", date: "2026-09-25", local_time: "20:03", timezone: "America/New_York", platform: "tiktok", status: "PLANNED", carousel_type: "C05_GLOW_UP", topic: "topic one", angle: "angle one", phase: "WARMUP" } },
      { key: "CAL_2", active: true, data: { slot_id: "CAL_2", account_id: "CF_EN_01", persona_id: "P06", username: "ava", date: "2026-09-27", local_time: "18:41", timezone: "America/New_York", platform: "tiktok", status: "PLANNED", carousel_type: "C09_LIST", topic: "topic two", angle: "angle two", phase: "WARMUP" } },
    ],
  });

  assert.equal(calendar.source, "15_CONTENT_CALENDAR");
  assert.equal(calendar.startDate, "2026-09-25");
  assert.deepEqual(calendar.dailyTotals.map((day) => day.total), [1, 0, 1]);
  assert.deepEqual(calendar.accounts[0]?.entries.map((entry) => entry.slot), ["20:03", "18:41"]);
  assert.equal(calendar.accounts[0]?.entries[0]?.source, "sheet_calendar");
  assert.equal(calendar.summary.totalSlots, 2);
});

test("calendar honors an explicit bounded start date", () => {
  const calendar = buildCanonicalCalendar({
    accounts,
    days: 1,
    start: "2026-10-01",
    records: [{ key: "CAL_3", data: { account_id: "CF_EN_01", persona_id: "P06", date: "2026-10-01", local_time: "21:17", carousel_type: "C02_CHECKLIST", topic: "planned topic", angle: "planned angle", phase: "SCALE" } }],
  });
  assert.equal(calendar.startDate, "2026-10-01");
  assert.equal(calendar.accounts[0]?.entries[0]?.content_type, "C02_CHECKLIST");
  assert.equal(calendar.accounts[0]?.entries[0]?.phase, "SCALE");
});
