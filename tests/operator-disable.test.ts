import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operatorDisabled } from "../app/lib/sync/drive/sheet-metadata";

describe("operator disable", () => {
  it("only an explicit operator_disabled flag keeps a reference off across Sheet syncs", () => {
    assert.equal(operatorDisabled({ metadata: { operator_disabled: true, operator_disabled_reason: "cover rejected" } }), true);
    assert.equal(operatorDisabled({ metadata: { review_status: "OK" } }), false);
    assert.equal(operatorDisabled(undefined), false);
  });
});
