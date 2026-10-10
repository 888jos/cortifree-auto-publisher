import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasDashPunctuation, stripDashPunctuation } from "../app/lib/ai/dashes.js";

describe("dash punctuation", () => {
  it("detects dashes used as punctuation but not hyphenated words or time ranges", () => {
    assert.equal(hasDashPunctuation("pick the next thing — decide what helps"), true);
    assert.equal(hasDashPunctuation("pick the next thing - decide what helps"), true);
    assert.equal(hasDashPunctuation("pick the next thing – decide"), true);
    assert.equal(hasDashPunctuation("my low-effort 10-minute reset"), false);
    assert.equal(hasDashPunctuation("10:15 - 10:20 · put work things away"), false);
  });

  it("rewrites them the way a person would type", () => {
    assert.equal(stripDashPunctuation("before — save every routine i see"), "before: save every routine i see");
    assert.equal(stripDashPunctuation("i open the curtains first — otherwise it spirals"), "i open the curtains first, otherwise it spirals");
    assert.equal(stripDashPunctuation("10:15 - 10:20 · put work things away"), "10:15 - 10:20 · put work things away");
    assert.equal(stripDashPunctuation("my low-effort reset - honestly works"), "my low-effort reset, honestly works");
  });
});

describe("dash bullets", () => {
  it("keeps one item per line when a list uses dash bullets", () => {
    assert.equal(stripDashPunctuation("- wash my face\n- drink water\n- phone away"), "wash my face\ndrink water\nphone away");
    assert.equal(hasDashPunctuation("- wash my face\n- drink water"), false);
    assert.equal(hasDashPunctuation("wash my face — then sleep"), true);
  });
});
