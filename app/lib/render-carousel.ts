import { loadSelectableAssets, type AssetMatch } from "./asset-selector";
import { getSlideGeometry } from "./layout-geometry.js";
import { dataBackend } from "./data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "./workspace";
import { canonicalLayoutFor } from "./canonical-layout";
import { typographyForCarousel } from "./carousel-typography";
import { rankingAssetCountForSlide, selectCarouselMatches, selectRevisionMatches, type RevisionAssetPool } from "./render/assets";
import { recordAssetUsage, revisionSelectionMetadata, saveRenderedSpec, saveSlideRows, selectionMetadata, slideResult, slideRow } from "./render/persist";
import { renderSlide, uploadRender } from "./render/slide";
import type { CarouselRenderInput, EditorOverrides, ExistingSlideRow, Geometry, RevisionRenderInput } from "./render/types";

// Carousel render orchestration: pick assets, lay out and composite each slide,
// upload the PNGs and persist slide rows plus the carousel's render state.
// Asset selection lives in render/assets.ts, compositing in render/slide.ts and
// per-layout text in render/text/.

export type { GeneratedSlide } from "./render/types";
export { educationalAssetSlideForSlot, generationCategory, gridAssetSlideForSlot, rankingAssetCountForSlide } from "./render/assets";
export { makeTextOverlay } from "./render/text/default";

export async function renderCarousel(input: CarouselRenderInput) {
  assertCortiFreeCarouselId(input.id);
  input = { ...input, layout: canonicalLayoutFor(input.carouselType, input.layout) };
  const editorOverrides = (input.spec.editor_overrides ?? {}) as EditorOverrides;
  const { assets, gridMatches } = await selectCarouselMatches(input, editorOverrides);
  const prepared = await Promise.all(input.slides.map(async (sourceSlide, index) => {
    const override = editorOverrides[String(sourceSlide.position)] ?? {};
    const slide = { ...sourceSlide, headline: override.headline ?? sourceSlide.headline, body: override.body ?? sourceSlide.body };
    let slideMatches = gridMatches[index] ?? [];
    const isTextOnlyRanking = input.layout === "ranking" && rankingAssetCountForSlide(slide) === 0;
    if (!isTextOnlyRanking && override.assetIds?.length) {
      slideMatches = slideMatches.map((match, slot) => {
        const requested = override.assetIds?.[slot];
        const forced = requested == null ? null : assets.find((asset) => String(asset.id) === String(requested));
        return forced ? { asset: forced, score: 999, matchedTerms: ["editor_override"], fallbackPath: "editor_override" } : match;
      });
    } else if (!isTextOnlyRanking && override.assetId != null) {
      const forced = assets.find((asset) => String(asset.id) === String(override.assetId));
      if (forced) slideMatches = [{ asset: forced, score: 999, matchedTerms: ["editor_override"], fallbackPath: "editor_override" }, ...slideMatches.slice(1)];
    }
    // The selected model is authoritative. AI copy may return an old layout alias;
    // never let that silently turn a 2x2 request back into a single-photo slide.
    const slideLayout = input.layout === "grid-2x2" && (index === 0 || slide.role.toUpperCase() === "HOOK")
      ? "single-image"
      : input.layout;
    const typography = typographyForCarousel(input.id);
    const isRoutineCtaFinal = input.layout === "routine-timeline"
      && index === input.slides.length - 1
      && new Set(["CTA", "TAKEAWAY"]).has(slide.role.toUpperCase());
    const isVisualFinal = index === input.slides.length - 1
      && (input.layout !== "routine-timeline" || isRoutineCtaFinal);
    const baseGeometry = getSlideGeometry({ ...slide, layout: slideLayout }, index === 0, isVisualFinal, typography) as Geometry;
    const singleImageMode = new Set(["single", "routine-timeline", "interactive-checklist", "persona-explainer"]).has(String(baseGeometry.image?.mode ?? "single"));
    const slotZeroImage = singleImageMode && override.imageSlots?.[0] ? override.imageSlots[0] : {};
    const geometry = {
      ...baseGeometry,
      image: { ...(baseGeometry.image ?? {}), ...slotZeroImage, ...(override.image ?? {}) },
      imageSlots: override.imageSlots,
      text: { ...(baseGeometry.text ?? {}), ...(override.text ?? {}) },
    } as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0];
    const renderMetadata = {
      geometry,
      storage_path: upload.storagePath,
      asset_score: primaryMatch?.score ?? null,
      matched_terms: primaryMatch?.matchedTerms ?? [],
      selection: selectionMetadata(primaryMatch),
      asset_ids: slideMatches.map((match) => match.asset.id),
      asset_source_types: slideMatches.map((match) => match.asset.source_type ?? null),
    };
    return {
      databaseRow: slideRow(input, slide, primaryMatch?.asset.id ?? null, upload.publicUrl, renderMetadata),
      result: slideResult(slide, upload.publicUrl, slideMatches, geometry),
    };
  }));
  await saveSlideRows(prepared.map((item) => item.databaseRow), "Slide save failed");
  const rendered = prepared.map((item) => item.result).sort((a, b) => a.position - b.position);

  const now = new Date().toISOString();
  await recordAssetUsage(input.id, input.slides, gridMatches, now);

  const updatedSpec = {
    ...input.spec,
    typography: typographyForCarousel(input.id),
    rendered_slides: rendered,
    rendered_at: now,
    editor_structure_dirty: false,
  };
  await saveRenderedSpec(input.id, updatedSpec, now, "Carousel render state save failed");
  return rendered;
}


