import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadRuntimeVoiceReferences, personaVoiceBrief } from "../src/runtime/config.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

let fake: FakePostgrest;
beforeEach(() => { fake = new FakePostgrest().install(); });
afterEach(() => fake.restore());

const nora = {
  persona_id: "P04", name: "Nora", age: "22", voice_markers: "cozy, reflective, slightly teasing",
  slang_level: "7", punctuation_profile: "lowercase; ... occasional", avoid_voice: "productivity coaching",
};

describe("Sheet voice references", () => {
  it("turns the persona voice columns into one brief", () => {
    const brief = personaVoiceBrief(nora, "Nora");
    assert.match(brief, /^Nora, 22: cozy, reflective, slightly teasing/);
    assert.match(brief, /slang level 7\/10/);
    assert.match(brief, /never sounds like: productivity coaching/);
    assert.equal(personaVoiceBrief(undefined, "Nora"), "Nora");
  });

  it("loads only this format's style hooks and compatible creator-voice examples", async () => {
    fake.seed("editorial_records", [
      { kind: "persona_voice", key: "P04", active: true, data: nora },
      { kind: "hook_references", key: "REF_07_01", active: true, data: { runtime_use: "STYLE_REFERENCE", active: "TRUE", compatible_formats: "F07_RANKING", formula: "my brutally biased breakfast tier list..." } },
      { kind: "hook_references", key: "REF_05_01", active: true, data: { runtime_use: "STYLE_REFERENCE", active: "TRUE", compatible_formats: "F05_INTERACTIVE_CHECKLIST", formula: "my lazy girl reset checklist ♡" } },
      { kind: "hook_references", key: "HOOK_0001", active: true, data: { runtime_use: "CONCEPT_ONLY", compatible_formats: "F07_RANKING", formula: "My realistic {routine}" } },
    ]);
    fake.seed("editorial_golden_examples", [
      { example_id: "GOLD_001", concept_id: "C04_THINGS_I_STARTED", approval_status: "human_review", active: true, hook: "5 things i started doing", content: { compatible_format_ids: "F01_LIFESTYLE_GUIDE | F07_RANKING", slide_2: "a / b", tone_notes: "first-person" } },
      { example_id: "GOLD_002", concept_id: "C03_THINGS_I_STOPPED", approval_status: "rejected", active: true, hook: "rejected", content: { compatible_format_ids: "F07_RANKING" } },
      { example_id: "GOLD_V2_013", concept_id: "F07_RANKING", approval_status: "assistant_curated", active: true, hook: "structure only", content: { compatible_format_ids: "F07_RANKING" } },
    ]);

    const voice = await loadRuntimeVoiceReferences({ formatId: "F07_RANKING", personaId: "P04", personaName: "Nora", random: () => 0 });

    assert.match(voice.personaVoice, /slightly teasing/);
    assert.deepEqual(voice.hookReferences, ["my brutally biased breakfast tier list..."]);
    assert.deepEqual(voice.voiceExamples.map((example) => example.id), ["GOLD_001"]);
    assert.deepEqual(voice.voiceExamples[0]!.slides, ["a / b"]);
  });
});

describe("reference copy guard", async () => {
  const { copiedReferencePhrase } = await import("../app/lib/ai/carousel-generator.js");
  const spec = (hook: string, bodies: string[]) => ({
    title: "t", topic: "t", angle: "a", hook, caption: "c",
    slides: bodies.map((body, index) => ({ position: index + 1, role: index ? "STEP" : "HOOK", layout: "grid-2x2", headline: `h${index}`, body, visualIntent: "v", assetType: "stock", assetQuery: "q" })),
  }) as never;

  it("flags a hook lifted from a reference", () => {
    assert.equal(
      copiedReferencePhrase(spec("my lazy girl reset checklist for sunday", ["x"]), ["my lazy girl reset checklist ♡"]),
      "my lazy girl reset checklist",
    );
  });

  it("flags copy that repeats two long reference runs, not ordinary short phrases", () => {
    const reference = "before — save another routine every time something looked off and then buy the missing product before finishing the ones i already liked";
    assert.ok(copiedReferencePhrase(spec("new hook", [reference]), [reference]));
    assert.equal(copiedReferencePhrase(spec("new hook", ["close the laptop and write tomorrow's first task"]), ["10:20 - 10:25 · close the laptop and write tomorrow's first task"]), null);
  });
});
