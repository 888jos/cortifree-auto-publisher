import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plainLanguageEdit } from "../app/lib/ai/plain-language.js";

const spec = {
  title: "t", topic: "t", angle: "a", hook: "my morning reset", caption: "save this #wellnesstok",
  slides: [
    { position: 1, role: "HOOK", layout: "ranking", headline: "my morning reset", body: "", visualIntent: "v", assetType: "stock", assetQuery: "q" },
    { position: 2, role: "TIP", layout: "ranking", headline: "S · three priorities max", body: "everything else waits until my brain is actually online", visualIntent: "v", assetType: "text_only", assetQuery: "q" },
  ],
} as never;
const usage = { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 };
const reply = (lines: string[]) => async () => ({ data: { lines }, usage });

describe("plain-language pass", () => {
  it("applies a rewrite that keeps the structure", async () => {
    const result = await plainLanguageEdit(spec, reply(["my morning reset", "save this #wellnesstok", "my morning reset", "", "S · three priorities max", "everything else waits until after my coffee"]), "m");
    assert.equal((result.spec as { slides: Array<{ body: string }> } | null)?.slides[1]!.body, "everything else waits until after my coffee");
  });

  it("keeps slide 1 in step when only the hook line is rewritten", async () => {
    const result = await plainLanguageEdit(spec, reply(["things i do before noon", "save this #wellnesstok", "my morning reset", "", "S · three priorities max", "everything else waits until my brain is actually online"]), "m");
    assert.equal((result.spec as { slides: Array<{ headline: string }> } | null)?.slides[0]!.headline, "things i do before noon");
  });

  it("rejects a rewrite that drops a tier prefix or changes the line count", async () => {
    assert.equal((await plainLanguageEdit(spec, reply(["my morning reset", "save this #wellnesstok", "my morning reset", "", "three priorities max", "x"]), "m")).spec, null);
    assert.equal((await plainLanguageEdit(spec, reply(["one line"]), "m")).spec, null);
  });
});
