import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixHashtags, nativeCase, nativeStyleIssues, titleHookReason } from "../app/lib/ai/native-style.js";

const slide = (position: number, layout: string, body: string, headline = "h") =>
  ({ position, role: position === 1 ? "HOOK" : "STEP", layout, headline, body, visualIntent: "v", assetType: "stock", assetQuery: "q" });
const spec = (slides: ReturnType<typeof slide>[], hook = "hook", caption = "caption") =>
  ({ title: "t", topic: "t", angle: "a", hook, caption, slides }) as never;

describe("native TikTok case", () => {
  it("lowercases copy and drops final periods but keeps labels, tiers and brands", () => {
    assert.equal(nativeCase("Pause the cart before adding one more thing."), "pause the cart before adding one more thing");
    assert.equal(nativeCase("HOW TO | Write the next action. | Keep it short."), "HOW TO | write the next action | keep it short");
    assert.equal(nativeCase("S · Leave the shoes by the door"), "S · leave the shoes by the door");
    assert.equal(nativeCase("ss · charge it away from the bed"), "SS · charge it away from the bed");
    assert.equal(nativeCase("I'm using CortiFree rn..."), "i'm using CortiFree rn...");
    assert.equal(nativeCase("the room feels less like a cave, which is honestly helpful"), "the room feels less like a cave, which is helpful");
  });
});

describe("native style issues", () => {
  it("flags long prose slides and AI contrast constructions", () => {
    const long = "walking to the cafe, mailbox, or store wins because it isn't asking me to create a whole new plan and if i'm already putting on shoes half the battle is gone";
    const issues = nativeStyleIssues(spec([slide(1, "ranking", ""), slide(2, "ranking", long), slide(3, "ranking", long)], "not the whole day, just the first thing", "progress, not evidence"));
    assert.ok(issues.some((issue) => issue.startsWith("TOO_LONG")));
    assert.ok(issues.some((issue) => issue.startsWith("AI_CONTRAST")));
  });

  it("flags the same so-i sentence shape on most slides", () => {
    const so = (text: string) => `i do ${text}, so i feel calmer`;
    const issues = nativeStyleIssues(spec([slide(1, "lifestyle-3stack", ""), ...[2, 3, 4, 5].map((n) => slide(n, "lifestyle-3stack", so(`thing ${n}`)))]));
    assert.ok(issues.some((issue) => issue.startsWith("REPETITIVE_SHAPE")));
  });

  it("accepts short native lines", () => {
    assert.deepEqual(nativeStyleIssues(spec([slide(1, "ranking", ""), slide(2, "ranking", "shoes by the door = half the battle lol"), slide(3, "ranking", "5 min on the front step counts")])), []);
  });
});

describe("caption hashtags", () => {
  it("joins a hashtag split by a space, leaving the sentence alone", () => {
    assert.equal(fixHashtags("what would you keep? #selfcare #clean girl #simpleroutines"), "what would you keep? #selfcare #cleangirl #simpleroutines");
    assert.equal(fixHashtags("save this #wellnesstok"), "save this #wellnesstok");
  });
});

describe('titleHookReason', () => {
  it('flags blog-title hooks the operator rejected', () => {
    for (const hook of [
      'my simple reset when everything feels like too much',
      'my calm morning routine for busy days',
      'a gentle evening guide for anxious girls',
      'the easy habits to feel less stressed',
      'what i do when everything feels like a lot',
    ]) assert.ok(titleHookReason(hook), hook);
  });
  it('lets native TikTok hooks through', () => {
    for (const hook of [
      'the 5 min thing i do when my brain is fried',
      'pov: you finally stopped doomscrolling at 1am',
      'this is your sign to put your phone in another room',
      'my lazy girl morning routine rn',
      'things i stopped doing to feel less anxious',
      'ranking “healthy girl” habits from actually worth it to absolutely not',
    ]) assert.equal(titleHookReason(hook), undefined, hook);
  });
});
