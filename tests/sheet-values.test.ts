import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bool, decimal } from "../app/lib/sync/editorial.js";

describe("Sheet value parsing", () => {
  it("reads French decimal commas and falls back on empty cells", () => {
    assert.equal(decimal("0,3"), 0.3);
    assert.equal(decimal(" 1 250,5 "), 1250.5);
    assert.equal(decimal("", 1), 1);
    assert.equal(decimal(null, 7), 7);
    assert.equal(decimal("n/a", 0.08), 0.08);
    assert.equal(decimal(0, 1), 0);
  });

  it("reads French booleans", () => {
    assert.equal(bool("VRAI"), true);
    assert.equal(bool("oui"), true);
    assert.equal(bool("FAUX", true), false);
    assert.equal(bool("non", true), false);
    assert.equal(bool("", true), true);
  });
});
