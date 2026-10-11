import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseAssets, isCollageAsset, type SelectableAsset } from "../app/lib/asset-selector";
import { observedAssetFields } from "../app/lib/image-generation";
import type { StockAssetVision } from "../app/lib/ai/stock-asset-analyzer";
import { faceFitsFrame, focusCrop, orderLifestyleBands, subjectBox, textFriendliness } from "../app/lib/render/framing";
import { isAutomaticVisualReference, isCollageDescription } from "../src/visual-references";

const BAND = { width: 1080, height: 450 };
const face = (top: number, bottom: number, left = 0.3, right = 0.6) => ({ subject_box: { kind: "face", left, top, right, bottom } });

function asset(id: string, overrides: Partial<SelectableAsset> = {}): SelectableAsset {
  return {
    id, filename: `${id}.jpg`, category: "work_study", subcategory: "desk", orientation: "portrait", framing: "medium",
    activity: "writing", mood: "calm", colors: [], tags: ["notebook"], public_url: `https://example.com/${id}.jpg`,
    use_count: 0, last_used_at: null, source_type: "persona_generated", persona_id: "P01",
    visual_description: "woman writing one task in a paper notebook at a calm desk", visible_objects: ["notebook", "pen"],
    visible_actions: ["writing"], setting: "home_desk", people_visibility: "full_person", composition: "subject_left_of_center",
    specific_details: "", width: 1728, height: 2160, metadata: {},
    ...overrides,
  };
}

describe("F01 band framing", () => {
  it("reads a stored face box and ignores missing or empty ones", () => {
    assert.deepEqual(subjectBox(face(0.23, 0.46)), { kind: "face", left: 0.3, top: 0.23, right: 0.6, bottom: 0.46 });
    assert.equal(subjectBox({}), null);
    assert.equal(subjectBox({ subject_box: null }), null);
    assert.equal(subjectBox({ subject_box: { kind: "none", left: 0, top: 0, right: 1, bottom: 1 } }), null);
  });

  it("frames the band on the face instead of the centre (live #2116 lost its forehead)", () => {
    // 864x1152 photo, face from 23% to 46% of the height: a centre crop shows 34%-66%.
    const crop = focusCrop({ width: 864, height: 1152 }, BAND, subjectBox(face(0.23, 0.46))!);
    const scaled = Math.ceil(1152 * (1080 / 864));
    const top = Math.round((scaled - 450) * crop.cropY / 100);
    assert.ok(top <= 0.23 * scaled, `band starts at ${top}, below the forehead`);
    assert.ok(top + 450 >= 0.46 * scaled, "chin stays in the band");
    assert.deepEqual(focusCrop({ width: 864, height: 1152 }, BAND, null), { cropX: 50, cropY: 50 });
  });

  it("refuses a close-up face that cannot fit whole in a 1080x450 band", () => {
    // A 4:5 photo shows a third of its height in a band.
    assert.equal(faceFitsFrame(asset("small", { metadata: face(0.2, 0.45) }), BAND), true);
    assert.equal(faceFitsFrame(asset("close-up", { metadata: face(0, 0.55) }), BAND), false);
    assert.equal(faceFitsFrame(asset("unknown"), BAND), true);
  });

  it("does not pick a close-up face for a band when a fitting photo exists, and never dead-ends", () => {
    const slide = { position: 3, role: "TIP", headline: "pick one next task", body: "i write one task on paper", assetQuery: "woman writing one task in a paper notebook", visualIntent: "woman writing one task in a paper notebook at a calm desk", assetType: "persona" };
    const closeUp = asset("close-up", { metadata: face(0, 0.6) });
    const fits = asset("fits", { metadata: face(0.3, 0.5), use_count: 9 });
    const [picked] = chooseAssets({ carouselType: "F01_LIFESTYLE_GUIDE", personaId: "P01", assets: [closeUp, fits], frame: BAND, slides: [slide] });
    assert.equal(picked?.asset.id, "fits");
    const [onlyOption] = chooseAssets({ carouselType: "F01_LIFESTYLE_GUIDE", personaId: "P01", assets: [closeUp], frame: BAND, slides: [slide] });
    assert.equal(onlyOption?.asset.id, "close-up");
  });

  it("puts the photo without a face under the text (middle band)", () => {
    const top = { asset: asset("face-top", { metadata: face(0.2, 0.4) }) };
    const middle = { asset: asset("face-middle", { metadata: face(0.3, 0.5) }) };
    const objects = { asset: asset("objects", { source_type: "stock", people_visibility: "no_person", persona_id: null }) };
    assert.deepEqual(orderLifestyleBands([top, middle, objects]).map((match) => match.asset.id), ["face-top", "objects", "face-middle"]);
    assert.deepEqual(orderLifestyleBands([top, objects, middle]).map((match) => match.asset.id), ["face-top", "objects", "face-middle"]);
    assert.ok(textFriendliness(objects.asset) > textFriendliness(middle.asset));
  });
});

