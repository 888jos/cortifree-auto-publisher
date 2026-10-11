import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { getSlideGeometry } from "../app/lib/layout-geometry.js";
import { checklistTextOverlays } from "../app/lib/render/text/checklist";
import { rasterText } from "../app/lib/render/text/shared";
import type { GeneratedSlide, Geometry } from "../app/lib/render/types";

const note = (headline: string, items: string[], extra: Partial<GeneratedSlide> = {}): GeneratedSlide => ({
  position: 3, role: "TIP", layout: "interactive-checklist", headline, body: items.join(" | "), assetQuery: "", visualIntent: "", ...extra,
});

async function boxes(slide: GeneratedSlide) {
  const geometry = getSlideGeometry(slide, false, false, {}) as Geometry;
  const overlays = await checklistTextOverlays(slide, geometry);
  return Promise.all(overlays.map(async (overlay) => {
    const meta = await sharp(overlay.input as Buffer).metadata();
    return { top: overlay.top ?? 0, left: overlay.left ?? 0, width: meta.width ?? 0, height: meta.height ?? 0 };
  }));
}

describe("F05 Notes card", () => {
  it("never cuts a title: a title too long for two lines takes a third", async () => {
    const title = "make the last ten minutes of the evening very simple and quiet every night";
    const options = { maxLines: 2, width: 706, height: 140, size: 52, weight: 650, color: "#282828", align: "left" as const, spacing: 0 };
    const cut = await sharp(await rasterText(title, options)).metadata();
    const whole = await sharp(await rasterText(title, { ...options, neverCut: true })).metadata();
    assert.ok((whole.height ?? 0) > (cut.height ?? 0), "the whole title is drawn on an extra line instead of ending in …");
  });

  it("keeps one item size and grows the card instead of cutting items", async () => {
    const item = "change into pajamas without opening my phone, then put it on the charger in the kitchen";
    const short = await boxes(note("make the last ten minutes very simple", ["keep the lights soft", "read a few pages", "wash my face", "sit quietly"]));
    const long = await boxes(note("make the last ten minutes very simple", Array.from({ length: 6 }, () => item)));
    const [shortPanel] = short;
    const [longPanel, , ...rest] = long;
    assert.equal(shortPanel!.height, 940, "a short Note keeps the usual card");
    assert.ok(longPanel!.height > 940, "a long Note gets a taller card");
    assert.ok(longPanel!.top >= 110 && longPanel!.top + longPanel!.height <= 1250, "the card stays in the safe zone");
    const labels = rest.filter((_, index) => index % 2 === 1);
    assert.equal(labels.length, 6);
    // Same text, same size: every row has the same rendered height, and the last one is inside the card.
    assert.equal(new Set(labels.map((label) => label.height)).size, 1);
    const last = labels.at(-1)!;
    assert.ok(last.top + last.height <= longPanel!.top + longPanel!.height - 32);
  });

  it("leaves room for an optional CortiFree line under the list", async () => {
    const items = ["keep the lights soft", "read a few pages", "wash my face", "sit quietly"];
    const without = await boxes(note("make the last ten minutes very simple", items));
    const withNote = await boxes(note("make the last ten minutes very simple", items, { cortifreeNote: "logged my evening check-in in cortifree" }));
    assert.equal(withNote.length, without.length + 2);
    const panel = withNote[0]!;
    const noteText = withNote.at(-1)!;
    assert.ok(noteText.top + noteText.height <= panel.top + panel.height - 32);
  });
});
