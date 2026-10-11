import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { chooseAssets, deriveVisualIntent, keyTermMatch, type AssetMatch, type SelectableAsset } from "../app/lib/asset-selector";
import { fillGridSlide, GRID_KEY_TERM_FLOOR, gridAssetSlideForSlot, gridVisualParts } from "../app/lib/render/assets";
import { calmestTextTop } from "../app/lib/render/text/grid";
import { outlineText, rasterText } from "../app/lib/render/text/shared";
import { nativeStyleIssues, titleHookReason } from "../app/lib/ai/native-style";
import { getSlideGeometry } from "../app/lib/layout-geometry.js";
import { PASTEL_ACCENTS, typographyForCarousel } from "../app/lib/carousel-typography";
import { CAROUSEL_GENERATOR_INSTRUCTIONS } from "../app/lib/ai/prompts";
import type { GeneratedSlide } from "../app/lib/render/types";

// F08 operator feedback (carousel CF_..._20261010F_06_P06_F08): label
// headlines, unreadable text on photos, white frames, unrelated and repeated
// photos.

const stock = (id: string, visual_description: string, visible_objects: string[], category = "self_care"): SelectableAsset => ({
  id, filename: `${id}.jpg`, category, subcategory: category, orientation: "portrait", framing: "medium", activity: "", mood: "",
  colors: [], tags: [], public_url: `https://example.com/${id}.jpg`, use_count: 0, last_used_at: null, source_type: "stock",
  visual_description, visible_objects, visible_actions: [], setting: "indoor_room", people_visibility: "no_person", body_parts_visible: [],
  composition: "detail_shot", camera_angle: "top_down", lighting: "natural", dominant_colors: [], text_in_image: "", specific_details: "",
  visual_tagging_schema: "observable_v2", visual_review_status: "IMAGE_INSPECTED_V2", visual_reviewed_at: "2026-10-01T00:00:00.000Z",
});

const slide: GeneratedSlide = {
  position: 5, role: "STEP", layout: "grid-2x2", assetType: "persona",
  headline: "my bag is packed by the door", body: "keys, wallet, lip balm go in the night before",
  visualIntent: "four photos: woman packing a tote bag; keys and wallet on a table; tote bag by the door; lip balm in a hand",
  assetQuery: "tote bag with keys and wallet",
};

describe("F08 copy rules", () => {
  it("drops the before/now label format and asks for four related photos", () => {
    assert.doesNotMatch(CAROUSEL_GENERATOR_INSTRUCTIONS, /F08 labels are written/);
    assert.doesNotMatch(CAROUSEL_GENERATOR_INSTRUCTIONS, /exactly two (?:unique|different) (?:images|photos) repeated diagonally/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /four photos: A; B; C; D/);
    assert.match(CAROUSEL_GENERATOR_INSTRUCTIONS, /NEVER as labels: no "before:"/);
  });

  it("flags label headlines and list-label hooks for a rewrite", () => {
    const issues = nativeStyleIssues({ hook: "x", caption: "", slides: [
      { position: 1, role: "HOOK", layout: "single-image", headline: "x", body: "" },
      { position: 2, role: "STEP", layout: "grid-2x2", headline: "before: decide everything in the morning", body: "i used to choose" },
      { position: 3, role: "STEP", layout: "grid-2x2", headline: "the switch: keep easy defaults together", body: "i keep it" },
      { position: 4, role: "STEP", layout: "grid-2x2", headline: "my outfit is ready on the chair", body: "picked it last night" },
    ] } as never);
    const label = issues.find((issue) => issue.startsWith("LABEL_HEADLINE"));
    assert.ok(label);
    assert.match(label, /before: decide/);
    assert.match(label, /the switch:/);
    assert.doesNotMatch(label, /outfit is ready/);
    assert.ok(titleHookReason("my normal-day getting-ready defaults"));
    assert.equal(titleHookReason("things i stopped deciding at 7am"), undefined);
  });
});

