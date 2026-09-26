import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceDecision, acceptanceSnapshotFromSystemLog } from "../src/autonomy/acceptance";

test("acceptance gate requires at least 20 reviewed and 15 usable", () => {
  assert.deepEqual(acceptanceDecision(20, 15), { reviewed: 20, usable: 15, passed: true });
  assert.equal(acceptanceDecision(19, 19).passed, false);
  assert.equal(acceptanceDecision(20, 14).passed, false);
  assert.equal(acceptanceDecision(25, 18).passed, true);
});

test("acceptance gate normalizes impossible values", () => {
  assert.deepEqual(acceptanceDecision(-3, 9), { reviewed: 0, usable: 0, passed: false });
  assert.deepEqual(acceptanceDecision(20.9, 99), { reviewed: 20, usable: 20, passed: true });
});


test("acceptance gate reads the canonical system_logs metadata shape", () => {
  assert.deepEqual(acceptanceSnapshotFromSystemLog({
    created_at: "2026-09-26T15:00:00.000Z",
    stage: "ACCEPTANCE_GATE",
    status: "SUCCESS",
    metadata: {
      reviewed: 20,
      usable: 16,
      passed: true,
      batch_id: "E2E_TEST",
      notes: "manual review",
    },
  }), {
    passed: true,
    reviewed: 20,
    usable: 16,
    batchId: "E2E_TEST",
    createdAt: "2026-09-26T15:00:00.000Z",
    notes: "manual review",
  });
});

test("acceptance gate tolerates missing metadata without inventing a pass", () => {
  assert.deepEqual(acceptanceSnapshotFromSystemLog({ created_at: "2026-09-26T15:00:00.000Z" }), {
    passed: false,
    reviewed: 0,
    usable: 0,
    batchId: null,
    createdAt: "2026-09-26T15:00:00.000Z",
    notes: null,
  });
});
