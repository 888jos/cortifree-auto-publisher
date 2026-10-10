import { loadVisualGroups } from "../visual-groups";
import { chooseAssets, loadSelectableAssets, pickCarouselFace, requiresOfficialAppScreenshot, visualGroupMembers, visualPersonaIdFor, type AssetMatch, type SelectableAsset } from "../asset-selector";
import { dataBackend } from "../data-backend";
import { downloadDriveFile } from "../google/drive";
import { processImageGenerationJob, recentImageProviderBlocker, usedReferenceIdsForPersona } from "../image-generation";
import { CORTIFREE_WORKSPACE_ID } from "../workspace";
import { buildImagePrompt, imageGenerationInputSchema } from "../../../src/image-generation/core";
import { isAutomaticVisualReference, scoreVisualReferenceForScene, visualReferenceSchema } from "../../../src/visual-references";
import { loadRuntimePersonaConfigs } from "../../../src/runtime/config";
import type { CarouselRenderInput, EditorOverrides, ExistingSlideRow, GeneratedSlide, RevisionRenderInput } from "./types";

// Slot-aware asset queries, asset download, ModelArk repair generation and the
// per-layout selection used by the full render and by review revisions.

function labeledEducationalVisual(value: string, label: "top-left" | "bottom-left" | "bottom-right") {
  const source = value.replace(/^\s*Three differentiated visuals:\s*/i, "").trim();
  const labels = "top-left|bottom-left|bottom-right|top-right";
  const match = source.match(new RegExp(`(?:^|;\\s*)${label}\\s+([\\s\\S]*?)(?=;\\s*(?:${labels})\\b|$)`, "i"));
  return match?.[1]?.replace(/^(?:proof\/example|support visual|proof|example)\s+(?:of\s+)?/i, "").trim() ?? "";
}

/** "three visuals: A, B, C" (unlabelled list) → the slot's item, or "". */
function listedEducationalVisual(value: string, slotIndex: number) {
  const match = value.match(/^\s*(?:three|3)\s+(?:differentiated\s+)?visuals?\s*:\s*([\s\S]+)$/i);
  if (!match) return "";
  const items = match[1]!.split(/\s*[;|]\s*|,\s+(?=[a-z])/i).map((item) => item.trim()).filter(Boolean);
  return items.length >= 3 ? items[Math.min(slotIndex, items.length - 1)]! : "";
}

export function educationalAssetSlideForSlot(slide: GeneratedSlide, slotIndex: number): GeneratedSlide {
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  if (isHook) return slide;
  const labels = ["top-left", "bottom-left", "bottom-right"] as const;
  const label = labels[Math.max(0, Math.min(labels.length - 1, slotIndex))]!;
  const visual = labeledEducationalVisual(slide.visualIntent, label)
    || labeledEducationalVisual(slide.assetQuery, label)
    || listedEducationalVisual(slide.visualIntent, slotIndex)
    || listedEducationalVisual(slide.assetQuery, slotIndex);
  const fallback = `${slide.headline}. ${slide.body.split("|").slice(1).join(". ")}`.trim();
  const intent = visual || fallback;
  return {
    ...withoutAppScreenshotDirective(slide),
    position: Math.max(2, slide.position),
    role: slotIndex === 0 ? slide.role : "SUPPORT",
    assetType: slotIndex === 0 ? slide.assetType : "stock",
    assetQuery: intent,
    visualIntent: intent,
  };
}

function twoByTwoVisualParts(value: string) {
  let source = value
    .replace(/^\s*(?:Editorial\s+)?2x2\s+grid\s+with\s+/i, "")
    .replace(/^\s*(?:Exactly\s+)?two\s+unique(?:\s+cohesive)?(?:\s+lifestyle)?\s+photos?(?:\s+only)?(?:,?\s+repeated\s+diagonally(?:\s+in\s+the\s+2x2\s+grid)?)?\s*:\s*/i, "")
    .trim();
  const labeled = source.match(/top-left(?:\s+and\s+bottom-right)?\s+(?:show|shows)?\s*([\s\S]*?);\s*top-right(?:\s+and\s+bottom-left)?\s+(?:show|shows)?\s*([\s\S]*)/i);
  if (labeled) return [labeled[1]!.trim(), labeled[2]!.trim()];
  const numbered = source.match(/1\)\s*([\s\S]*?)(?:;|,)?\s*2\)\s*([\s\S]*)/i);
  if (numbered) return [numbered[1]!.trim(), numbered[2]!.trim()];
  const plus = source.split(/\s*,?\s+plus\s+/i).map((part) => part.trim()).filter(Boolean);
  if (plus.length >= 2) return [plus[0]!, plus.slice(1).join(" plus ")];
  const semicolon = source.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
  return semicolon.length >= 2 ? [semicolon[0]!, semicolon[1]!] : [source];
}

