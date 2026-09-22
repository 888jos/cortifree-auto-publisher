import { dataBackend } from "./data-backend";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";

export type SelectableAsset = {
  id: string; filename: string; category: string; subcategory: string; orientation: string; framing: string;
  activity: string; mood: string; scene?: string; good_for?: string[]; colors: string[]; tags: string[]; public_url: string; use_count: number; last_used_at: string | null;
  source_type?: string; persona_id?: string | null;
  visual_description?: string; visible_objects?: string[]; visible_actions?: string[]; setting?: string;
  people_visibility?: string; body_parts_visible?: string[]; composition?: string; camera_angle?: string;
  lighting?: string; dominant_colors?: string[]; text_in_image?: string; specific_details?: string;
  visual_tagging_schema?: string; visual_review_status?: string; visual_reviewed_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type JitSelectableAsset = SelectableAsset & { source_type?: string; persona_id?: string | null };
export type JitAssetDecision =
  | { action: "reuse_persona" | "reuse_stock"; match: AssetMatch }
  | { action: "generate"; reason: string };

export type AssetMatch = {
  asset: SelectableAsset;
  score: number;
  matchedTerms: string[];
  candidatePoolSize?: number;
  matchedDimensions?: string[];
  fallbackPath?: string;
  threshold?: number;
  thresholdBypassed?: boolean;
  visualIntent?: VisualIntent;
  matchedSettings?: string[];
  matchedCompositions?: string[];
  descriptionScore?: number;
  objectScore?: number;
  actionScore?: number;
  settingScore?: number;
  compositionScore?: number;
  repetitionPenalty?: number;
  topCandidates?: Array<{ asset_id: string; score: number; matched_objects: string[]; matched_actions: string[]; matched_settings: string[]; matched_compositions: string[]; category_bonus: number }>;
  categoryBonus?: number;
};

export type VisualIntent = {
  description: string;
  desired_objects: string[];
  desired_actions: string[];
  desired_settings: string[];
  preferred_compositions: string[];
  people_preference: "any" | "person" | "no_person";
  avoid: string[];
};

const AUTO_THRESHOLD = 60;
const CRITICAL_THRESHOLD = 65;
const EXPLICIT_FALLBACK_THRESHOLD = 50;

const categoryByType: Record<string, string[]> = {
  C01_MORNING_ROUTINE: ["morning", "food", "self_care", "fitness"],
  C02_CHECKLIST: ["morning", "stress_reset", "self_care", "work_study"],
  C03_THINGS_I_STOPPED: ["stress_reset", "morning", "work_study", "night"],
  C04_THINGS_I_STARTED: ["morning", "fitness", "food", "self_care"],
  C05_GLOW_UP: ["self_care", "fitness", "food", "morning"],
  C06_POV_RELATABLE: ["stress_reset", "work_study", "morning", "night"],
  C07_MISTAKES: ["stress_reset", "work_study", "morning", "food"],
  C08_MY_REALISTIC: ["morning", "self_care", "food", "work_study"],
  C09_LIST: ["morning", "self_care", "food", "fitness", "outdoors"],
  C10_BEFORE_AFTER: ["stress_reset", "morning", "self_care", "fitness"],
  C11_HORMONE_EDUCATION: ["food", "fitness", "morning", "self_care"],
  C12_NIGHT_ROUTINE: ["night", "self_care", "stress_reset"],
  C13_EDUCATIONAL_EXPLAINER: ["stress_reset", "work_study", "morning", "food", "self_care"],
  C14_STORY_TRANSFORMATION: ["self_care", "morning", "outdoors", "fitness", "work_study"],
};

const stopWords = new Set(["the", "and", "with", "this", "that", "your", "for", "from", "into", "one", "clear", "everyday", "lifestyle", "image", "photo", "slide", "natural"]);
function terms(value: string) {
  return [...new Set(value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((term) => term.length > 2 && !stopWords.has(term)))];
}

const visualSynonyms: Record<string, string> = {
  pilates_mat: "exercise_mat", yoga_mat: "exercise_mat", mat: "exercise_mat",
  sofa: "sofa", couch: "sofa", notebook: "notebook", journal: "notebook", running_shoes: "sneakers", sneakers: "sneakers", trainers: "sneakers", mobile: "phone", mobile_phone: "phone", smartphone: "phone",
  cup: "cup", mug: "cup", earbuds: "headphones", headphones: "headphones", desk: "work_surface", laptop: "laptop", laptop_computer: "laptop", macbook: "laptop", bath: "bathtub", bathtub: "bathtub",
  bedroom: "bedroom", home_interior: "indoor_room", indoor_room: "indoor_room",
};
function normalizeVisualTerm(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return visualSynonyms[normalized] ?? normalized;
}
function visualTerms(value: unknown) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[|,]/);
  return [...new Set(values.flatMap((item) => String(item).split(/\s+/).map(normalizeVisualTerm).filter((term) => term.length > 2)))];
}
function visualField(asset: SelectableAsset, field: string): unknown {
  const direct = (asset as unknown as Record<string, unknown>)[field];
  return direct !== undefined && direct !== null && direct !== "" ? direct : asset.metadata?.[field];
}
function assetVisualText(asset: SelectableAsset) {
  return visualTerms([
    visualField(asset, "visual_description"), visualField(asset, "visible_objects"), visualField(asset, "visible_actions"), visualField(asset, "setting"),
    visualField(asset, "specific_details"), visualField(asset, "composition"), visualField(asset, "people_visibility"), visualField(asset, "body_parts_visible"),
    visualField(asset, "camera_angle"), visualField(asset, "lighting"), visualField(asset, "dominant_colors"), visualField(asset, "text_in_image"),
  ]).join(" ");
}
function assetText(asset: SelectableAsset) {
  return `${assetVisualText(asset)} ${asset.filename} ${asset.category} ${asset.subcategory} ${asset.scene ?? ""} ${asset.framing} ${asset.activity} ${asset.mood} ${(asset.good_for ?? []).join(" ")} ${(asset.tags ?? []).join(" ")}`.toLowerCase();
}

