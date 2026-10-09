import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, before, after } from "node:test";
import sharp from "sharp";
import { canonicalLayoutFor } from "../app/lib/canonical-layout.js";

// Golden renders for every carousel format. The renderer runs end to end
// (asset selection, geometry, compositing, persisted rows) against a stubbed
// Supabase/storage/asset source, so refactors of the render pipeline can be
// checked for byte-identical output.
//
// PNG hashes depend on libvips/pango and the host platform, so they are keyed
// by environment and only compared when a golden exists for the current one.
// Dimensions and the persisted slide rows are compared everywhere.
//
// Regenerate with: UPDATE_RENDER_GOLDEN=1 npm test -- --test-name-pattern="golden"

const STUB_ORIGIN = "http://golden.test";
const GOLDEN_FILE = path.join(process.cwd(), "tests", "golden", "render-carousel.json");
const UPDATE = process.env.UPDATE_RENDER_GOLDEN === "1";
// Set RENDER_GOLDEN_DUMP=<dir> to write the rendered PNGs for visual review.
const DUMP_DIR = process.env.RENDER_GOLDEN_DUMP;
const ENV_KEY = `${process.platform}-${process.arch}-vips${sharp.versions.vips}`;

type SlideGolden = { position: number; sha256: string; width: number; height: number };
type FormatGolden = { rowsSha256: string; slides: SlideGolden[] } | { error: string };
type GoldenFile = { rows: Record<string, string | { error: string }>; renders: Record<string, Record<string, SlideGolden[]>> };

const PALETTE = [
  ["#d9c4b0", "#5b4636"], ["#a7c4d9", "#203a4f"], ["#f3e2a9", "#7a5d12"], ["#c9e4c5", "#2f5130"],
  ["#e8b4bc", "#6b2d38"], ["#d6d0f0", "#3b3270"], ["#f0d9c4", "#24201c"], ["#bfe3e0", "#1d4a46"],
  ["#ffffff", "#9a9a9a"], ["#2a2a2a", "#bdbdbd"], ["#f7f3eb", "#c49a6c"], ["#9cb3a2", "#f2efe6"],
];