export function gridAssetSlideForSlot(slide: GeneratedSlide, slotIndex: 0 | 1): GeneratedSlide {
  const visualParts = twoByTwoVisualParts(slide.visualIntent);
  const queryParts = twoByTwoVisualParts(slide.assetQuery);
  const intent = visualParts[slotIndex] || queryParts[slotIndex] || visualParts[0] || queryParts[0] || slide.headline;
  return {
    ...withoutAppScreenshotDirective(slide),
    role: slotIndex === 0 ? slide.role : "SUPPORT",
    assetType: slotIndex === 0 ? slide.assetType : "stock",
    assetQuery: intent,
    visualIntent: intent,
  };
}

export function withoutAppScreenshotDirective(slide: GeneratedSlide): GeneratedSlide {
  if (!requiresOfficialAppScreenshot(slide)) return slide;
  const fallbackIntent = `${slide.headline}. ${slide.body}`.trim();
  return {
    ...slide,
    assetQuery: fallbackIntent,
    visualIntent: fallbackIntent,
  };
}

export async function selectedAssetBytes(match: AssetMatch) {
  if (match.asset.source_type === "app_screenshot") {
    const driveId = match.asset.drive_file_id
      ?? (match.asset.metadata && typeof match.asset.metadata.drive_file_id === "string"
        ? match.asset.metadata.drive_file_id
        : null);
    if (!driveId) throw new Error(`APP_SCREEN_DRIVE_ID_MISSING:${match.asset.id}`);
    const downloaded = await downloadDriveFile(driveId);
    return Buffer.from(downloaded.bytes);
  }
  const response = await fetch(match.asset.public_url);
  if (!response.ok) throw new Error(`Cannot download selected asset ${match.asset.filename}`);
  return Buffer.from(await response.arrayBuffer());
}

export function rankingAssetCountForSlide(slide: Pick<GeneratedSlide, "position" | "role">) {
  const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
  return isHook ? 2 : 0;
}

export function generationCategory(slide: GeneratedSlide) {
  const text = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.toLowerCase();
  if (/\b(?:walk|walking|outdoor|outdoors|street|park|outside|nature|sidewalk|commute)\b/.test(text)) return "outdoors";
  if (/\b(?:gym|workout|exercise|fitness|pilates|yoga|run|running|stretch|movement)\b/.test(text)) return "fitness";
  if (/\b(?:food|meal|breakfast|lunch|dinner|eat|eating|drink|coffee|matcha|grocery|groceries|snack)\b/.test(text)) return "food";
  if (/\b(?:study|work|desk|laptop|exam|task|focus|office)\b/.test(text)) return "work_study";
  if (/\b(?:skin|skincare|beauty|glow|face|makeup|hair|grooming|shower|bathroom|blowout|bun)\b|self[ -]?care|claw[ -]?clip/.test(text)) return "self_care";
  return "home";
}

export function checklistBackgroundFallbackSlide(slide: GeneratedSlide): GeneratedSlide {
  const category = generationCategory(slide);
  const fallbackByCategory: Record<string, string> = {
    outdoors: "natural outdoor walking or daylight lifestyle scene",
    fitness: "simple movement or workout lifestyle detail in natural light",
    food: "simple warm kitchen or meal-preparation lifestyle scene",
    work_study: "calm desk, study or work-break lifestyle scene",
    self_care: "simple bathroom, grooming or self-care lifestyle scene",
    home: "cozy realistic home routine detail in soft natural light",
  };
  const intent = fallbackByCategory[category] ?? fallbackByCategory.home;
  return {
    ...withoutAppScreenshotDirective(slide),
    assetType: "stock",
    assetQuery: intent,
    visualIntent: intent,
  };
}

function referenceSceneIntent(slide: GeneratedSlide) {
  const scene = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.trim();
  const category = generationCategory(slide);
  const recommended_reference_categories =
    category === "outdoors" ? ["outdoors_walk"] :
    category === "fitness" ? ["fitness_pilates"] :
    category === "food" ? ["food_grocery", "kitchen"] :
    category === "work_study" ? ["work_study"] :
    category === "self_care" ? ["self_care", "bathroom"] :
    ["morning_home", "bedroom"];
  return {
    category,
    scene_description: scene,
    recommended_reference_categories,
    broad_match_only: slide.position === 1 || slide.role.toUpperCase() === "HOOK",
  };
}