function runtimeVisualMetadata(asset: SelectableAsset) {
  const metadata = asset.metadata ?? {};
  return {
    schema: String(asset.visual_tagging_schema ?? metadata.visual_tagging_schema ?? "").trim().toLowerCase(),
    reviewStatus: String(asset.visual_review_status ?? metadata.visual_review_status ?? "").trim().toUpperCase(),
    reviewedAt: asset.visual_reviewed_at ?? metadata.visual_reviewed_at ?? null,
  };
}

function isCanonicalReviewedStock(asset: SelectableAsset) {
  if (asset.source_type !== "stock") return true;
  const metadata = runtimeVisualMetadata(asset);
  return metadata.schema === "observable_v1" && metadata.reviewStatus === "IMAGE_INSPECTED_V1" && Boolean(metadata.reviewedAt);
}

function fieldTerms(value: unknown) {
  return terms(Array.isArray(value) ? value.join(" ") : String(value ?? ""));
}

function criticalSlide(slide: { position: number; role?: string; assetType?: string }) {
  return slide.position === 1 || slide.role?.toUpperCase() === "HOOK" || slide.assetType === "persona";
}

function assetIdentity(asset: SelectableAsset) {
  return (asset.filename || asset.public_url)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/(?:__|_)0*\d+$/g, "")
    .replace(/(?:__|_)v?0*\d+$/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

type SceneConstraint = { required: (value: string) => boolean; forbidden: (value: string) => boolean };

function sceneConstraint(slide: { headline: string; body: string; assetQuery: string; visualIntent: string }): SceneConstraint | null {
  const text = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.toLowerCase();
  const forbidden = (value: string) => /sauna|hammam|hamam|steam room|spa|jacuzzi|hot tub|bath(?:room)?|shower|pool|facial|massage|empty room/.test(value);
  if (/five-minute walk|walking|walk outside|outdoors|leafy street/.test(text)) {
    return { required: () => true, forbidden: (value) => forbidden(value) || /closet|wardrobe|skincare|flatlay|bedroom|bathroom|steam|hammam/.test(value) };
  }
  if (/evening reset|set up tomorrow|morning essential|bedroom at night/.test(text)) {
    return { required: () => true, forbidden: (value) => forbidden(value) || /closet|wardrobe|skincare|flatlay|walking|outdoors/.test(value) };
  }
  if (/finishing touch|hoops|claw clip|accessory|scent/.test(text)) {
    return { required: () => true, forbidden: (value) => forbidden(value) || /steam|hammam|skincare flatlay|cleaning supplies/.test(value) };
  }
  if (/skincare|lip balm|moisturizer|brows|beauty routine/.test(text)) {
    return { required: () => true, forbidden: (value) => forbidden(value) || /steam|hammam|closet|wardrobe|cleaning supplies|walking/.test(value) };
  }
  if (/closing portrait|smiling naturally|with tea|low-pressure/.test(text)) {
    return { required: () => true, forbidden: (value) => forbidden(value) || /closet|wardrobe|skincare|flatlay|cleaning supplies|steam|hammam/.test(value) };
  }
  if (/steaming|steamer|outfit|clothing rack|getting dressed|dress(?:ing)?|wardrobe|hanger/.test(text)) {
    return {
      required: (value) => /steam|steamer|outfit|clothing|dress|wardrobe|hanger|closet|getting dressed|wear/.test(value),
      forbidden,
    };
  }
  return null;
}

function compatibleWithScene(asset: SelectableAsset, constraint: SceneConstraint | null) {
  if (!constraint) return true;
  const text = assetText(asset);
  return !constraint.forbidden(text) && constraint.required(text);
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

/** Convert slide copy into observable visual requirements, never abstract
 * wellness concepts. This intentionally stays deterministic and local. */
export function deriveVisualIntent(slide: { headline: string; body: string; assetQuery: string; visualIntent: string }): VisualIntent {
  const text = `${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`.toLowerCase();
  const objects = new Set<string>();
  const actions = new Set<string>();
  const settings = new Set<string>();
  const compositions = new Set<string>();
  if (includesAny(text, ["mat", "pilates", "yoga", "foam roller", "stretch", "movement", "workout", "exercise"])) objects.add("exercise_mat");
  if (includesAny(text, ["foam roller", "roller"])) objects.add("foam_roller");
  if (includesAny(text, ["dumbbell", "weight"])) objects.add("dumbbells");
  if (includesAny(text, ["journal", "brain dump", "notebook", "write", "writing", "planner"])) { objects.add("notebook"); objects.add("pen"); }
  if (includesAny(text, ["phone", "alarm", "screen", "scroll", "text"])) objects.add("phone");
  if (includesAny(text, ["bed", "bedroom", "sleep", "night", "bedside"])) { objects.add("bed"); settings.add("bedroom"); }
  if (includesAny(text, ["bowl", "plate", "meal", "food", "snack", "breakfast", "lunch", "dinner", "eat"])) { objects.add("food"); compositions.add("food_layout"); }
  if (includesAny(text, ["laptop", "desk", "study", "work", "coffee shop"])) { objects.add("laptop"); settings.add("work_study"); }
  if (includesAny(text, ["mug", "cup", "tea", "coffee"])) objects.add("cup");
  if (includesAny(text, ["stretch", "pilates", "yoga", "walk", "walking", "movement", "workout", "run"])) actions.add("movement");
  if (includesAny(text, ["write", "writing", "journal", "brain dump", "plan"])) actions.add("writing");
  if (includesAny(text, ["prepare", "make", "cook", "pack", "meal prep"])) actions.add("preparing_food");
  if (includesAny(text, ["phone down", "put down", "stop checking", "unplug", "scroll"])) actions.add("putting_phone_down");
  if (includesAny(text, ["morning", "wake", "waking", "breakfast"])) settings.add("morning_home");
  if (includesAny(text, ["home", "room", "inside", "indoor", "sofa", "couch"])) settings.add("indoor_room");
  if (includesAny(text, ["outside", "outdoors", "street", "walk", "commute"])) settings.add("outdoors");
  if (objects.has("exercise_mat") || objects.has("foam_roller") || objects.has("dumbbells")) compositions.add("equipment_layout");
  if (actions.size || includesAny(text, ["woman", "person", "girl", "hands", "holding"])) compositions.add("person_activity_scene");
  if (objects.has("bed") || settings.has("bedroom")) compositions.add("bedroom_scene");
  if (objects.has("laptop") || objects.has("notebook")) compositions.add("desk_or_bed_scene");
  const people_preference = includesAny(text, ["no person", "without a person", "setup", "flat lay", "equipment layout"]) && !includesAny(text, ["woman", "person", "hands"])
    ? "no_person" : includesAny(text, ["woman", "person", "girl", "hand writing", "holding"]) ? "person" : "any";
  return {
    description: slide.visualIntent || slide.assetQuery || slide.headline,
    desired_objects: [...objects], desired_actions: [...actions], desired_settings: [...settings],
    preferred_compositions: [...compositions], people_preference,
    avoid: includesAny(text, ["large text", "text overlay", "caption"]) ? ["text_in_image"] : [],
  };
}

function overlap(desired: string[], actual: string[]) {
  const actualSet = new Set(actual.flatMap(normalizeVisualTerm));
  return desired.filter((term) => actualSet.has(normalizeVisualTerm(term)));
}

function semanticTokenOverlap(desired: string, actual: string) {
  const wanted = new Set(visualTerms(desired));
  const available = new Set(visualTerms(actual));
  if (!wanted.size) return 0;
  return [...wanted].filter((term) => available.has(term)).length / wanted.size;
}

export async function loadSelectableAssets(): Promise<SelectableAsset[]> {
  const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,filename,category,subcategory,scene,good_for,orientation,framing,activity,mood,colors,tags,public_url,use_count,last_used_at,source_type,persona_id,visual_description,visible_objects,visible_actions,setting,people_visibility,body_parts_visible,composition,camera_angle,lighting,dominant_colors,text_in_image,specific_details,visual_tagging_schema,visual_review_status,visual_reviewed_at,metadata&enabled=eq.true&public_url=not.is.null&limit=1000`);
  if (!response.ok) throw new Error(`Cannot load assets: ${await response.text()}`);
  return await response.json() as SelectableAsset[];
}

export function chooseAssets(options: {
  assets: SelectableAsset[];
  carouselType: string;
  personaId?: string;
  personaOnly?: boolean;
  slides: Array<{ position: number; role?: string; headline: string; body: string; assetQuery: string; visualIntent: string; assetType?: string }>;
}): AssetMatch[] {
  const used = new Set<string>();
  const usedIdentities = new Set<string>();
  const usedVisualDescriptions: string[] = [];
  return options.slides.map((slide) => {
    const intent = deriveVisualIntent(slide);
    const finalUse = options.assets.filter((asset) => isCanonicalReviewedStock(asset) || (asset.source_type === "persona_generated" && (!options.personaId || asset.persona_id === options.personaId)));
    const constraint = sceneConstraint(slide);
    const hookNeedsPersona = slide.position === 1 || slide.role?.toUpperCase() === "HOOK";
    const requiresPersonaScene = /steaming|steamer|outfit|clothing rack|getting dressed/.test(`${slide.assetQuery} ${slide.visualIntent}`.toLowerCase());
    const requested = hookNeedsPersona || slide.assetType === "persona"
      ? finalUse.filter((asset) => asset.source_type === "persona_generated" && asset.persona_id === options.personaId)
      : slide.assetType === "stock" || slide.assetType === "text_only"
        ? finalUse.filter((asset) => asset.source_type === "stock")
        : finalUse;
    // Keep drafts renderable while persona-generated assets are still syncing.
    // A stock lifestyle image is preferable to a completely invisible carousel;
    // the generated copy still remains associated with the requested persona.
    if (hookNeedsPersona && requested.length === 0) {
      throw new Error(`PERSONA_HOOK_ASSET_REQUIRED:${options.personaId ?? "unknown"}:slide_${slide.position}`);
    }
    const usableRequested = !options.personaOnly && slide.assetType === "persona" && requested.length < 4 && !hookNeedsPersona && !requiresPersonaScene
      ? finalUse.filter((asset) => asset.source_type === "stock")
      : requested;
    if (options.personaOnly && usableRequested.length < options.slides.length) {
      throw new Error(`PERSONA_ASSETS_REQUIRED:${options.personaId ?? "unknown"}:need_${options.slides.length}:found_${usableRequested.length}`);
    }
    // For faceswapped persona assets, identity continuity is mandatory and
    // the generated scene is already the visual reference. Do not discard a
    // valid face asset only because its indexed keywords are sparse.
    const compatible = options.personaOnly
      ? usableRequested
      : usableRequested.filter((asset) => asset.source_type === "persona_generated" || compatibleWithScene(asset, constraint));
    const unused = compatible.filter((asset) => !used.has(asset.id) && (options.personaOnly || !usedIdentities.has(assetIdentity(asset))));
    const distinct = unused.length || hookNeedsPersona ? compatible : [];
    const candidates = distinct.map((asset) => {
      const haystack = assetText(asset);
      const visualDescription = `${visualField(asset, "visual_description") ?? ""} ${visualField(asset, "specific_details") ?? ""}`;
      const visibleObjects = visualTerms(visualField(asset, "visible_objects"));
      const visibleActions = visualTerms(visualField(asset, "visible_actions"));
      const visibleSettings = visualTerms(visualField(asset, "setting"));
      const visibleComposition = visualTerms(visualField(asset, "composition"));
      const visiblePeople = normalizeVisualTerm(String(visualField(asset, "people_visibility") ?? ""));
      const visibleCamera = visualTerms(visualField(asset, "camera_angle"));
      const visibleLighting = visualTerms(visualField(asset, "lighting"));
      const visibleText = visualTerms(visualField(asset, "text_in_image"));
      const matchedObjects = overlap(intent.desired_objects, [...visibleObjects, ...visualTerms(visualDescription), ...visualTerms(asset.filename)]);
      const matchedActions = overlap(intent.desired_actions, [...visibleActions, ...visualTerms(visualDescription), ...visualTerms(asset.activity)]);
      const matchedSettings = overlap(intent.desired_settings, [...visibleSettings, ...visualTerms(visualDescription), ...visualTerms(asset.setting), ...visualTerms(asset.scene)]);
      const matchedCompositions = overlap(intent.preferred_compositions, visibleComposition);
      const semanticScore = semanticTokenOverlap(intent.description, visualDescription || haystack);
      const objectScore = intent.desired_objects.length ? matchedObjects.length / intent.desired_objects.length : 0;
      const actionScore = intent.desired_actions.length ? matchedActions.length / intent.desired_actions.length : 0;
      const settingScore = intent.desired_settings.length ? matchedSettings.length / intent.desired_settings.length : 0;
      const compositionScore = intent.preferred_compositions.length ? matchedCompositions.length / intent.preferred_compositions.length : 0;
      const peopleScore = intent.people_preference === "any" || !visiblePeople ? 1 : intent.people_preference === "no_person" ? (visiblePeople === "no_person" ? 1 : 0) : visiblePeople !== "no_person" ? 1 : 0;
      const cameraScore = intent.preferred_compositions.some((item) => /equipment|food/.test(item)) && visibleCamera.length ? 1 : 0;
      const lightingScore = intent.desired_settings.some((item) => /morning|evening|night/.test(item)) && visibleLighting.length ? 1 : 0;
      const specificDetails = visualTerms(visualField(asset, "specific_details"));
      const detailScore = intent.desired_objects.filter((term) => specificDetails.includes(normalizeVisualTerm(term))).length / Math.max(1, intent.desired_objects.length);
      const categoryBonus = categoryByType[options.carouselType]?.includes(asset.category) ? 4 : 0;
      const legacyQueryTerms = terms(`${slide.assetQuery ?? ""} ${slide.visualIntent ?? ""}`);
      const legacyQueryMatches = legacyQueryTerms.filter((term) => haystack.includes(term));
      const legacyQueryScore = Math.min(20, legacyQueryMatches.length * 2.5);
      // Preserve confidence for persona scenes whose older records predate observable
      // tagging, without letting this legacy path affect stock ranking.
      const personaSceneScore = slide.assetType === "persona" && asset.source_type === "persona_generated" && requiresPersonaScene ? 20 : 0;
      const textPenalty = visibleText.length && !intent.desired_objects.includes("laptop") ? 5 : 0;
      let score = semanticScore * 30 + objectScore * 25 + actionScore * 10 + settingScore * 10 + detailScore * 10 + compositionScore * 5 + peopleScore * 4 + cameraScore * 3 + lightingScore * 2 + categoryBonus + legacyQueryScore + personaSceneScore - textPenalty;
      // Legacy metadata remains useful only as a weak tie-breaker.
      score += Math.min(3, fieldTerms(asset.good_for).filter((term) => intent.desired_settings.includes(normalizeVisualTerm(term))).length);
      score += asset.orientation === "portrait" ? 2 : asset.orientation === "square" ? 1 : 0;
      if (slide.assetType === "persona" && asset.source_type === "persona_generated") score += 34;
      if (hookNeedsPersona && asset.source_type === "persona_generated") score += 12;
      const visualRepetitionPenalty = usedVisualDescriptions.some((previous) => semanticTokenOverlap(previous, visualDescription) >= 0.75) ? 10 : 0;
      const repetitionPenalty = Math.min(asset.use_count ?? 0, 12) * 1.8 + (asset.last_used_at && Date.now() - new Date(asset.last_used_at).getTime() < 21 * 86_400_000 ? 16 : 0) + visualRepetitionPenalty;
      score -= repetitionPenalty;
      if (used.has(asset.id)) score -= 1_000;
      const matchedDimensions = [
        semanticScore ? "visual_description" : "",
        matchedObjects.length ? "visible_objects" : "",
        matchedActions.length ? "visible_actions" : "",
        matchedSettings.length ? "setting" : "",
        matchedCompositions.length ? "composition" : "",
        peopleScore ? "people_visibility" : "",
        cameraScore ? "camera_angle" : "",
        lightingScore ? "lighting" : "",
        detailScore ? "specific_details" : "",
        legacyQueryMatches.length ? "legacy_visual_text" : "",
      ].filter(Boolean);
      return { asset, score, matchedTerms: matchedObjects.concat(matchedActions), matchedDimensions, matchedObjects, matchedActions, matchedSettings, matchedCompositions, semanticScore, categoryBonus, descriptionScore: semanticScore, objectScore, actionScore, settingScore, compositionScore, repetitionPenalty };
    }).sort((a, b) => b.score - a.score || a.asset.use_count - b.asset.use_count);
    const threshold = criticalSlide(slide) ? CRITICAL_THRESHOLD : AUTO_THRESHOLD;
    const selectedCandidate = candidates.find((candidate) => candidate.score >= threshold);
    const fallbackCandidate = !selectedCandidate && !criticalSlide(slide)
      ? candidates.find((candidate) => candidate.score >= EXPLICIT_FALLBACK_THRESHOLD)
      : undefined;
    const selected = selectedCandidate ?? fallbackCandidate;
    if (!selected) {
      const topScore = candidates[0]?.score ?? 0;
      throw new Error(`LOW_CONFIDENCE_ASSET:slide_${slide.position}:score_${topScore.toFixed(1)}:required_${threshold}:candidates_${candidates.length}`);
    }
    used.add(selected.asset.id);
    usedIdentities.add(assetIdentity(selected.asset));
    const selectedDescription = visualField(selected.asset, "visual_description");
    if (selectedDescription) usedVisualDescriptions.push(String(selectedDescription));
    return {
      ...selected,
      score: Number(selected.score.toFixed(2)),
      candidatePoolSize: compatible.length,
      fallbackPath: selectedCandidate ? "primary" : "explicit_noncritical_fallback",
      threshold,
      thresholdBypassed: false,
      visualIntent: intent,
      matchedDimensions: selected.matchedDimensions,
      matchedSettings: selected.matchedSettings,
      matchedCompositions: selected.matchedCompositions,
      descriptionScore: selected.descriptionScore,
      objectScore: selected.objectScore,
      actionScore: selected.actionScore,
      settingScore: selected.settingScore,
      compositionScore: selected.compositionScore,
      repetitionPenalty: selected.repetitionPenalty,
      categoryBonus: selected.categoryBonus,
      topCandidates: candidates.slice(0, 3).map((candidate) => ({ asset_id: String(candidate.asset.id), score: Number(candidate.score.toFixed(2)), matched_objects: candidate.matchedObjects, matched_actions: candidate.matchedActions, matched_settings: candidate.matchedSettings, matched_compositions: candidate.matchedCompositions, category_bonus: candidate.categoryBonus })),
    };
  });
}

export function selectAssetOrGeneration(options: {
  assets: JitSelectableAsset[];
  personaId: string;
  category: string;
  visualIntent: string;
  minimumScore?: number;
}): JitAssetDecision {
  const minimumScore = options.minimumScore ?? AUTO_THRESHOLD;
  const score = (asset: JitSelectableAsset) => {
    const queryTerms = terms(`${options.category} ${options.visualIntent}`);
    const haystack = assetText(asset);
    const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
    let value = matchedTerms.length * 8 + (asset.category === options.category ? 24 : 0);
    value += fieldTerms(asset.scene).some((term) => matchedTerms.includes(term)) ? 12 : 0;
    value += fieldTerms(asset.good_for).some((term) => matchedTerms.includes(term)) ? 12 : 0;
    value += asset.orientation === "portrait" ? 8 : 0;
    value += asset.source_type === "persona_generated" ? 12 : asset.source_type === "stock" ? 8 : 0;
    value -= Math.min(asset.use_count ?? 0, 12) * 1.8;
    if (asset.last_used_at && Date.now() - new Date(asset.last_used_at).getTime() < 21 * 86_400_000) value -= 16;
    return { asset, score: Number(value.toFixed(2)), matchedTerms };
  };
  const persona = options.assets
    .filter((asset) => asset.persona_id === options.personaId && asset.source_type === "persona_generated")
    .map(score).sort((a, b) => b.score - a.score)[0];
  if (persona && persona.score >= minimumScore) return { action: "reuse_persona", match: persona };
  const stock = options.assets.filter((asset) => asset.source_type === "stock").map(score).sort((a, b) => b.score - a.score)[0];
  if (stock && stock.score >= minimumScore) return { action: "reuse_stock", match: stock };
  return { action: "generate", reason: "No suitable persona or stock asset met the relevance threshold" };
}