async function stubImage(index: number) {
  const [from, to] = PALETTE[index % PALETTE.length]!;
  const svg = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="${300 + (index % 3) * 150}" cy="${420 + (index % 4) * 90}" r="170" fill="${to}" fill-opacity="0.55"/><rect x="${80 + (index % 5) * 40}" y="860" width="420" height="220" rx="30" fill="${from}" fill-opacity="0.8"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const reviewed = { visual_tagging_schema: "observable_v2", visual_review_status: "IMAGE_INSPECTED_V2", visual_reviewed_at: "2026-09-01T00:00:00Z" };
const ASSETS = [
  { id: "g01", filename: "P01_HOME_001.jpg", category: "home", subcategory: "morning", source_type: "persona_generated", persona_id: "P01", visual_description: "woman drinking coffee by a bright kitchen window in the morning", visible_objects: ["coffee mug", "window"], visible_actions: ["drinking coffee"], setting: "kitchen", people_visibility: "single_person", body_parts_visible: ["face", "hands"], composition: "subject_on_right", tags: ["morning", "coffee", "kitchen"] },
  { id: "g02", filename: "P01_SELFCARE_001.jpg", category: "self_care", subcategory: "skincare", source_type: "persona_generated", persona_id: "P01", visual_description: "woman applying moisturizer at a bathroom sink", visible_objects: ["moisturizer", "sink", "mirror"], visible_actions: ["applying skincare"], setting: "bathroom", people_visibility: "single_person", body_parts_visible: ["face", "hands"], composition: "subject_on_left", tags: ["skincare", "bathroom", "self care"] },
  { id: "g03", filename: "P01_OUTDOORS_001.jpg", category: "outdoors", subcategory: "walk", source_type: "persona_generated", persona_id: "P01", visual_description: "woman walking in a park in daylight", visible_objects: ["trees", "path", "sneakers"], visible_actions: ["walking"], setting: "park", people_visibility: "single_person", body_parts_visible: ["body"], composition: "centered", tags: ["walk", "outdoors", "park"] },
  { id: "g04", filename: "P01_FITNESS_001.jpg", category: "fitness", subcategory: "pilates", source_type: "persona_generated", persona_id: "P01", visual_description: "woman stretching on a pilates mat at home", visible_objects: ["pilates mat"], visible_actions: ["stretching"], setting: "living room", people_visibility: "single_person", body_parts_visible: ["body"], composition: "centered", tags: ["pilates", "stretch", "movement"] },
  { id: "g05", filename: "P01_WORK_001.jpg", category: "work_study", subcategory: "desk", source_type: "persona_generated", persona_id: "P01", visual_description: "woman writing in a notebook at a calm desk", visible_objects: ["notebook", "laptop", "phone"], visible_actions: ["writing"], setting: "home office", people_visibility: "single_person", body_parts_visible: ["hands"], composition: "subject_on_left", tags: ["desk", "study", "focus"] },
  { id: "g06", filename: "P01_NIGHT_001.jpg", category: "home", subcategory: "night", source_type: "persona_generated", persona_id: "P01", visual_description: "woman reading in bed with a warm lamp at night", visible_objects: ["book", "lamp", "bed"], visible_actions: ["reading"], setting: "bedroom", people_visibility: "single_person", body_parts_visible: ["face"], composition: "subject_on_right", tags: ["night", "bedtime", "reading"] },
  { id: "s01", filename: "stock_tea_001.jpg", category: "food", subcategory: "drink", source_type: "stock", visual_description: "cup of herbal tea on a wooden table", visible_objects: ["tea cup", "table"], visible_actions: [], setting: "kitchen", people_visibility: "no_person", composition: "centered", tags: ["tea", "calm", "kitchen"], ...reviewed },
  { id: "s02", filename: "stock_desk_001.jpg", category: "work_study", subcategory: "desk", source_type: "stock", visual_description: "phone face down beside a laptop on a quiet desk", visible_objects: ["phone", "laptop", "desk"], visible_actions: [], setting: "home office", people_visibility: "no_person", composition: "centered", tags: ["desk", "phone", "focus"], ...reviewed },
  { id: "s03", filename: "stock_skincare_001.jpg", category: "self_care", subcategory: "skincare", source_type: "stock", visual_description: "simple skincare essentials on a bathroom counter", visible_objects: ["skincare bottles", "towel"], visible_actions: [], setting: "bathroom", people_visibility: "no_person", composition: "centered", tags: ["skincare", "bathroom"], ...reviewed },
  { id: "s04", filename: "stock_breakfast_001.jpg", category: "food", subcategory: "breakfast", source_type: "stock", visual_description: "simple breakfast bowl with yogurt and fruit", visible_objects: ["bowl", "fruit", "spoon"], visible_actions: [], setting: "kitchen", people_visibility: "no_person", composition: "centered", tags: ["breakfast", "food"], ...reviewed },
  { id: "s05", filename: "stock_bedroom_001.jpg", category: "home", subcategory: "bedroom", source_type: "stock", visual_description: "made bed with soft morning light", visible_objects: ["bed", "pillow", "window"], visible_actions: [], setting: "bedroom", people_visibility: "no_person", composition: "centered", tags: ["bedroom", "morning", "home"], ...reviewed },
  { id: "s06", filename: "stock_walk_001.jpg", category: "outdoors", subcategory: "walk", source_type: "stock", visual_description: "sunny tree lined sidewalk", visible_objects: ["trees", "sidewalk"], visible_actions: [], setting: "street", people_visibility: "no_person", composition: "centered", tags: ["walk", "outdoors"], ...reviewed },
].map((asset, index) => ({
  orientation: "portrait", framing: "medium", activity: "", mood: "calm", colors: [], good_for: [], scene: asset.visual_description,
  use_count: index % 3, last_used_at: null, drive_file_id: null, metadata: {},
  public_url: `${STUB_ORIGIN}/assets/${asset.id}.png`,
  ...asset,
}));

type Slide = { position: number; role: string; layout: string; headline: string; body: string; assetQuery: string; visualIntent: string; assetType?: string };
const slide = (position: number, role: string, headline: string, body: string, visual: string, assetType = "persona"): Slide => ({
  position, role, layout: "", headline, body, assetQuery: visual, visualIntent: visual, assetType,
});

// One carousel per format: cover, two body slides and a final slide.
const FORMATS: Array<{ key: string; carouselType: string; slides: Slide[] }> = [
  { key: "F01_LIFESTYLE_GUIDE", carouselType: "F01_LIFESTYLE_GUIDE", slides: [
    slide(1, "HOOK", "small habits that calmed my mornings", "a realistic guide for busy weeks", "woman drinking coffee by a kitchen window"),
    slide(2, "TIP", "get daylight first", "Ten minutes outside before your phone resets the whole day.", "woman walking in a park in daylight"),
    slide(3, "TIP", "eat something simple", "A yogurt bowl counts. Skipping breakfast makes the afternoon harder.", "simple breakfast bowl with fruit", "stock"),
    slide(4, "CTA", "save this for monday", "Pick one habit and keep it for a week.", "made bed with soft morning light", "stock"),
  ] },
  { key: "F02_EDITORIAL_COLLAGE", carouselType: "F02_EDITORIAL_COLLAGE", slides: [
    slide(1, "HOOK", "the quiet reset nobody talks about", "Three calm rituals for a loud week.", "woman reading in bed with a lamp"),
    slide(2, "TIP", "1. protect the first hour", "No messages before you have had water and light.", "phone face down beside a laptop", "stock"),
    slide(3, "TIP", "2. make tea a pause", "Five minutes, no screen, one warm cup.", "cup of herbal tea on a wooden table", "stock"),
    slide(4, "TAKEAWAY", "slow is still progress", "Your nervous system notices the small things.", "woman stretching on a pilates mat"),
  ] },
  { key: "F03_ROUTINE_TIMELINE", carouselType: "F03_ROUTINE_TIMELINE", slides: [
    slide(1, "HOOK", "my realistic night routine", "for when you are exhausted", "woman reading in bed at night"),
    slide(2, "STEP", "9:00 PM · phone on the charger", "Out of reach, in another room if you can.", "phone face down beside a laptop", "stock"),
    slide(3, "STEP", "9:30 PM – 10:00 PM · warm shower and skincare", "Keep it to three products.", "woman applying moisturizer at a bathroom sink"),
    slide(4, "CTA", "try it for three nights", "Notice how mornings feel.", "made bed with soft morning light", "stock"),
  ] },
  { key: "F04_AESTHETIC_EDUCATIONAL", carouselType: "F04_AESTHETIC_EDUCATIONAL", slides: [
    slide(1, "HOOK", "why you feel wired at night", "✦ cortisol 101 ✦", "woman reading in bed at night"),
    slide(2, "MISTAKE", "make notifications wait", "HOW TO | turn off noise | check later | batch replies", "Three differentiated visuals: top-left proof/example of a phone face down beside a laptop; bottom-left support visual of a quiet desk; bottom-right support visual of a cup of tea.", "stock"),
    slide(3, "TIP", "move a little every day", "Walks count. Stretching counts. Consistency beats intensity.", "Three differentiated visuals: top-left woman walking in a park; bottom-left woman stretching on a mat; bottom-right sunny sidewalk."),
    slide(4, "TAKEAWAY", "small inputs, calmer days", "Start with one of these this week.", "woman drinking coffee by a window"),
  ] },
  { key: "F05_INTERACTIVE_CHECKLIST", carouselType: "F05_INTERACTIVE_CHECKLIST", slides: [
    slide(1, "HOOK", "i thought this was normal", "", "woman drinking coffee by a kitchen window"),
    slide(2, "TIP", "Make mornings feel less rushed", "wait before checking messages | do one thing for yourself first | leave enough time to eat | keep the first part simple", "made bed with soft morning light", "stock"),
    slide(3, "TIP", "Evenings that actually wind down", "dim the lights after dinner | phone away by ten | write tomorrow's list | stretch for five minutes", "woman stretching on a pilates mat"),
    slide(4, "CTA", "Save this checklist", "screenshot it | tick one box tonight", "cup of herbal tea on a wooden table", "stock"),
  ] },
  { key: "F06_PERSONA_EXPLAINER", carouselType: "F06_PERSONA_EXPLAINER", slides: [
    slide(1, "HOOK", "things i stopped doing for my stress", "I used to think busy meant fine. | It did not.", "woman reading in bed at night"),
    slide(2, "OBSERVATION", "skipping breakfast", "My afternoons crashed. | I snapped at people. | Now I eat something small.", "woman drinking coffee by a kitchen window"),
    slide(3, "OBSERVATION", "doom scrolling in bed", "Sleep came later. Mornings felt heavy. The fix was boring.", "woman reading in bed with a lamp"),
    slide(4, "CTA", "follow for the rest", "Part two is about weekends.", "woman walking in a park"),
  ] },
  { key: "F07_RANKING", carouselType: "F07_RANKING", slides: [
    slide(1, "HOOK", "sleep habits tier list", "backed by evidence", "woman reading in bed at night"),
    slide(2, "TIP", "S · CONSISTENT SLEEP", "Strong practical evidence. | Same wake time matters most.", "", "text_only"),
    slide(3, "TIP", "Tier: C late caffeine", "Half-life is longer than you think.", "", "text_only"),
    slide(4, "TAKEAWAY", "start at the top", "Fix the S tier before buying anything.", "", "text_only"),
  ] },
  { key: "F08_2X2", carouselType: "F08_2X2", slides: [
    slide(1, "HOOK", "keep skincare very boring", "simple routine", "woman applying moisturizer at a bathroom sink"),
    slide(2, "TIP", "two steps at night", "cleanse and moisturize", "Exactly two unique photos repeated diagonally: a woman applying moisturizer at a bathroom sink, plus a close-up of simple skincare essentials on the counter.", "stock"),
    slide(3, "TIP", "morning light first", "then coffee", "top-left and bottom-right show woman drinking coffee by a window; top-right and bottom-left show a made bed in morning light"),
    slide(4, "CTA", "save for later", "your skin will thank you", "1) woman walking in a park; 2) sunny sidewalk"),
  ] },
  { key: "SINGLE_IMAGE", carouselType: "LEGACY_SINGLE", slides: [
    slide(1, "HOOK", "the 5 minute reset that works", "for anxious afternoons", "woman drinking coffee by a kitchen window"),
    slide(2, "TIP", "1. step outside", "Daylight and a short walk lower the noise.", "woman walking in a park in daylight"),
    slide(3, "TIP", "2) write it down", "Get the loop out of your head and onto paper.", "woman writing in a notebook at a desk"),
    slide(4, "CTA", "save this", "Try it next time the afternoon spikes.", "cup of herbal tea on a wooden table", "stock"),
  ] },
];

// Assets locked per slide (via previous renders) so every multi-image slot is
// filled deterministically without depending on selector thresholds.
const LOCKED_IDS = ["g01", "s02", "g03", "s04", "g05", "s01", "g02", "s03", "g04", "s05", "g06", "s06"];
function lockedRenderedSlides(slides: Slide[], offset: number) {
  return slides.map((item, index) => ({
    position: item.position,
    assetIds: [0, 1, 2, 3].map((slot) => LOCKED_IDS[(offset + index * 2 + slot) % LOCKED_IDS.length]),
  }));
}

// Review revisions: re-render some slides, preserving visuals except where
// the visual changed (which reselects assets).
const REVISIONS: Array<{ key: string; formatIndex: number; changed: number[]; visual: number[] }> = [
  { key: "REVISION_F04_AESTHETIC_EDUCATIONAL", formatIndex: 3, changed: [2, 3], visual: [3] },
  { key: "REVISION_F05_INTERACTIVE_CHECKLIST", formatIndex: 4, changed: [2], visual: [] },
  { key: "REVISION_F07_RANKING", formatIndex: 6, changed: [1, 2], visual: [1] },
  { key: "REVISION_F08_2X2", formatIndex: 7, changed: [1, 2], visual: [2] },
  { key: "REVISION_SINGLE_IMAGE", formatIndex: 8, changed: [2, 4], visual: [4] },
];
let existingSlides: Array<Record<string, unknown>> = [];

type Capture = { uploads: Map<string, Buffer>; slideRows: Array<Record<string, unknown>>; unexpected: string[] };
let capture: Capture = { uploads: new Map(), slideRows: [], unexpected: [] };
const imageBytes = new Map<string, Buffer>();
const realFetch = globalThis.fetch;

async function stubFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  if (url.origin !== STUB_ORIGIN) throw new Error(`golden stub: unexpected origin ${url.href}`);
  if (url.pathname.startsWith("/assets/")) {
    const bytes = imageBytes.get(url.pathname.slice("/assets/".length).replace(/\.png$/, ""));
    return bytes ? new Response(new Uint8Array(bytes), { status: 200 }) : new Response("missing", { status: 404 });
  }
  if (url.pathname.startsWith("/storage/v1/object/cortifree-assets/") && method === "POST") {
    const storagePath = url.pathname.slice("/storage/v1/object/cortifree-assets/".length);
    capture.uploads.set(storagePath, Buffer.from(init.body as Uint8Array));
    return json({ Key: storagePath });
  }
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "assets" && method === "GET") return json(ASSETS);
  if (table === "assets" && method === "PATCH") return new Response(null, { status: 204 });
  // No 00_VISUAL_GROUPS tab synced: the code's default groups apply.
  if (table === "editorial_records" && method === "GET") return json([]);
  if (table === "asset_usage_history" && method === "GET") return json([]);
  if (table === "asset_usage_history" && method === "POST") return json([]);
  if (table === "carousel_slides" && method === "GET") return json(existingSlides);
  if (table === "carousel_slides" && method === "POST") {
    capture.slideRows.push(...JSON.parse(String(init.body)) as Array<Record<string, unknown>>);
    return json([]);
  }
  if (table === "carousels" && method === "PATCH") return new Response(null, { status: 204 });
  capture.unexpected.push(`${method} ${url.pathname}${url.search}`);
  return json({ message: "golden stub: unexpected request" }, 500);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableRows(rows: Array<Record<string, unknown>>) {
  // Storage paths and public URLs embed Date.now()/Math.random(); everything
  // else in the persisted row is deterministic.
  return JSON.stringify(rows
    .map((row) => {
      const metadata = { ...(row.render_metadata as Record<string, unknown>) };
      delete metadata.storage_path;
      return { ...row, rendered_url: null, render_metadata: metadata } as Record<string, unknown>;
    })
    .sort((a, b) => Number(a.position) - Number(b.position)));
}

