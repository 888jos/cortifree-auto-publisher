import type { AssetMatch } from "../asset-selector";
import { dataBackend } from "../data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../workspace";
import type { GeneratedSlide, Geometry } from "./types";

// Render metadata, carousel_slides rows and the writes that follow a render.

export function selectionMetadata(primaryMatch: AssetMatch | undefined) {
  return primaryMatch ? {
    candidate_pool_size: primaryMatch.candidatePoolSize ?? null,
    selected_asset_id: primaryMatch.asset.id,
    final_score: primaryMatch.score,
    fallback_path: primaryMatch.fallbackPath ?? "primary",
    threshold: primaryMatch.threshold ?? null,
    threshold_bypassed: primaryMatch.thresholdBypassed ?? false,
    visual_intent: primaryMatch.visualIntent ?? null,
    matched_dimensions: primaryMatch.matchedDimensions ?? [],
    matched_settings: primaryMatch.matchedSettings ?? [],
    matched_compositions: primaryMatch.matchedCompositions ?? [],
    description_score: primaryMatch.descriptionScore ?? null,
    object_score: primaryMatch.objectScore ?? null,
    action_score: primaryMatch.actionScore ?? null,
    setting_score: primaryMatch.settingScore ?? null,
    composition_score: primaryMatch.compositionScore ?? null,
    repetition_penalty: primaryMatch.repetitionPenalty ?? null,
    top_candidates: primaryMatch.topCandidates ?? [],
    category_bonus: primaryMatch.categoryBonus ?? null,
  } : {
    candidate_pool_size: 0,
    selected_asset_id: null,
    final_score: null,
    fallback_path: "text_only",
    threshold: null,
    threshold_bypassed: false,
    visual_intent: null,
    matched_dimensions: [],
    matched_settings: [],
    matched_compositions: [],
    description_score: null,
    object_score: null,
    action_score: null,
    setting_score: null,
    composition_score: null,
    repetition_penalty: null,
    top_candidates: [],
    category_bonus: null,
  };
}

export function revisionSelectionMetadata(primaryMatch: AssetMatch | undefined, visualChanged: boolean) {
  return primaryMatch ? {
    selected_asset_id: primaryMatch.asset.id,
    fallback_path: primaryMatch.fallbackPath ?? (visualChanged ? "review_visual_reselect" : "review_preserved_visual"),
    threshold_bypassed: primaryMatch.thresholdBypassed ?? false,
  } : {
    selected_asset_id: null,
    fallback_path: "text_only",
    threshold_bypassed: false,
  };
}

export function slideRow(carousel: { id: string; layout: string }, slide: GeneratedSlide, assetId: string | number | null, renderedUrl: string, renderMetadata: Record<string, unknown>) {
  return {
    workspace_id: CORTIFREE_WORKSPACE_ID,
    carousel_id: carousel.id,
    position: slide.position,
    template_id: carousel.layout,
    headline: slide.headline,
    body: slide.body,
    asset_requirement: { query: slide.assetQuery, visual_intent: slide.visualIntent },
    asset_id: assetId,
    rendered_url: renderedUrl,
    render_metadata: renderMetadata,
  };
}

export function slideResult(slide: GeneratedSlide, url: string, slideMatches: AssetMatch[], geometry: Geometry) {
  const primaryMatch = slideMatches[0];
  return {
    position: slide.position,
    url,
    assetId: primaryMatch?.asset.id ?? null,
    assetFilename: primaryMatch?.asset.filename ?? null,
    score: primaryMatch?.score ?? null,
    matchedTerms: primaryMatch?.matchedTerms ?? [],
    geometry,
    assetIds: slideMatches.map((match) => match.asset.id),
    assetSourceTypes: slideMatches.map((match) => match.asset.source_type ?? null),
  };
}

export async function saveSlideRows(rows: Array<Record<string, unknown>>, failureMessage: string) {
  const slideResponse = await dataBackend("carousel_slides?on_conflict=carousel_id,position", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!slideResponse.ok) throw new Error(`${failureMessage}: ${await slideResponse.text()}`);
}

export async function recordAssetUsage(carouselId: string, slides: GeneratedSlide[], gridMatches: AssetMatch[][], now: string) {
  await Promise.all(gridMatches.flatMap((slideMatches, index) => slideMatches.map(async (match) => {
    if (match !== slideMatches[0]) {
      await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(match.asset.id)}`, { method: "PATCH", body: JSON.stringify({ use_count: (match.asset.use_count ?? 0) + 1, last_used_at: now }) });
      return;
    }
    await dataBackend("asset_usage_history?on_conflict=carousel_id,slide_position", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, asset_id: match.asset.id, carousel_id: carouselId, slide_position: slides[index].position, match_score: match.score, matched_terms: match.matchedTerms }),
    });
    await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(match.asset.id)}`, { method: "PATCH", body: JSON.stringify({ use_count: (match.asset.use_count ?? 0) + 1, last_used_at: now }) });
  })));
}

export async function saveRenderedSpec(carouselId: string, updatedSpec: Record<string, unknown>, now: string, failureMessage: string) {
  const carouselResponse = await dataBackend(
    `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(carouselId)}`,
    { method: "PATCH", body: JSON.stringify({ spec: updatedSpec, updated_at: now }) },
  );
  if (!carouselResponse.ok) throw new Error(`${failureMessage}: ${await carouselResponse.text()}`);
}
