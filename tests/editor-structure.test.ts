import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyEditorStructureAction, hydrateEditorSpecFromRenderedSlides, isProtectedStructureIndex } from "../app/lib/editor-structure.js";

const baseSpec = {
  generated_slides: [
    { position: 1, role: "HOOK", headline: "h", body: "", layout: "x", visualIntent: "v", assetType: "persona", assetQuery: "a" },
    { position: 2, role: "EDUCATION", headline: "two", body: "", layout: "x", visualIntent: "v", assetType: "stock", assetQuery: "a" },
    { position: 3, role: "EDUCATION", headline: "three", body: "", layout: "x", visualIntent: "v", assetType: "stock", assetQuery: "a" },
    { position: 4, role: "CTA", headline: "cta", body: "", layout: "x", visualIntent: "v", assetType: "stock", assetQuery: "a" },
  ],
  editor_overrides: {
    "2": { headline: "override two", assetIds: ["a2"] },
    "3": { body: "override three" },
  },
  editor_state: { layers: { "2": { headline: { locked: true } }, "3": { "image:0": { hidden: true } } } },
  rendered_slides: [{ position: 1, url: "old" }],
  rendered_at: "old",
};

describe("editor structure mutations", () => {
  it("hydrates implicit rendered asset assignments before structural edits", () => {
    const hydrated = hydrateEditorSpecFromRenderedSlides(
      { ...baseSpec, editor_overrides: { "2": { headline: "override two" } } },
      [{
        position: 2,
        asset_id: 1943,
        render_metadata: {
          asset_ids: [1943],
          geometry: {
            text: { headlineX: 165, headlineY: 300, width: 750 },
            imageSlots: [{ x: 0, y: 0, width: 1080, height: 1350 }],
          },
        },
      }],
    );
    assert.deepEqual(hydrated.editor_overrides["2"].assetIds, [1943]);
    assert.equal(hydrated.editor_overrides["2"].text.headlineX, 165);
    assert.equal(hydrated.editor_overrides["2"].imageSlots[0].width, 1080);
    assert.equal(hydrated.editor_overrides["2"].headline, "override two");
  });

  it("does not overwrite explicit editor asset or geometry overrides", () => {
    const hydrated = hydrateEditorSpecFromRenderedSlides(
      { ...baseSpec, editor_overrides: { "2": { assetIds: ["manual"], text: { headlineX: 999 }, imageSlots: [{ x: 10 }] } } },
      [{ position: 2, asset_id: 1943, render_metadata: { asset_ids: [1943], geometry: { text: { headlineX: 165 }, imageSlots: [{ x: 0 }] } } }],
    );
    assert.deepEqual(hydrated.editor_overrides["2"].assetIds, ["manual"]);
    assert.equal(hydrated.editor_overrides["2"].text.headlineX, 999);
    assert.equal(hydrated.editor_overrides["2"].imageSlots[0].x, 10);
  });

  it("protects hook and CTA slides", () => {
    assert.equal(isProtectedStructureIndex(baseSpec.generated_slides, 0), true);
    assert.equal(isProtectedStructureIndex(baseSpec.generated_slides, 1), false);
    assert.equal(isProtectedStructureIndex(baseSpec.generated_slides, 3), true);
  });

  it("reorders middle slides and remaps overrides by content", () => {
    const result = applyEditorStructureAction(baseSpec, { action: "reorder", fromIndex: 1, toIndex: 2 });
    assert.deepEqual(result.spec.generated_slides.map((s:any) => s.headline), ["h", "three", "two", "cta"]);
    assert.equal(result.spec.editor_overrides["2"].body, "override three");
    assert.equal(result.spec.editor_overrides["3"].headline, "override two");
    assert.equal(result.spec.editor_state.layers["2"]["image:0"].hidden, true);
    assert.equal(result.spec.editor_state.layers["3"].headline.locked, true);
    assert.equal((result.spec as any).rendered_slides, undefined);
    assert.equal(result.spec.editor_structure_dirty, true);
  });

  it("duplicates a middle slide with its override", () => {
    const result = applyEditorStructureAction(baseSpec, { action: "duplicate", index: 1 });
    assert.equal(result.spec.generated_slides.length, 5);
    assert.equal(result.spec.generated_slides[2].headline, "two");
    assert.equal(result.spec.editor_overrides["3"].headline, "override two");
  });

  it("deletes a middle slide while preserving minimum structure", () => {
    const five = applyEditorStructureAction(baseSpec, { action: "duplicate", index: 1 }).spec;
    const result = applyEditorStructureAction(five, { action: "delete", index: 2 });
    assert.equal(result.spec.generated_slides.length, 4);
    assert.deepEqual(result.spec.generated_slides.map((s:any) => s.position), [1,2,3,4]);
  });

  it("refuses protected and below-minimum deletes", () => {
    assert.throws(() => applyEditorStructureAction(baseSpec, { action: "delete", index: 0 }), /PROTECTED/);
    assert.throws(() => applyEditorStructureAction(baseSpec, { action: "delete", index: 1 }), /MIN_SLIDES/);
  });
});
