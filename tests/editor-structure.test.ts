import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyEditorStructureAction, isProtectedStructureIndex } from "../app/lib/editor-structure.js";

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
