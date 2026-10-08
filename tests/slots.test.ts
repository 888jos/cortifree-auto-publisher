import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Account } from "../src/domain.js";
import { ensureRollingSlots, syncContentSlotsFromCalendar, zonedToUtc } from "../src/autonomy/slots.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

const TZ = "America/New_York";
let fake: FakePostgrest;

function calendar(key: string, data: Record<string, unknown>) {
  return { key, kind: "content_calendar", active: true, data: { account_id: "CF_EN_01", timezone: TZ, ...data } };
}
function slotAt(date: string, time: string) {
  return zonedToUtc(date, time, TZ).toISOString();
}

beforeEach(() => {
  // Mirrors content_slots_pkey and content_slots_account_time_idx.
  fake = new FakePostgrest().unique("content_slots", ["id"], ["account_id", "scheduled_for"]).install();
});
afterEach(() => fake.restore());

describe("syncContentSlotsFromCalendar", () => {
  it("defaults a blank timezone and skips an invalid one instead of failing the sync", async () => {
    fake.seed("editorial_records", [
      calendar("CAL_BLANK_TZ", { date: "2099-04-01", local_time: "20:00", timezone: "" }),
      calendar("CAL_BAD_TZ", { date: "2099-04-02", local_time: "20:00", timezone: "Mars/Olympus" }),
    ]);

    const result = await syncContentSlotsFromCalendar();

    assert.equal(result.synced, 1);
    const [slot] = fake.table("content_slots");
    assert.equal(slot.id, "CAL_BLANK_TZ");
    assert.equal(slot.scheduled_for, slotAt("2099-04-01", "20:00"));
  });

  it("keeps claims on existing slots and skips account/time collisions", async () => {
    fake.seed("content_slots", [
      { id: "CAL_CLAIMED", account_id: "CF_EN_01", scheduled_for: slotAt("2099-03-01", "20:00"), status: "QUEUED", idea_id: "IDEA_1", carousel_id: "CF_CAROUSEL_1" },
      { id: "AUTO_SLOT_CF_EN_01_20990302_1", account_id: "CF_EN_01", scheduled_for: slotAt("2099-03-02", "20:00"), status: "OPEN", idea_id: "IDEA_AUTO", carousel_id: null },
    ]);
    fake.seed("editorial_records", [
      calendar("CAL_CLAIMED", { date: "2099-03-01", local_time: "20:00", topic: "updated topic" }),
      calendar("CAL_COLLIDES_WITH_AUTO", { date: "2099-03-02", local_time: "20:00" }),
      calendar("CAL_NEW", { date: "2099-03-03", local_time: "20:00" }),
      calendar("CAL_SAME_TIME_AS_NEW", { date: "2099-03-03", local_time: "20:00" }),
      calendar("CAL_REST", { date: "2099-03-04", local_time: "20:00", content_mode: "REST" }),
    ]);

    const result = await syncContentSlotsFromCalendar();

    assert.deepEqual(result, { synced: 2, restDays: 1, skippedConflicts: 2 });
    const byId = new Map(fake.table("content_slots").map((row) => [row.id, row]));
    const claimed = byId.get("CAL_CLAIMED")!;
    assert.equal(claimed.status, "QUEUED");
    assert.equal(claimed.idea_id, "IDEA_1");
    assert.equal(claimed.carousel_id, "CF_CAROUSEL_1");
    assert.equal(claimed.topic, "updated topic", "calendar fields are still refreshed");
    assert.equal(byId.get("CAL_NEW")!.status, "OPEN");
    assert.equal(byId.has("CAL_COLLIDES_WITH_AUTO"), false);
    assert.equal(byId.has("CAL_SAME_TIME_AS_NEW"), false);
    assert.equal(byId.get("AUTO_SLOT_CF_EN_01_20990302_1")!.idea_id, "IDEA_AUTO");
  });

  it("marks new past slots EXPIRED and leaves the batch intact", async () => {
    fake.seed("editorial_records", [calendar("CAL_PAST", { date: "2020-01-01", local_time: "20:00" })]);
    const result = await syncContentSlotsFromCalendar();
    assert.equal(result.synced, 1);
    assert.equal(fake.table("content_slots")[0]!.status, "EXPIRED");
  });

  it("fails instead of reopening claimed slots when prior state cannot be read", async () => {
    fake.seed("content_slots", [{ id: "CAL_CLAIMED", account_id: "CF_EN_01", scheduled_for: slotAt("2099-03-01", "20:00"), status: "QUEUED", idea_id: "IDEA_1" }]);
    fake.seed("editorial_records", [calendar("CAL_CLAIMED", { date: "2099-03-01", local_time: "20:00" })]);
    fake.failWhen((request) => request.table === "content_slots" && request.method === "GET");
    await assert.rejects(syncContentSlotsFromCalendar());
    assert.equal(fake.table("content_slots")[0]!.idea_id, "IDEA_1");
    assert.equal(fake.requestsTo("content_slots", "POST").length, 0);
  });
});