export async function renderCarouselRevision(input: RevisionRenderInput) {
  assertCortiFreeCarouselId(input.id);
  const changed = new Set(input.changedPositions);
  const visualChanges = new Set(input.visualChangePositions ?? []);
  if (!changed.size) return Array.isArray(input.spec.rendered_slides) ? input.spec.rendered_slides as any[] : [];

  const assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  const pool: RevisionAssetPool = { assets, assetMap: new Map(assets.map((asset) => [String(asset.id), asset])) };
  const existingResponse = await dataBackend(
    `carousel_slides?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(input.id)}&select=position,asset_id,rendered_url,render_metadata&order=position.asc`,
  );
  if (!existingResponse.ok) throw new Error(`Existing slide lookup failed: ${await existingResponse.text()}`);
  const existingRows = await existingResponse.json() as ExistingSlideRow[];
  const existingByPosition = new Map(existingRows.map((row) => [Number(row.position), row]));
  const previousRendered = Array.isArray(input.spec.rendered_slides) ? input.spec.rendered_slides as any[] : [];
  const previousByPosition = new Map(previousRendered.map((row: any) => [Number(row.position), row]));
  const usedReferenceIds = new Set<string>();
  const typography = typographyForCarousel(input.id);
  const prepared: Array<{ databaseRow: Record<string, unknown>; result: any }> = [];

  for (const slide of input.slides.filter((item) => changed.has(item.position))) {
    const slideMatches: AssetMatch[] = await selectRevisionMatches({
      input,
      pool,
      slide,
      existing: existingByPosition.get(slide.position),
      previous: previousByPosition.get(slide.position),
      visualChange: visualChanges.has(slide.position),
      usedReferenceIds,
      otherSlideAssetIds: new Set(existingRows
        .filter((row) => Number(row.position) !== slide.position)
        .flatMap((row) => Array.isArray(row.render_metadata?.asset_ids) ? row.render_metadata!.asset_ids.map(String) : row.asset_id != null ? [String(row.asset_id)] : [])),
    });

    const slideLayout = input.layout === "grid-2x2" && (slide.position === 1 || slide.role.toUpperCase() === "HOOK")
      ? "single-image"
      : input.layout;
    const geometry = getSlideGeometry(
      { ...slide, layout: slideLayout },
      slide.position === 1,
      slide.position === input.slides.length,
      typography,
    ) as Geometry;
    const bytes = await renderSlide(slide, slideMatches, geometry);
    const upload = await uploadRender(input.id, slide.position, bytes);
    const primaryMatch = slideMatches[0];
    const persistedAssetId = primaryMatch && pool.assetMap.has(String(primaryMatch.asset.id)) ? primaryMatch.asset.id : null;
    const renderMetadata = {
      geometry,
      storage_path: upload.storagePath,
      asset_score: primaryMatch?.score ?? null,
      matched_terms: primaryMatch?.matchedTerms ?? [],
      selection: revisionSelectionMetadata(primaryMatch, visualChanges.has(slide.position)),
      asset_ids: slideMatches.map((match) => match.asset.id),
      asset_source_types: slideMatches.map((match) => match.asset.source_type ?? null),
      review_revision: true,
      visual_changed: visualChanges.has(slide.position),
    };
    prepared.push({
      databaseRow: slideRow(input, slide, persistedAssetId, upload.publicUrl, renderMetadata),
      result: slideResult(slide, upload.publicUrl, slideMatches, geometry),
    });
  }

  await saveSlideRows(prepared.map((item) => item.databaseRow), "Slide revision save failed");

  const changedResults = new Map(prepared.map((item) => [item.result.position, item.result]));
  const rendered = input.slides.map((slide) => {
    const revised = changedResults.get(slide.position);
    if (revised) return revised;
    return previousByPosition.get(slide.position)
      ?? { position: slide.position, url: existingByPosition.get(slide.position)?.rendered_url ?? null, assetId: existingByPosition.get(slide.position)?.asset_id ?? null };
  }).filter((item) => item.url).sort((a, b) => a.position - b.position);

  const now = new Date().toISOString();
  const updatedSpec = {
    ...input.spec,
    typography,
    rendered_slides: rendered,
    rendered_at: now,
    editor_structure_dirty: false,
  };
  await saveRenderedSpec(input.id, updatedSpec, now, "Carousel revision render save failed");
  return rendered;
}
