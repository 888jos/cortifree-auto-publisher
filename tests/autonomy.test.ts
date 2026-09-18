import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AUTONOMY_POLICY,
  assertNetworkNovelty,
  chooseExplorationBucket,
  noveltyPenalty,
  personaRefillCount,
  shouldRefillPersonaCache,
} from "../app/lib/autonomy-policy.js";

test("persona cache refills only below the minimum", () => {
  assert.equal(shouldRefillPersonaCache(11), true);
  assert.equal(shouldRefillPersonaCache(12), false);
  assert.equal(personaRefillCount(7), 13);
  assert.equal(personaRefillCount(12), 0);
});

test("exploration policy is 70/20/10", () => {
  assert.equal(chooseExplorationBucket(0.0), "proven");
  assert.equal(chooseExplorationBucket(0.699), "proven");
  assert.equal(chooseExplorationBucket(0.70), "adjacent");
  assert.equal(chooseExplorationBucket(0.899), "adjacent");
  assert.equal(chooseExplorationBucket(0.90), "experiment");
  assert.throws(() => chooseExplorationBucket(1), /\[0, 1\)/);
});

test("novelty penalty strongly penalizes recent reuse", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  const recent = noveltyPenalty("2026-09-17T12:00:00Z", 2, 21, now);
  const old = noveltyPenalty("2026-08-01T12:00:00Z", 2, 21, now);
  assert.ok(recent > old + 30);
});

test("network cooldown catches topic hook and visual reuse", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  const result = assertNetworkNovelty({
    topicUsedAt: "2026-09-18T00:00:00Z",
    hookUsedAt: "2026-09-17T00:00:00Z",
    visualRefUsedAt: "2026-09-16T00:00:00Z",
    now,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, [
    "topic_network_cooldown",
    "hook_network_cooldown",
    "visual_ref_network_cooldown",
  ]);
  assert.equal(DEFAULT_AUTONOMY_POLICY.personaCacheTarget, 20);
});
