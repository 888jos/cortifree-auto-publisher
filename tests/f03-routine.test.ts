import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseAssets, deriveVisualIntent, type SelectableAsset } from "../app/lib/asset-selector";
import { PASTEL_ACCENTS, typographyForCarousel } from "../app/lib/carousel-typography";
import { routineStepIssues } from "../app/lib/ai/native-style";
import { generationCategory, rankRepairReferences } from "../app/lib/render/assets";
import { routineCoverTitle, routineKicker } from "../app/lib/render/text/routine";
import { routineStepAction, stepActionFamilies, withoutNegatedMentions } from "../src/visual-references/step-actions";
import { visualReferenceSchema } from "../src/visual-references";

// Live F03 CF_AUTO_CF_E2E_IDEA_E2E_SIX_20261010F_02_P02_F03: a teeth-brushing
// photo on "walk around the block", a laptop photo on "eat at the table",
// two photos used twice, "THAT GIRL" on the cover and all-white text.

function persona(id: string, actions: string[], description: string, objects: string[] = []): SelectableAsset {
  return {
    id, filename: `${id}.jpg`, category: "home", subcategory: "home", orientation: "portrait", framing: "medium",
    activity: "", mood: "", colors: [], tags: [], public_url: `https://example.com/${id}.jpg`, use_count: 0, last_used_at: null,
    source_type: "persona_generated", persona_id: "P02", visual_description: description, visible_actions: actions,
    visible_objects: objects, setting: "home_interior", people_visibility: "single_person", composition: "person_activity_scene",
  };
}

const teeth = persona("teeth", ["taking_mirror_selfie", "holding_smartphone", "holding_toothbrush_in_mouth"], "A woman is reflected in a round mirror while holding a smartphone, with a white toothbrush in her mouth.", ["phone", "toothbrush"]);
const laptopBed = persona("laptop-bed", ["reclining", "looking_at_camera", "using_laptop_nearby"], "A woman in a blue sweatshirt reclines on a bed beside an open laptop; a dark bag is on the floor.", ["laptop", "phone"]);
const walking = persona("walking", ["walking", "holding_phone"], "A woman walks along a quiet sidewalk at golden hour, mid-stride.", ["sneakers"]);
const bowl = persona("bowl", ["holding_bowl", "smiling"], "A woman smiles while holding a large bowl of rice and vegetables near her chest.", ["bowl", "food"]);
const pen = persona("pen-mouth", ["sitting", "holding_laptop", "holding_pen_in_mouth"], "A person sits with a laptop across their lap and a blue pen held between their lips.", ["laptop", "pen"]);

const step = (position: number, headline: string, visual: string) => ({
  position, role: "STEP", headline, body: "", assetType: "persona", assetQuery: visual, visualIntent: visual,
});

