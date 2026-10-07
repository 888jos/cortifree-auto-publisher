import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { recoverStaleGeneratingIdeas, resumeRetryableFailedIdeas, retryPendingRenders } from "../src/autonomy/processor.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

let fake: FakePostgrest;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const future = new Date(Date.now() + 2 * 86_400_000).toISOString();

beforeEach(() => { fake = new FakePostgrest().install(); });
afterEach(() => fake.restore());

describe("stale GENERATING recovery", () => {
  it("fails stale ideas as interrupted, then requeues them with their slot", async () => {
    fake.seed("content_slots", [
      { id: "SLOT_STALE", status: "QUEUED", scheduled_for: future },
      { id: "SLOT_FRESH", status: "QUEUED", scheduled_for: future },
    ]);
    fake.seed("carousel_ideas", [
      { id: "IDEA_STALE", status: "GENERATING", started_at: minutesAgo(90), slot_id: "SLOT_STALE", generation_attempts: 1, acceptance_batch_id: null, carousel_id: null },
      { id: "IDEA_FRESH", status: "GENERATING", started_at: minutesAgo(5), slot_id: "SLOT_FRESH", generation_attempts: 1, acceptance_batch_id: null, carousel_id: null },
    ]);
    const idea = (id: string) => fake.table("carousel_ideas").find((row) => row.id === id)!;
    const slot = (id: string) => fake.table("content_slots").find((row) => row.id === id)!;

    const recovered = await recoverStaleGeneratingIdeas(30);

    assert.deepEqual(recovered.map((entry) => entry.id), ["IDEA_STALE"]);
    assert.equal(idea("IDEA_STALE").status, "FAILED");
    assert.equal(idea("IDEA_STALE").last_error, "GENERATION_INTERRUPTED");
    assert.equal(slot("SLOT_STALE").status, "FAILED");
    assert.equal(idea("IDEA_FRESH").status, "GENERATING");
    assert.equal(slot("SLOT_FRESH").status, "QUEUED");

    const resumed = await resumeRetryableFailedIdeas();

    assert.deepEqual(resumed.map((entry) => [entry.id, entry.status]), [["IDEA_STALE", "QUEUED"]]);
    assert.equal(idea("IDEA_STALE").status, "QUEUED");
    assert.equal(idea("IDEA_STALE").last_error, null);
    assert.equal(idea("IDEA_STALE").started_at, null);
    assert.equal(slot("SLOT_STALE").status, "QUEUED");
  });

  it("does not overwrite an idea that finished between the read and the update", async () => {
    fake.seed("carousel_ideas", [{ id: "IDEA_RACE", status: "GENERATING", started_at: minutesAgo(90), slot_id: null }]);
    // The idea completes right after the stale read, before the guarded PATCH lands.
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "PATCH") fake.table("carousel_ideas")[0]!.status = "GENERATED";
      return original(input, init);
    }) as typeof fetch;
    try {
      await recoverStaleGeneratingIdeas(30);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(fake.table("carousel_ideas")[0]!.status, "GENERATED");
  });

  it("expires a retryable idea whose slot time already passed", async () => {
    fake.seed("content_slots", [{ id: "SLOT_PAST", status: "FAILED", scheduled_for: minutesAgo(10) }]);
    fake.seed("carousel_ideas", [{ id: "IDEA_LATE", status: "FAILED", last_error: "GENERATION_INTERRUPTED", slot_id: "SLOT_PAST", generation_attempts: 1, acceptance_batch_id: null, carousel_id: null }]);
    const report = await resumeRetryableFailedIdeas();
    assert.equal(report[0]!.status, "EXPIRED_SLOT");
    assert.equal(fake.table("carousel_ideas")[0]!.status, "EXPIRED_SLOT");
    assert.equal(fake.table("content_slots")[0]!.status, "MISSED");
  });
});

describe("retryPendingRenders", () => {
  it("stops retrying a draft once its render failures reach the limit", async () => {
    fake.seed("carousels", [{ id: "CF_BROKEN", status: "DRAFT", lifecycle_state: "NEEDS_FIX", spec: { generated_slides: [{ position: 1 }] }, updated_at: minutesAgo(60) }]);
    fake.seed("content_generation_qa", [1, 2, 3].map(() => ({ carousel_id: "CF_BROKEN", qa_type: "RENDER", status: "FAIL" })));

    const report = await retryPendingRenders();

    assert.deepEqual(report, [{ id: "CF_BROKEN", status: "DRAFT", action: "RENDER_RETRIES_EXHAUSTED" }]);
    assert.equal(fake.requestsTo("carousels", "PATCH").length, 0);
    assert.equal(fake.table("carousels")[0]!.lifecycle_state, "NEEDS_FIX");
  });

  it("only picks DRAFT carousels from the CortiFree workspace", async () => {
    fake.seed("carousels", [
      { id: "CF_OTHER_WS", workspace_id: "other", status: "DRAFT", lifecycle_state: "NEEDS_FIX", spec: { generated_slides: [{ position: 1 }] } },
      { id: "CF_READY", status: "READY_FOR_REVIEW", lifecycle_state: "READY_FOR_REVIEW", spec: { generated_slides: [{ position: 1 }] } },
    ]);
    assert.deepEqual(await retryPendingRenders(), []);
    assert.equal(fake.requestsTo("carousels", "PATCH").length, 0);
  });
});
