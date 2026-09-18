import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceDecision } from "../src/autonomy/acceptance";

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