describe("F03 step actions", () => {
  it("keeps only the step's main action", () => {
    assert.equal(routineStepAction("5:55 - 6:10 · walk around the block before making dinner"), "walk around the block");
    assert.equal(routineStepAction("6:35 - 6:40 · eat at the table before checking work again"), "eat at the table");
    assert.deepEqual(stepActionFamilies("5:55 - 6:10 · walk around the block before making dinner").map((family) => family.key), ["walking"]);
    assert.deepEqual(stepActionFamilies("6:35 - 6:40 · eat at the table before checking work again").map((family) => family.key), ["eating"]);
    assert.deepEqual(stepActionFamilies("6:20 - 6:35 · make a protein + fiber dinner").map((family) => family.key), ["cooking", "eating"]);
    assert.deepEqual(stepActionFamilies("5:47 - 5:55 · put the laptop and charger in my work bag").map((family) => family.key), ["packing"]);
  });

  it("drops objects the copy puts away", () => {
    const text = withoutNegatedMentions("woman eating dinner at a small table, laptop and work bag away, phone in bag");
    assert.doesNotMatch(text, /laptop|phone/);
    const intent = deriveVisualIntent(step(7, "6:35 - 6:40 · eat at the table before checking work again", "woman sitting at a small table with an easy dinner, laptop and work bag out of reach"));
    assert.ok(!intent.desired_objects.includes("laptop"));
    assert.ok(intent.desired_objects.includes("food"));
    assert.ok(!intent.desired_settings.includes("work_study"));
  });

  it("never shows a step a photo of another action", () => {
    const walk = step(4, "5:55 - 6:10 · walk around the block before making dinner", "woman walking outside on a quiet sidewalk");
    assert.throws(() => chooseAssets({ carouselType: "F03_ROUTINE_TIMELINE", personaId: "P02", assets: [teeth, laptopBed], slides: [walk] }), /LOW_CONFIDENCE_ASSET:slide_4:step_action_walking/);
    assert.equal(chooseAssets({ carouselType: "F03_ROUTINE_TIMELINE", personaId: "P02", assets: [teeth, laptopBed, walking], slides: [walk] })[0]!.asset.id, "walking");

    const eat = step(7, "6:35 - 6:40 · eat at the table before checking work again", "woman sitting at a small table with an easy dinner, laptop and work bag out of reach");
    assert.equal(chooseAssets({ carouselType: "F03_ROUTINE_TIMELINE", personaId: "P02", assets: [laptopBed, bowl], slides: [eat] })[0]!.asset.id, "bowl");

    // A pen held in the mouth is not writing.
    const write = step(2, "5:40 - 5:47 · write tomorrow's first task", "woman writing in a notebook");
    assert.throws(() => chooseAssets({ carouselType: "F03_ROUTINE_TIMELINE", personaId: "P02", assets: [pen, laptopBed], slides: [write] }), /step_action_writing/);
  });

  it("leaves the broad cover free", () => {
    const [cover] = chooseAssets({
      carouselType: "F03_ROUTINE_TIMELINE", personaId: "P02", assets: [laptopBed],
      slides: [{ position: 1, role: "HOOK", headline: "my evening routine after work", body: "5:40 - 6:40", assetType: "persona", assetQuery: "woman at home after work", visualIntent: "woman relaxing at home after work" }],
    });
    assert.equal(cover?.asset.id, "laptop-bed");
  });

  it("generates a missing step from its own action, not from 'after work'", () => {
    const slide = { position: 5, role: "STEP", layout: "routine-timeline", headline: "6:10 - 6:20 · change clothes and wash my face", body: "", assetType: "persona", assetQuery: "woman washing her face in a bathroom after work", visualIntent: "woman washing her face in a softly lit bathroom" };
    assert.equal(generationCategory(slide as never), "self_care");
    const reference = (id: string, pose: string, environment: string, tags: string[]) => visualReferenceSchema.parse({
      id, category: "lifestyle", pose, framing: "portrait", outfit: "casual", environment, lighting: "soft", mood: [], tags, good_for: [], status: "approved", enabled: true,
    });
    const library = reference("VR_LIB", "library study selfie with headphones and laptop", "library", ["laptop", "work", "study", "after_work"]);
    const walk = reference("VR_WALK", "walking, hiking, travel or outdoor movement", "outdoor_street_nature", ["walk", "outdoor"]);
    const desk = reference("VR_DESK", "seated at home desk with laptop and drink", "home_lifestyle", ["desk", "laptop", "work"]);
    const walkSlide = { position: 4, role: "STEP", layout: "routine-timeline", headline: "5:55 - 6:10 · walk around the block before making dinner", body: "", assetType: "persona", assetQuery: "woman walking after work", visualIntent: "woman walking on a sidewalk after work" };
    assert.equal(rankRepairReferences([library, desk, walk], walkSlide as never)[0]!.reference.id, "VR_WALK");
  });
});