describe("F08 photo selection", () => {
  it("splits four photo scenes in order and keeps older two-scene intents", () => {
    assert.deepEqual(gridVisualParts(slide.visualIntent), ["woman packing a tote bag", "keys and wallet on a table", "tote bag by the door", "lip balm in a hand"]);
    assert.deepEqual(gridVisualParts("exactly two lifestyle photos repeated diagonally: woman placing essentials into tote; woman checking her outfit in a hallway mirror"),
      ["woman placing essentials into tote", "woman checking her outfit in a hallway mirror"]);
    // A missing scene reuses the slide's scenes in turn, never the headline.
    assert.equal(gridAssetSlideForSlot({ ...slide, visualIntent: "a; b", assetQuery: "" }, 2).visualIntent, "a");
    // Support photos are judged on their own scene, not the whole slide copy.
    assert.equal(gridAssetSlideForSlot(slide, 1).body, "");
  });

  it("no longer reads food in 'repeated' or cooking in 'pack the bag'", () => {
    const intent = deriveVisualIntent({ headline: "pack the bag before leaving", body: "then i do a quick check, it looks neat", assetQuery: "", visualIntent: "exactly two lifestyle photos repeated diagonally: woman placing essentials into tote" });
    assert.ok(!intent.desired_objects.includes("food"));
    assert.ok(!intent.desired_actions.includes("preparing_food"));
    assert.ok(deriveVisualIntent({ headline: "eat a real breakfast", body: "", assetQuery: "", visualIntent: "woman eating breakfast" }).desired_objects.includes("food"));
  });

  it("needs a shared concrete object, not just a place, an action or a food photo", () => {
    assert.ok(keyTermMatch("keys and wallet on a table", stock("k", "keys and a leather wallet on a wooden table", ["keys", "wallet"])).coverage >= GRID_KEY_TERM_FLOOR);
    assert.equal(keyTermMatch("keys by the door", stock("t", "a towel hanging on a shower door", ["towel", "door"])).coverage, 0);
    assert.equal(keyTermMatch("tote bag hanging by the door", stock("h", "a towel hangs over a rail", ["towel"])).coverage, 0);
    const pan = stock("pan", "mixed vegetables cooking in a frying pan with a jar of sauce", ["vegetables", "pan", "jar"], "food");
    assert.throws(() => chooseAssets({ assets: [pan], carouselType: "F08_2X2", acceptBest: true, keyTermFloor: GRID_KEY_TERM_FLOOR,
      slides: [{ position: 3, role: "SUPPORT", headline: "", body: "", assetQuery: "moisturizer jar on a counter", visualIntent: "moisturizer jar on a counter", assetType: "stock" }] }));
  });

  it("fills four distinct related photos and never reuses one from another slide", () => {
    const assets = [
      stock("tote", "canvas tote bag packed on a chair", ["tote", "bag"]),
      stock("keys", "keys and a wallet on a table", ["keys", "wallet"]),
      stock("tote-door", "tote bag on a hook by the door", ["tote", "bag", "hook"]),
      stock("balm", "lip balm held in a hand", ["lip balm"]),
      stock("veg", "vegetables in a frying pan", ["vegetables", "pan"], "food"),
    ];
    const primary = { asset: stock("p", "woman holding a tote bag", ["tote"]), score: 50, matchedTerms: [], fallbackPath: "primary" } as AssetMatch;
    const choose = (supportSlide: GeneratedSlide, excluded: Set<string>, keyTermFloor: number) => chooseAssets({
      assets, carouselType: "F08_2X2", excludedAssetIds: excluded, facelessStockOnly: true, acceptBest: true, keyTermFloor, slides: [supportSlide],
    })[0]!;
    const used = new Set<string>(["balm"]); // shown on another slide
    const filled = fillGridSlide({ slide, primary, locked: [], used, choose });
    const ids = filled.map((match) => String(match.asset.id));
    assert.deepEqual(ids, ["p", "keys", "tote-door", "tote"]);
    assert.equal(new Set(ids).size, 4);
    assert.ok(!ids.includes("veg"));
    assert.ok(!ids.includes("balm"));
  });

  it("falls back to the slide's own diagonal pair rather than an unrelated photo", () => {
    const assets = [stock("keys", "keys and a wallet on a table", ["keys", "wallet"]), stock("veg", "vegetables in a frying pan", ["vegetables"], "food")];
    const primary = { asset: stock("p", "woman holding a tote bag", ["tote"]), score: 50, matchedTerms: [], fallbackPath: "primary" } as AssetMatch;
    const choose = (supportSlide: GeneratedSlide, excluded: Set<string>, keyTermFloor: number) => chooseAssets({
      assets, carouselType: "F08_2X2", excludedAssetIds: excluded, facelessStockOnly: true, acceptBest: true, keyTermFloor, slides: [supportSlide],
    })[0]!;
    const ids = fillGridSlide({ slide, primary, locked: [], used: new Set(), choose }).map((match) => String(match.asset.id));
    assert.deepEqual(ids, ["p", "keys", "keys", "p"]);
  });

  it("drops locked photos already shown on another slide", () => {
    const primary = { asset: stock("p", "woman", []), score: 999, matchedTerms: [], fallbackPath: "locked_existing_asset" } as AssetMatch;
    const other = { asset: stock("o", "tumbler in bed", []), score: 999, matchedTerms: [], fallbackPath: "locked_existing_asset" } as AssetMatch;
    const choose = () => { throw new Error("none"); };
    const ids = fillGridSlide({ slide, primary, locked: [primary, other, other, primary], used: new Set(["o"]), choose }).map((match) => String(match.asset.id));
    assert.deepEqual(ids, ["p"]);
  });
});