// Real vision descriptions from the live library (October 2026).
const COLLAGES = [
  "Three vertical photographs are arranged side by side with white dividers: a woman in a black t-shirt and shorts walks on a sun-dappled paved path",
  "Three-panel vertical collage showing a woman in a white zip-front outfit seated beside a city street",
  "A minimalist cream-background layout contains two separate portrait photographs. The upper-right photo shows a dark-haired woman",
  "split_screen_collage | large_left_panel | stacked_right_panels | white_panel_borders | shallow_depth_of_field",
  "three_vertical_panels_separated_by_white_borders | left_panel_face_close_up | center_panel_profile_at_mirror",
];
const SINGLE_PHOTOS = [
  "A dark towel hangs over the top rail of a glass shower door covered with condensation | towel_upper_center_glass_panel_fills_frame",
  "woman_left_on_bench_empty_bench_and_wood_panels_fill_right",
  "centered_subject | top_down_view | wooden_door_background | symmetrical_door_panels",
  "subject_on_right | smartphone_in_foreground | marble_panel_centered_in_background | pink_red_panel_at_upper_left",
  "Two open laptops, handwritten pages with colored markings and a green pen are spread across the desk",
  "leg_lower_left_shadow_center_right_sidewalk_and_grass_split_frame",
];

describe("collages", () => {
  it("recognises multi-panel images without flagging ordinary panels, doors or two objects", () => {
    for (const text of COLLAGES) assert.equal(isCollageDescription(text), true, text);
    for (const text of SINGLE_PHOTOS) assert.equal(isCollageDescription(text), false, text);
  });

  it("never selects a collage asset", () => {
    const collage = asset("collage", { visual_description: COLLAGES[1], composition: "triptych_layout | white_panel_dividers" });
    const vision = asset("vision-collage", { metadata: { image_layout: "collage_or_multi_panel" } });
    assert.equal(isCollageAsset(collage), true);
    assert.equal(isCollageAsset(vision), true);
    const slide = { position: 2, role: "TIP", headline: "pick one next task", body: "", assetQuery: "woman writing in a paper notebook", visualIntent: "woman writing one task in a paper notebook at a calm desk", assetType: "persona" };
    const [picked] = chooseAssets({ carouselType: "F01_LIFESTYLE_GUIDE", personaId: "P01", assets: [collage, vision, asset("single", { use_count: 10 })], slides: [slide] });
    assert.equal(picked?.asset.id, "single");
  });

  it("refuses references disabled at runtime or flagged as collages, whatever the Sheet says", () => {
    const reference = { id: "VR181", enabled: true, source_platform: "manual" as const, metadata: { canonical_source: "08_VISUAL_REFS", qa_flag: "" } };
    assert.equal(isAutomaticVisualReference(reference), true);
    assert.equal(isAutomaticVisualReference({ ...reference, metadata: { ...reference.metadata, disabled_reason: "WRONG_LABEL: ironing, labelled packing suitcase" } }), false);
    assert.equal(isAutomaticVisualReference({ ...reference, metadata: { ...reference.metadata, image_layout: "collage_or_multi_panel" } }), false);
    assert.equal(isAutomaticVisualReference({ ...reference, metadata: { ...reference.metadata, qa_flag: "COLLAGE_AUTO_DISABLED" } }), false);
  });
});

describe("vision fields of generated images", () => {
  const seen = (overrides: Partial<StockAssetVision> = {}): StockAssetVision => ({
    asset_name: "WOMAN_WRITING_NOTEBOOK_DESK", visual_description: "A woman writes in a paper notebook at a wooden desk by a window.",
    visible_actions: ["writing"], visible_objects: ["notebook"], setting: "home_desk", people_visibility: "full_person", body_parts_visible: ["face"],
    framing: "medium", camera_angle: "eye_level", lighting: "daylight", composition: ["subject_left"], specific_details: [], dominant_colors: [],
    text_in_image: "none", mood: "calm", good_for: [], avoid_for: [], image_layout: "single_photo",
    subject_box: { kind: "face", left: 0.3, top: 0.2, right: 0.5, bottom: 0.4 },
    ...overrides,
  });

  it("merges the face box into the existing metadata and moves to observable_v3", () => {
    const fields = observedAssetFields(seen(), { generation_job_id: "job-1", visual_reference_id: "VR195" });
    assert.equal(fields.visual_tagging_schema, "observable_v3");
    assert.equal(fields.metadata.generation_job_id, "job-1");
    assert.equal(fields.metadata.visual_reference_id, "VR195");
    assert.deepEqual(fields.metadata.subject_box, { kind: "face", left: 0.3, top: 0.2, right: 0.5, bottom: 0.4 });
    assert.equal("enabled" in fields, false);
  });

  it("disables a collage with its reason instead of deleting it", () => {
    const fields = observedAssetFields(seen({ image_layout: "collage_or_multi_panel" }), { visual_reference_id: "VR029" });
    assert.equal(fields.enabled, false);
    assert.match(String(fields.metadata.disabled_reason), /^COLLAGE_MULTI_PANEL/);
    assert.equal(fields.metadata.visual_reference_id, "VR029");
    const described = observedAssetFields(seen({ visual_description: "A three-panel vertical collage shows a person reclining in bed while using a smartphone." }));
    assert.equal(described.enabled, false);
  });
});