export async function generateRepairAsset(options: { input: { id: string; personaId?: string }; slide: GeneratedSlide; position: number; usedReferenceIds: Set<string> }) {
  const providerBlocker = await recentImageProviderBlocker();
  if (providerBlocker) {
    throw new Error(`MODELARK_PROVIDER_BLOCKED:${providerBlocker.reason}:slide_${options.position}`);
  }
  if (!options.input.personaId) throw new Error(`MODELARK_REPAIR_REQUIRES_PERSONA:slide_${options.position}`);
  // A group's new images always come from its single master.
  const visualPersonaId = visualPersonaIdFor(options.input.personaId);
  if (!visualPersonaId) throw new Error(`MODELARK_REPAIR_REQUIRES_PERSONA:slide_${options.position}`);
  const [personas, mastersResponse, referencesResponse] = await Promise.all([
    loadRuntimePersonaConfigs(),
    dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&persona_id=eq.${encodeURIComponent(visualPersonaId)}&source_type=eq.persona_master&enabled=eq.true&public_url=not.is.null&select=id&limit=1`),
    dataBackend(`visual_references?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&enabled=eq.true&select=*&limit=500`),
  ]);
  if (!mastersResponse.ok) throw new Error(`MODELARK_MASTER_LOOKUP_FAILED:${await mastersResponse.text()}`);
  if (!referencesResponse.ok) throw new Error(`MODELARK_REFERENCE_LOOKUP_FAILED:${await referencesResponse.text()}`);
  const masters = await mastersResponse.json() as Array<{ id: string | number }>;
  const master = masters[0];
  if (!master) throw new Error(`MODELARK_MASTER_MISSING:${visualPersonaId}`);
  const referenceRows = await referencesResponse.json() as unknown[];
  const usedByPersona = await usedReferenceIdsForPersona(visualPersonaId);
  const references = referenceRows
    .map((row) => visualReferenceSchema.safeParse(row))
    .flatMap((result) => result.success && isAutomaticVisualReference(result.data) ? [result.data] : [])
    .filter((reference) => !options.usedReferenceIds.has(reference.id) && !usedByPersona.has(reference.id));
  const referenceIntent = referenceSceneIntent(options.slide);
  const rankedReferences = references
    .map((reference) => ({ reference, score: scoreVisualReferenceForScene(reference, referenceIntent) }))
    .sort((a, b) => b.score - a.score);
  const bestReference = rankedReferences[0];
  if (!bestReference) throw new Error(`MODELARK_REFERENCE_MISSING:slide_${options.position}`);
  const referenceFloor = referenceIntent.broad_match_only ? 8 : 20;
  if (bestReference.score < referenceFloor) {
    throw new Error(`MODELARK_REFERENCE_LOW_CONFIDENCE:slide_${options.position}:score_${bestReference.score}:required_${referenceFloor}:candidates_${rankedReferences.length}`);
  }
  const foundPersona = personas.find((item) => item.id === visualPersonaId);
  if (!foundPersona) throw new Error(`MODELARK_PERSONA_MISSING:${visualPersonaId}`);
  const persona = foundPersona;
  // ModelArk can refuse an output as sensitive (often a revealing reference
  // outfit); try the next confident references before giving up the slide.
  const candidates = rankedReferences.filter((item) => item.score >= referenceFloor).slice(0, 3);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await generateRepairFromReference(candidate);
    } catch (error) {
      lastError = error;
      options.usedReferenceIds.add(candidate.reference.id);
      if (!/SensitiveContent/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  throw lastError ?? new Error(`MODELARK_REFERENCE_MISSING:slide_${options.position}`);

  async function generateRepairFromReference(candidate: { reference: (typeof rankedReferences)[number]["reference"]; score: number }) {
    const reference = candidate.reference;
    const generationInput = imageGenerationInputSchema.parse({
      persona_id: visualPersonaId, master_asset_id: master.id, visual_reference_id: reference.id,
      carousel_id: options.input.id, slide_id: `slide_${options.position}`, scene: options.slide.visualIntent || options.slide.assetQuery || options.slide.headline,
      category: generationCategory(options.slide), framing: "portrait",
      prompt_additions: "Automatic carousel repair. Image 1 is only the identity master and Image 2 is only the Pinterest visual reference. Never place either source image directly in the carousel. Generate a new distinct natural photo and do not repeat any previously generated scene in this carousel.",
    });
    const prompt = buildImagePrompt(persona, reference, generationInput);
    const jobResponse = await dataBackend("image_generation_jobs", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ workspace_id: CORTIFREE_WORKSPACE_ID, persona_id: visualPersonaId, master_asset_id: master.id, visual_reference_id: reference.id, carousel_id: options.input.id, slide_id: `slide_${options.position}`, category: generationInput.category, scene: generationInput.scene, input: generationInput, prompt, provider: "modelark_seedream", model: process.env.MODELARK_MODEL_ID ?? "", status: "PENDING", attempts: 0, attempt_count: 0, metadata: {
        automatic_repair: true,
        source: "carousel_render",
        visual_intent: options.slide.visualIntent || options.slide.assetQuery || options.slide.headline,
        reference_score: candidate.score,
        top_reference_candidates: rankedReferences.slice(0, 5).map((item) => ({ id: item.reference.id, score: item.score })),
      } }),
    });
    if (!jobResponse.ok) throw new Error(`MODELARK_JOB_CREATE_FAILED:${await jobResponse.text()}`);
    const jobs = await jobResponse.json() as Array<{ id: string | number }>;
    if (!jobs[0]) throw new Error("MODELARK_JOB_CREATE_FAILED:no_job_id");
    const generated = await processImageGenerationJob(String(jobs[0].id));
    options.usedReferenceIds.add(reference.id);
    return generated;
  }
}

// Picks the assets for every slide of a full render, generating a repair asset
// through ModelArk when a slide cannot be filled. Returns the final asset pool
// because repairs reload it.
export async function selectCarouselMatches(input: CarouselRenderInput, editorOverrides: EditorOverrides): Promise<{ assets: SelectableAsset[]; gridMatches: AssetMatch[][] }> {
  await loadVisualGroups();
  const visualPersonaId = visualPersonaIdFor(input.personaId);
  // One face for the whole carousel, even though look-alikes share a pool.
  const faceLock: { personaId?: string } = {};
  const groupMembers = new Set(visualGroupMembers(input.personaId));
  let assets = await loadSelectableAssets();
  if (!assets.length) throw new Error("No synced Drive asset is available");
  faceLock.personaId = pickCarouselFace(assets, input.personaId, input.slides.length);
  const personaHookIds = assets
    .filter((asset) => asset.source_type === "persona_generated" && groupMembers.has(String(asset.persona_id ?? "")))
    .map((asset) => String(asset.id));
  let recentHookAssetIds = new Set<string>();
  if (input.personaId && personaHookIds.length) {
    const history = await dataBackend(`asset_usage_history?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&asset_id=in.(${personaHookIds.map(encodeURIComponent).join(',')})&slide_position=eq.1&select=asset_id&order=used_at.desc&limit=10`);
    if (history.ok) {
      const recent = await history.json() as Array<{ asset_id?: string | number }>;
      recentHookAssetIds = new Set(recent.map((row) => String(row.asset_id ?? '')).filter(Boolean));
    }
  }
  const usedReferenceIds = new Set<string>();
  const repairedPositions = new Set<number>();
  // An image generated to repair a slide is used for that slide outright:
  // re-scoring it against a slot-specific intent rejected paid repairs.
  const repairedAssetByPosition = new Map<number, string | number>();
  const previousRendered = Array.isArray(input.spec.rendered_slides) ? input.spec.rendered_slides as Array<Record<string, unknown>> : [];
  function lockedIdsForSlide(slide: GeneratedSlide, index: number) {
    const override = editorOverrides[String(slide.position)] ?? {};
    if (override.assetIds?.length) return override.assetIds;
    if (override.assetId != null) return [override.assetId];
    const repaired = repairedAssetByPosition.get(slide.position);
    if (repaired != null) return [repaired];
    const previous = previousRendered.find((item) => Number(item.position) === Number(slide.position)) ?? previousRendered[index];
    const previousIds = Array.isArray(previous?.assetIds) ? previous!.assetIds as Array<string | number> : [];
    if (previousIds.length) return previousIds;
    return previous?.assetId != null ? [previous.assetId as string | number] : [];
  }
  function lockedMatchesForSlide(slide: GeneratedSlide, index: number): AssetMatch[] {
    return lockedIdsForSlide(slide, index).map((id) => {
      const asset = assets.find((item) => String(item.id) === String(id));
      return asset ? { asset, score: 999, matchedTerms: ["locked_existing_asset"], fallbackPath: "locked_existing_asset", thresholdBypassed: true } as AssetMatch : null;
    }).filter((item): item is AssetMatch => Boolean(item));
  }
  function rerenderSupportFallback(primary: AssetMatch, used: Set<string>): AssetMatch | null {
    if (!previousRendered.length) return null;
    const candidates = assets.filter((asset) => !used.has(String(asset.id)));
    const ranked = candidates.sort((a, b) => {
      const score = (asset: typeof a) =>
        (asset.persona_id === input.personaId ? 100 : 0)
        + (asset.category === primary.asset.category ? 30 : 0)
        + (asset.source_type === "persona_generated" ? 10 : 0)
        - Number(asset.use_count ?? 0);
      return score(b) - score(a);
    });
    const asset = ranked[0];
    return asset ? { asset, score: 0, matchedTerms: [], fallbackPath: "rerender_support_fallback", thresholdBypassed: true } as AssetMatch : null;
  }
  const multiImageLayout = input.layout === "three-rect-educational"
    || input.layout === "editorial-asym-hero"
    || input.layout === "editorial-collage"
    || input.layout === "ranking"
    || input.layout === "lifestyle-3stack";

  function primarySelectionSlide(slide: GeneratedSlide): GeneratedSlide {
    const slotAware = input.layout === "three-rect-educational"
      ? educationalAssetSlideForSlot(slide, 0)
      : input.layout === "grid-2x2"
        ? gridAssetSlideForSlot(slide, 0)
        : slide;
    const normalized = (multiImageLayout || input.layout === "grid-2x2")
      ? withoutAppScreenshotDirective(slotAware)
      : slotAware;
    return normalized.assetType === "generated"
      ? { ...normalized, assetType: "persona" }
      : normalized;
  }

  let gridMatches: AssetMatch[][] = [];
  for (let attempt = 0; attempt <= Math.max(2, input.slides.length); attempt += 1) {
    try {
      // Masters and raw Pinterest references are never renderable output. They
      // may only enter through the ModelArk repair path above.
      const selectionSlides = input.slides;
      // One photo appears once per carousel (a live F03 showed the same
      // bookshop photo on two steps).
      // Locked photos (repairs, operator picks) are reserved for their own
      // slide first: a live F03 cover took the repair made for step 5.
      const usedInCarousel = new Set<string>(selectionSlides.flatMap((slide, index) =>
        lockedMatchesForSlide(slide, index).map((match) => String(match.asset.id))));
      const matches = selectionSlides.map((slide, selectionIndex): AssetMatch | undefined => {
        const actualIndex = selectionIndex;
        if (input.layout === "ranking" && rankingAssetCountForSlide(slide) === 0) return undefined;
        const locked = lockedMatchesForSlide(slide, actualIndex)[0];
        if (locked) { usedInCarousel.add(String(locked.asset.id)); return locked; }
        try {
          const match = chooseAssets({ faceLock,
            assets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            excludedAssetIds: new Set([...recentHookAssetIds, ...usedInCarousel]),
            slides: [primarySelectionSlide(slide)],
          })[0]!;
          usedInCarousel.add(String(match.asset.id));
          return match;
        } catch (error) {
          // F07 cover imagery is decorative, not structural. If no safe cover
          // image clears QA, render the already-supported text-first cover
          // instead of invoking ModelArk for decoration.
          if (input.layout === "ranking") return undefined;
          throw error;
        }
      });
      if (input.layout === "interactive-checklist") {
        const usedChecklistAssets = new Set<string>();
        gridMatches = input.slides.map((slide, index) => {
          const locked = lockedMatchesForSlide(slide, index)[0];
          if (locked) {
            usedChecklistAssets.add(String(locked.asset.id));
            return [locked];
          }
          const category = generationCategory(slide);
          const preferPersona = category === "self_care"
            || category === "fitness"
            || category === "outdoors"
            || (category === "home" && index % 2 === 0);
          const preferredSlide = { ...slide, assetType: preferPersona ? "persona" : "stock" };
          let selected: AssetMatch;
          try {
            selected = chooseAssets({ faceLock,
              assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              excludedAssetIds: new Set([...recentHookAssetIds, ...usedChecklistAssets]),
              slides: [preferredSlide],
            })[0]!;
          } catch {
            try {
              selected = chooseAssets({ faceLock,
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: new Set([...recentHookAssetIds, ...usedChecklistAssets]),
                slides: [slide],
              })[0]!;
            } catch {
              // Notes copy carries the meaning; its full-screen photo is
              // atmospheric support. Broaden only the visual description
              // while retaining the detected scene category and all selector
              // hard-safety/review constraints.
              selected = chooseAssets({ faceLock,
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: new Set([...recentHookAssetIds, ...usedChecklistAssets]),
                slides: [checklistBackgroundFallbackSlide(slide)],
              })[0]!;
            }
          }
          usedChecklistAssets.add(String(selected.asset.id));
          return [selected];
        });
        break;
      }
      if (input.layout === "routine-timeline") {
        const usedRoutineAssets = new Set<string>();
        gridMatches = input.slides.map((slide, index) => {
          const locked = lockedMatchesForSlide(slide, index)[0];
          if (locked) {
            usedRoutineAssets.add(String(locked.asset.id));
            return [locked];
          }
          const selected = chooseAssets({ faceLock,
            assets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            excludedAssetIds: new Set([...recentHookAssetIds, ...usedRoutineAssets]),
            slides: [primarySelectionSlide(slide)],
          })[0]!;
          usedRoutineAssets.add(String(selected.asset.id));
          return [selected];
        });
        break;
      }
      if (input.layout !== "grid-2x2" && !multiImageLayout) {
        gridMatches = input.slides.map((_, index) => [matches[index]!]);
        break;
      }

      const usedCarouselAssets = new Set<string>(matches.filter((match): match is AssetMatch => Boolean(match)).map((match) => String(match.asset.id)));
      if (multiImageLayout) {
        gridMatches = input.slides.map((slide, index) => {
          const locked = lockedMatchesForSlide(slide, index);
          const desiredCount = input.layout === "three-rect-educational"
            ? ((index === 0 || slide.role.toUpperCase() === "HOOK") ? 2 : 3)
            : input.layout === "editorial-asym-hero"
              ? 3
            : input.layout === "editorial-collage"
              ? 2
            : input.layout === "lifestyle-3stack"
              ? ((index === 0 || slide.role.toUpperCase() === "HOOK") ? 1 : 3)
            : input.layout === "ranking"
              ? rankingAssetCountForSlide(slide)
              : (index === 0 || slide.role.toUpperCase() === "HOOK") ? 2 : 1;
          if (desiredCount === 0) return [];
          const primary = locked[0] ?? matches[index];
          if (!primary) {
            if (input.layout === "ranking") return [];
            throw new Error(`ASSET_SELECTION_MISSING:slide_${slide.position}`);
          }
          if (desiredCount === 1) return [primary];
          const selected: AssetMatch[] = locked.length ? locked.slice(0, desiredCount) : [primary];
          selected.forEach((match) => usedCarouselAssets.add(String(match.asset.id)));
          while (selected.length < desiredCount) {
            let supportSlide: GeneratedSlide = slide;
            try {
              const needsAppScreenshot = requiresOfficialAppScreenshot(slide);
              const alreadyHasAppScreenshot = selected.some((match) => match.asset.source_type === "app_screenshot");
              supportSlide = needsAppScreenshot && !alreadyHasAppScreenshot
                ? slide
                : input.layout === "three-rect-educational"
                  ? educationalAssetSlideForSlot(slide, selected.length)
                  : {
                      ...withoutAppScreenshotDirective(slide),
                      position: Math.max(2, slide.position),
                      role: "SUPPORT",
                      // F01 support photos: the persona's face or faceless stock
                      // (food, objects, settings). Persona-only needed ~19 photos
                      // of one face per carousel and blocked most F01 renders.
                      assetType: "stock",
                    };
              const next = chooseAssets({ faceLock,
                assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: usedCarouselAssets,
                facelessStockOnly: input.layout === "lifestyle-3stack",
                slides: [supportSlide],
              })[0]!;
              selected.push(next);
              usedCarouselAssets.add(String(next.asset.id));
            } catch (error) {
              // Ranking cover photos are optional. One missing decorative
              // support image must never create an image-generation dependency.
              if (input.layout === "ranking") return [];
              // A support photo is decorative: the closest eligible image (the
              // locked face or faceless stock) beats blocking the carousel.
              try {
                const best = chooseAssets({ faceLock,
                  assets,
                  carouselType: input.carouselType,
                  personaId: input.personaId,
                  excludedAssetIds: usedCarouselAssets,
                  facelessStockOnly: input.layout === "lifestyle-3stack",
                  acceptBest: true,
                  slides: [supportSlide],
                })[0];
                if (best) {
                  selected.push({ ...best, thresholdBypassed: true });
                  usedCarouselAssets.add(String(best.asset.id));
                  continue;
                }
              } catch {
                // Fall through to the rerender fallback below.
              }
              const fallback = rerenderSupportFallback(primary, usedCarouselAssets);
              if (fallback) {
                selected.push(fallback);
                usedCarouselAssets.add(String(fallback.asset.id));
                continue;
              }
              const message = error instanceof Error ? error.message : String(error);
              throw new Error(`${message}:slide_${slide.position}`);
            }
          }
          return selected;
        });
        break;
      }

      const usedGridAssets = new Set<string>();
      gridMatches = input.slides.map((slide, index) => {
        const locked = lockedMatchesForSlide(slide, index);
        const primary = locked[0] ?? matches[index];
        if (!primary) throw new Error(`ASSET_SELECTION_MISSING:slide_${slide.position}`);
        usedGridAssets.add(String(primary.asset.id));
        const isHook = index === 0 || slide.role.toUpperCase() === "HOOK";
        if (isHook) return [primary];
        if (locked.length >= 4) return locked.slice(0, 4);
        if (locked.length >= 2) return [locked[0]!, locked[1]!, locked[1]!, locked[0]!];

        const supportSlide = requiresOfficialAppScreenshot(slide)
          ? slide
          : gridAssetSlideForSlot(slide, 1);
        let secondary: AssetMatch;
        try {
          // Same rule as F01 supports: the locked face or faceless stock,
          // never a stranger's face next to the persona's.
          secondary = chooseAssets({ faceLock,
            assets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            excludedAssetIds: new Set([...usedGridAssets, String(primary.asset.id)]),
            facelessStockOnly: true,
            slides: [supportSlide],
          })[0]!;
        } catch {
          // Prefer carousel-wide novelty, but do not make novelty itself a
          // render blocker. The closest unused photo comes first (a live F08
          // otherwise repeated one bed photo on five slides); reuse elsewhere
          // is the last resort, a duplicate within this 2x2 slide never.
          const closest = (excluded: Set<string>) => chooseAssets({ faceLock,
            assets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            excludedAssetIds: excluded,
            facelessStockOnly: true,
            acceptBest: true,
            slides: [supportSlide],
          })[0];
          let unused: AssetMatch | undefined;
          try {
            unused = closest(new Set([...usedGridAssets, String(primary.asset.id)]));
          } catch {
            unused = undefined;
          }
          try {
            secondary = unused ?? closest(new Set([String(primary.asset.id)]))!;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${message}:slide_${slide.position}`);
          }
          if (!secondary) throw new Error(`ASSET_SELECTION_MISSING:slide_${slide.position}`);
        }
        usedGridAssets.add(String(secondary.asset.id));
        return [primary, secondary, secondary, primary];
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const position = Number(message.match(/slide_(\d+)/)?.[1] ?? 0);
      if (!position || repairedPositions.has(position)) throw error;
      const failedSlide = input.slides[position - 1]!;
      const isHook = failedSlide.position === 1 || failedSlide.role.toUpperCase() === "HOOK";
      // A repaired image is locked onto its slide (repairedAssetByPosition),
      // so every format can be repaired, including stock-led F04 main images
      // and F05 backgrounds that the stock bank cannot cover.
      const repairCanBecomeSelectable = input.layout !== "ranking" || isHook;
      if (!repairCanBecomeSelectable) throw error;
      repairedPositions.add(position);
      // The repair is generated from the group master, so the whole carousel
      // is reselected on the master's face to keep a single face.
      faceLock.personaId = visualPersonaId;
      const repaired = await generateRepairAsset({ input, slide: failedSlide, position, usedReferenceIds });
      if (repaired?.id != null) repairedAssetByPosition.set(position, repaired.id);
      assets = await loadSelectableAssets();
    }
  }
  if (!gridMatches.length) throw new Error("CAROUSEL_RENDER_SELECTION_FAILED");
  return { assets, gridMatches };
}