describe("F08 render", () => {
  it("lays body text out white + one pastel accent with a black outline", () => {
    const typography = typographyForCarousel("CF_AUTO_TEST_F08");
    assert.ok((PASTEL_ACCENTS as readonly string[]).includes(typography.accentColor));
    const geometry = getSlideGeometry({ layout: "grid-2x2" }, false, false, typography) as { text: Record<string, unknown> };
    assert.equal(geometry.text.headlineColor, "#ffffff");
    assert.equal(geometry.text.bodyColor, typography.accentColor);
    assert.ok(Number(geometry.text.textStroke) >= 4);
  });

  it("outlines text: the black outline is wider than the glyphs", async () => {
    const text = await rasterText("wear one outfit", { width: 500, height: 80, size: 48, weight: 700, color: "#ffffff", align: "left", spacing: 2, maxLines: 1 });
    const outlined = await outlineText(text, 6);
    const count = async (buffer: Buffer) => { const data = await sharp(buffer).extractChannel(3).raw().toBuffer(); return data.filter((value) => value > 128).length; };
    assert.ok(await count(outlined) > (await count(text)) * 1.5);
    const meta = await sharp(outlined).metadata();
    const base = await sharp(text).metadata();
    assert.equal(meta.width, (base.width ?? 0) + 12);
    // The outline is black, the glyphs stay white.
    const { data, info } = await sharp(outlined).raw().toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let index = 0; index < data.length; index += info.channels) if (data[index + 3]! > 200 && data[index]! < 40) dark += 1;
    assert.ok(dark > 100);
  });

  it("puts the text on the calmest band, never across the seam between photo rows", async () => {
    // Busy stripes everywhere except a calm band in the bottom row.
    const stripes = Array.from({ length: 1350 / 10 }, (_, row) => `<rect x="0" y="${row * 10}" width="1080" height="5" fill="#000"/>`).join("");
    const svg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1350" fill="#fff"/>${stripes}<rect x="0" y="900" width="1080" height="260" fill="#ccc"/></svg>`;
    const photo = await sharp(Buffer.from(svg)).png().toBuffer();
    const tiles = [0, 1, 2, 3].map((index) => ({ left: (index % 2) * 540, top: Math.floor(index / 2) * 675, width: 540, height: 675, hasPerson: false }));
    const top = await calmestTextTop(photo, tiles, 72, 936, 200);
    assert.ok(top >= 900 && top + 200 <= 1160, `top ${top}`);
    // A uniform photo: anywhere is calm, but never over the seam at y=675.
    const flat = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#888" } }).png().toBuffer();
    const flatTop = await calmestTextTop(flat, tiles, 72, 936, 200);
    assert.ok(flatTop + 200 <= 675 - 20 || flatTop >= 675 + 20, `flat ${flatTop}`);
  });
});