describe("F03 copy and colours", () => {
  it("only says THAT GIRL when the hook does", () => {
    assert.equal(routineKicker({ headline: "my work-to-evening routine when i keep thinking about work", body: "5:40 - 6:40" }), "AFTER WORK");
    assert.equal(routineKicker({ headline: "night routine when my brain is still busy", body: "" }), "MY");
    assert.equal(routineKicker({ headline: "that girl night routine but realistic", body: "" }), "THAT GIRL");
    assert.equal(routineCoverTitle({ headline: "my work-to-evening routine when i keep thinking about work" }), "EVENING ROUTINE");
  });

  it("gives each carousel one pastel accent and varies it", () => {
    const accents = new Set(Array.from({ length: 24 }, (_, index) => typographyForCarousel(`CF_AUTO_${index}_F03`).accentColor));
    for (const accent of accents) assert.ok((PASTEL_ACCENTS as readonly string[]).includes(accent));
    assert.ok(accents.size >= 3);
    assert.equal(typographyForCarousel("CF_X").accentColor, typographyForCarousel("CF_X").accentColor);
  });

  it("flags the steps the operator rejected and keeps simple native ones", () => {
    const spec = (headlines: string[], hook = "my evening after work") => ({
      hook, caption: "", language: "en",
      slides: [{ position: 1, role: "HOOK", layout: "routine-timeline", headline: hook, body: "6:00 - 7:00" }, ...headlines.map((headline, index) => ({ position: index + 2, role: "STEP", layout: "routine-timeline", headline, body: "" }))],
    }) as never;
    const rejected = routineStepIssues(spec([
      "6:35 - 6:40 · eat at the table before checking work again",
      "6:20 - 6:35 · make an easy dinner with one pan",
      "5:40 - 5:47 · let my brain switch off",
    ], "that girl night routine"));
    assert.ok(rejected.some((issue) => issue.startsWith("ROUTINE_STEP_TWO_IDEAS")));
    assert.ok(rejected.some((issue) => issue.startsWith("ROUTINE_STEP_DETAIL")));
    assert.ok(rejected.some((issue) => issue.startsWith("ROUTINE_STEP_NOT_VISIBLE")));
    assert.ok(rejected.some((issue) => issue.startsWith("ROUTINE_THAT_GIRL")));
    assert.deepEqual(routineStepIssues(spec([
      "5:55 - 6:10 · walk around the block",
      "6:20 - 6:35 · make a protein + fiber dinner",
      "6:35 - 6:50 · eat dinner at the table",
      "9:30 - 9:45 · shower and skincare",
    ])), []);
  });
});

describe("F03 photo uniqueness", () => {
  it("reserves a step's locked photo so the cover cannot show it again", async () => {
    const origin = "http://f03.test";
    const realFetch = globalThis.fetch;
    process.env.SUPABASE_URL = origin;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "f03-stub-key";
    // "repair" fits the cover best, but it is locked to step 3 (a repair).
    const repair = persona("repair", ["reclining", "using_laptop"], "A woman reclines on a bed at home after work beside an open laptop.", ["laptop"]);
    const other = persona("other", ["sitting", "looking_at_camera"], "A woman sits on a sofa at home in the evening.", ["sofa"]);
    const assets = [repair, other, walking, bowl].map((asset) => ({ ...asset, metadata: {} }));
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const table = url.pathname.replace(/^\/rest\/v1\//, "");
      const body = table === "assets" ? assets : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      const { selectCarouselMatches } = await import("../app/lib/render/assets");
      const slides = [
        { position: 1, role: "HOOK", layout: "routine-timeline", headline: "my evening routine after work", body: "5:40 - 6:40", assetType: "persona", assetQuery: "woman at home after work with laptop", visualIntent: "woman relaxing on a bed at home after work with laptop" },
        step(2, "5:55 - 6:10 · walk around the block", "woman walking on a sidewalk"),
        step(3, "6:10 - 6:20 · close my laptop", "woman with her laptop on the bed"),
        step(4, "6:35 - 6:50 · eat dinner", "woman holding a bowl of dinner"),
      ].map((slide) => ({ ...slide, layout: "routine-timeline" }));
      const { gridMatches } = await selectCarouselMatches({
        id: "CF_F03_UNIQUE", carouselType: "F03_ROUTINE_TIMELINE", layout: "routine-timeline", personaId: "P02",
        slides, spec: { rendered_slides: [{ position: 3, assetIds: ["repair"] }] },
      } as never, {});
      const ids = gridMatches.map((matches) => String(matches[0]!.asset.id));
      assert.equal(ids[2], "repair");
      assert.equal(new Set(ids).size, ids.length, `a photo repeats: ${ids.join(", ")}`);
      assert.deepEqual(ids, ["other", "walking", "repair", "bowl"]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