describe("ensureRollingSlots", () => {
  const account: Account = {
    id: "CF_EN_01", name: "CortiFree EN", persona_id: "P01", language: "en", market: "US", timezone: TZ, platforms: ["tiktok"],
    upload_post_profile: "", daily_target: 1, posting_slots: ["20:00"], enabled: true, posting_enabled: true,
    secondary_pillar_ids: [], pillar_mix: {}, format_mix: {}, promo_ratio: 0.08, ready_buffer_days: 3, warmup_status: "ACTIVE",
  };
  const now = new Date("2099-03-01T12:00:00.000Z");

  it("never resets an existing AUTO_SLOT and skips taken account/times", async () => {
    // Day 1 already holds a claimed AUTO_SLOT at 20:00; day 2's 21:30 is held by a calendar slot.
    fake.seed("content_slots", [
      { id: "AUTO_SLOT_CF_EN_01_20990301_1", account_id: "CF_EN_01", slot_date: "2099-03-01", scheduled_for: slotAt("2099-03-01", "20:00"), status: "QUEUED", idea_id: "IDEA_1" },
      { id: "CAL_DAY2", account_id: "CF_EN_01", slot_date: "2099-03-02", scheduled_for: slotAt("2099-03-02", "21:30"), status: "OPEN" },
    ]);

    const result = await ensureRollingSlots([{ ...account, daily_target: 2, posting_slots: ["20:00", "21:30"] }], now);

    const ids = fake.table("content_slots").map((row) => String(row.id)).sort();
    assert.deepEqual(ids, [
      "AUTO_SLOT_CF_EN_01_20990301_1",
      "AUTO_SLOT_CF_EN_01_20990301_2",
      "AUTO_SLOT_CF_EN_01_20990303_1",
      "AUTO_SLOT_CF_EN_01_20990303_2",
      "CAL_DAY2",
    ]);
    assert.deepEqual(result, { created: 3 });
    const claimed = fake.table("content_slots").find((row) => row.id === "AUTO_SLOT_CF_EN_01_20990301_1")!;
    assert.equal(claimed.status, "QUEUED");
    assert.equal(claimed.idea_id, "IDEA_1");
  });

  it("inserts only: a slot created concurrently keeps its claim", async () => {
    // Another run created and claimed day 1's slot after this run read the table.
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        fake.seed("content_slots", [{ id: "AUTO_SLOT_CF_EN_01_20990301_1", account_id: "CF_EN_01", slot_date: "2099-03-01", scheduled_for: slotAt("2099-03-01", "20:00"), status: "QUEUED", idea_id: "IDEA_RACE" }]);
      }
      return original(input, init);
    }) as typeof fetch;
    try {
      await ensureRollingSlots([{ ...account, ready_buffer_days: 1 }], now);
    } finally {
      globalThis.fetch = original;
    }
    const [slot] = fake.table("content_slots");
    assert.equal(slot!.status, "QUEUED");
    assert.equal(slot!.idea_id, "IDEA_RACE");
  });

  it("expires OPEN slots whose time has passed", async () => {
    fake.seed("content_slots", [{ id: "OLD", account_id: "CF_EN_01", slot_date: "2099-02-01", scheduled_for: "2099-02-01T01:00:00.000Z", status: "OPEN" }]);
    await ensureRollingSlots([], now);
    assert.equal(fake.table("content_slots")[0]!.status, "EXPIRED");
  });
});