export type RevisionAssetPool = { assets: SelectableAsset[]; assetMap: Map<string, SelectableAsset> };

// Picks the assets for one changed slide of a review revision: preserves the
// existing visuals unless the slide's visual changed, otherwise reselects.
export async function selectRevisionMatches(context: {
  input: RevisionRenderInput;
  pool: RevisionAssetPool;
  slide: GeneratedSlide;
  existing: ExistingSlideRow | undefined;
  previous: any;
  visualChange: boolean;
  usedReferenceIds: Set<string>;
}): Promise<AssetMatch[]> {
  const { input, pool, slide, existing, previous, visualChange, usedReferenceIds } = context;
  await loadVisualGroups();
  // Keep the face this slide already showed; otherwise the account's own face
  // when it has images, so a revised slide does not switch to a look-alike.
  const previousIds: string[] = Array.isArray(existing?.render_metadata?.asset_ids)
    ? existing!.render_metadata!.asset_ids.map(String)
    : existing?.asset_id != null ? [String(existing.asset_id)] : [];
  const previousFace = previousIds.map((id) => pool.assetMap.get(id)).find((asset) => asset?.source_type === "persona_generated")?.persona_id;
  const ownFaceAvailable = pool.assets.some((asset) => asset.source_type === "persona_generated" && asset.persona_id === input.personaId);
  const faceLock: { personaId?: string } = { personaId: previousFace ?? (ownFaceAvailable ? input.personaId : undefined) };
  let slideMatches: AssetMatch[] = [];
  const isTextOnlyRanking = input.layout === "ranking" && rankingAssetCountForSlide(slide) === 0;

  if (isTextOnlyRanking) {
    slideMatches = [];
  } else if (!visualChange) {
    const existingUrl = existing?.rendered_url ?? (typeof previous?.url === "string" ? previous.url : null);
    if (!existingUrl) throw new Error(`REVISION_EXISTING_RENDER_MISSING:slide_${slide.position}`);
    const assetIds: string[] = Array.isArray(existing?.render_metadata?.asset_ids)
      ? existing!.render_metadata!.asset_ids.map(String)
      : Array.isArray(previous?.assetIds)
        ? previous.assetIds.map(String)
        : existing?.asset_id != null
          ? [String(existing.asset_id)]
          : previous?.assetId != null ? [String(previous.assetId)] : [];
    if (!assetIds.length) throw new Error(`REVISION_EXISTING_ASSET_MISSING:slide_${slide.position}`);
    slideMatches = assetIds.map((id, index) => {
      const asset = pool.assetMap.get(id) ?? {
        id,
        filename: String(previous?.assetFilename ?? `preserved-${id}.jpg`),
        category: "preserved",
        subcategory: "review",
        orientation: "portrait",
        framing: "existing",
        activity: "",
        mood: "",
        colors: [],
        tags: [],
        public_url: existingUrl,
        use_count: 0,
        last_used_at: null,
        source_type: Array.isArray(previous?.assetSourceTypes) ? previous.assetSourceTypes[index] ?? "preserved" : "preserved",
      };
      return {
        asset,
        score: Number(existing?.render_metadata?.asset_score ?? previous?.score ?? 100),
        matchedTerms: Array.isArray(existing?.render_metadata?.matched_terms)
          ? existing!.render_metadata!.matched_terms
          : Array.isArray(previous?.matchedTerms) ? previous.matchedTerms : [],
        fallbackPath: pool.assetMap.has(id) ? "review_preserved_visual" : "review_preserved_render_url",
        thresholdBypassed: true,
      } satisfies AssetMatch;
    });
  } else {
    let selected = false;
    for (let attempt = 0; attempt < 2 && !selected; attempt += 1) {
      try {
        const isHook = slide.position === 1 || slide.role.toUpperCase() === "HOOK";
        if (input.layout === "ranking") {
          if (rankingAssetCountForSlide(slide) === 0) {
            slideMatches = [];
          } else {
            try {
              const primary = chooseAssets({ faceLock,
                assets: pool.assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                slides: [{ ...withoutAppScreenshotDirective(slide), assetType: slide.assetType === "text_only" ? "stock" : (slide.assetType ?? "stock") }],
              })[0]!;
              const support = chooseAssets({ faceLock,
                assets: pool.assets,
                carouselType: input.carouselType,
                personaId: input.personaId,
                excludedAssetIds: new Set([String(primary.asset.id)]),
                slides: [{ ...withoutAppScreenshotDirective(slide), position: Math.max(2, slide.position), role: "SUPPORT", assetType: "stock" }],
              })[0]!;
              slideMatches = [primary, support];
            } catch {
              // Same contract as the main renderer: F07 can always fall back
              // to its text-first cover during review edits/rerenders.
              slideMatches = [];
            }
          }
        } else if (input.layout === "grid-2x2" && !isHook) {
          const personaAssets = pool.assets.filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === input.personaId);
          const personaMatch = chooseAssets({ faceLock,
            assets: personaAssets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            slides: [{ ...withoutAppScreenshotDirective(slide), assetType: "persona" }],
          })[0]!;
          if (requiresOfficialAppScreenshot(slide)) {
            const appMatch = chooseAssets({ faceLock,
              assets: pool.assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              excludedAssetIds: new Set([String(personaMatch.asset.id)]),
              slides: [{ ...slide, assetType: "stock" }],
            })[0]!;
            slideMatches = [personaMatch, appMatch, appMatch, personaMatch];
          } else {
            const secondPersona = chooseAssets({ faceLock,
              assets: personaAssets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              personaOnly: true,
              excludedAssetIds: new Set([String(personaMatch.asset.id)]),
              slides: [{ ...withoutAppScreenshotDirective(slide), assetType: "persona" }],
            })[0]!;
            slideMatches = [personaMatch, secondPersona, secondPersona, personaMatch];
          }
        } else if (input.layout === "three-rect-educational" || input.layout === "editorial-asym-hero") {
          const used = new Set<string>();
          slideMatches = [];
          const desiredCount = input.layout === "three-rect-educational" && isHook ? 2 : 3;
          while (slideMatches.length < desiredCount) {
            const next = chooseAssets({ faceLock,
              assets: pool.assets,
              carouselType: input.carouselType,
              personaId: input.personaId,
              excludedAssetIds: used,
              slides: [{ ...slide, assetType: slide.assetType === "text_only" ? "stock" : (slide.assetType ?? "stock") }],
            })[0]!;
            slideMatches.push(next);
            used.add(String(next.asset.id));
          }
        } else {
          slideMatches = chooseAssets({ faceLock,
            assets: pool.assets,
            carouselType: input.carouselType,
            personaId: input.personaId,
            slides: [slide],
          });
        }
        selected = true;
      } catch (error) {
        if (input.layout === "ranking") {
          slideMatches = [];
          selected = true;
          continue;
        }
        if (attempt > 0) throw error;
        // A repair has the master's face; on a carousel showing a look-alike
        // it would mix two faces, so the operator picks an image instead.
        const master = visualPersonaIdFor(input.personaId);
        if (faceLock.personaId && faceLock.personaId !== master) throw new Error(`REVISION_FACE_MISMATCH:${faceLock.personaId}:slide_${slide.position}`);
        await generateRepairAsset({ input, slide, position: slide.position, usedReferenceIds });
        pool.assets = await loadSelectableAssets();
        pool.assetMap.clear();
        pool.assets.forEach((asset) => pool.assetMap.set(String(asset.id), asset));
      }
    }
  }
  return slideMatches;
}