function loadGolden(): GoldenFile {
  if (!existsSync(GOLDEN_FILE)) return { rows: {}, renders: {} };
  return JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as GoldenFile;
}

describe("render-carousel golden renders", () => {
  const results = new Map<string, FormatGolden>();

  before(async () => {
    process.env.SUPABASE_URL = STUB_ORIGIN;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "golden-stub-key";
    for (const [index, asset] of ASSETS.entries()) imageBytes.set(asset.id, await stubImage(index));
    globalThis.fetch = stubFetch as typeof fetch;
    const { renderCarousel, renderCarouselRevision } = await import("../app/lib/render-carousel.js");
    const run = async (key: string, render: () => Promise<unknown>) => {
      capture = { uploads: new Map(), slideRows: [], unexpected: [] };
      try {
        await render();
        assert.deepEqual(capture.unexpected, [], `${key} made unexpected backend requests`);
        const slides = await Promise.all(capture.slideRows.map(async (row) => {
          const storagePath = String(row.rendered_url).split("/cortifree-assets/")[1] ?? "";
          const bytes = capture.uploads.get(storagePath);
          assert.ok(bytes, `${key} slide ${row.position} has no captured upload`);
          const metadata = await sharp(bytes).metadata();
          if (DUMP_DIR) {
            mkdirSync(DUMP_DIR, { recursive: true });
            writeFileSync(path.join(DUMP_DIR, `${key}_${row.position}.png`), bytes);
          }
          return { position: Number(row.position), sha256: sha256(bytes), width: metadata.width ?? 0, height: metadata.height ?? 0 };
        }));
        results.set(key, { rowsSha256: sha256(stableRows(capture.slideRows)), slides: slides.sort((a, b) => a.position - b.position) });
      } catch (error) {
        results.set(key, { error: error instanceof Error ? error.message : String(error) });
      }
    };
    for (const [index, format] of FORMATS.entries()) {
      const id = `CF_GOLDEN_${String(index + 1).padStart(2, "0")}`;
      await run(format.key, () => renderCarousel({
        id,
        carouselType: format.carouselType,
        layout: "single-image",
        personaId: "P01",
        slides: format.slides.map((item) => ({ ...item })),
        spec: { rendered_slides: lockedRenderedSlides(format.slides, index) },
      }));
    }
    for (const revision of REVISIONS) {
      const format = FORMATS[revision.formatIndex]!;
      const previous = lockedRenderedSlides(format.slides, revision.formatIndex);
      existingSlides = previous.map((item) => ({
        position: item.position,
        asset_id: item.assetIds[0],
        rendered_url: `${STUB_ORIGIN}/renders/${format.key}_${item.position}.png`,
        render_metadata: { asset_ids: item.assetIds, asset_score: 100, matched_terms: ["locked"] },
      }));
      await run(revision.key, () => renderCarouselRevision({
        id: `CF_GOLDEN_REV_${String(revision.formatIndex + 1).padStart(2, "0")}`,
        carouselType: format.carouselType,
        layout: canonicalLayoutFor(format.carouselType),
        personaId: "P01",
        slides: format.slides.map((item) => ({ ...item, layout: canonicalLayoutFor(format.carouselType) })),
        spec: { rendered_slides: previous.map((item) => ({ ...item, url: `${STUB_ORIGIN}/renders/${format.key}_${item.position}.png` })) },
        changedPositions: revision.changed,
        visualChangePositions: revision.visual,
      }));
    }
    globalThis.fetch = realFetch;

    if (UPDATE) {
      const golden = loadGolden();
      golden.renders[ENV_KEY] = {};
      for (const [key, result] of results) {
        golden.rows[key] = "error" in result ? { error: result.error } : result.rowsSha256;
        if (!("error" in result)) golden.renders[ENV_KEY]![key] = result.slides;
      }
      mkdirSync(path.dirname(GOLDEN_FILE), { recursive: true });
      writeFileSync(GOLDEN_FILE, `${JSON.stringify(golden, null, 2)}\n`);
    }
  });

  for (const revision of REVISIONS) {
    it(`renders ${revision.key} unchanged`, () => {
      const result = results.get(revision.key);
      assert.ok(result, `${revision.key} was not rendered`);
      assert.ok(!("error" in result), `${revision.key} failed to render: ${"error" in result ? result.error : ""}`);
      assert.equal(result.slides.length, revision.changed.length);
      const golden = loadGolden();
      assert.equal(result.rowsSha256, golden.rows[revision.key], `${revision.key} persisted slide rows changed`);
      const renders = golden.renders[ENV_KEY]?.[revision.key];
      if (renders) assert.deepEqual(result.slides, renders, `${revision.key} PNG output changed`);
    });
  }

  after(() => {
    globalThis.fetch = realFetch;
  });

  for (const format of FORMATS) {
    it(`renders ${format.key} unchanged`, () => {
      const result = results.get(format.key);
      assert.ok(result, `${format.key} was not rendered`);
      assert.ok(!("error" in result), `${format.key} failed to render: ${"error" in result ? result.error : ""}`);
      assert.equal(result.slides.length, format.slides.length);
      for (const rendered of result.slides) {
        assert.equal(rendered.width, 1080);
        assert.equal(rendered.height, 1350);
      }
      const golden = loadGolden();
      assert.equal(result.rowsSha256, golden.rows[format.key], `${format.key} persisted slide rows changed`);
      const renders = golden.renders[ENV_KEY]?.[format.key];
      if (!renders) {
        console.log(`# no ${ENV_KEY} PNG golden for ${format.key}; compared dimensions and rows only`);
        return;
      }
      assert.deepEqual(result.slides, renders, `${format.key} PNG output changed`);
    });
  }
});

it("Pango font descriptions put the family first and the size last", async () => {
  const { pangoFontDescription } = await import("../app/lib/render/text/shared");
  assert.equal(pangoFontDescription("TikTok Sans", 800, 42), "TikTok Sans Bold 42px");
  assert.equal(pangoFontDescription("Bricolage Grotesque", 600, 68), "Bricolage Grotesque Semi-Bold 68px");
  assert.equal(pangoFontDescription("DM Sans", 500, 28), "DM Sans Medium 28px");
  assert.equal(pangoFontDescription("DM Sans", 400, 28), "DM Sans 28px");
});
