import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tidyChecklistBody } from "../app/lib/ai/carousel-generator";

describe("tidyChecklistBody", () => {
  it("drops an overlong aside before dropping the item", () => {
    const body = "charge it across the room | check one thing | leave the app when done | keep the charger in the same spot | pick up the book instead of the phone at night (it is honestly so much less tempting)";
    assert.equal(tidyChecklistBody(body).split(" | ").at(-1), "pick up the book instead of the phone at night");
  });
  it("drops overlong items only while four remain, and keeps six at most", () => {
    const long = "x".repeat(90);
    assert.equal(tidyChecklistBody(`a | b | c | d | ${long}`), "a | b | c | d");
    assert.equal(tidyChecklistBody(`a | b | c | ${long}`).split(" | ").length, 4);
    assert.equal(tidyChecklistBody("a | b | c | d | e | f | g"), "a | b | c | d | e | f");
  });
});
