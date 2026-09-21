import { dataBackend } from "./data-backend";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";

export type SelectableAsset = {
  id: string; filename: string; category: string; subcategory: string; orientation: string; framing: string;
  activity: string; mood: string; colors: string[]; tags: string[]; public_url: string; use_count: number; last_used_at: string | null;
  source_type?: string; persona_id?: string | null;
};

export type JitSelectableAsset = SelectableAsset & { source_type?: string; persona_id?: string | null };
export type JitAssetDecision =
  | { action: "reuse_persona" | "reuse_stock"; match: AssetMatch }
  | { action: "generate"; reason: string };

export type AssetMatch = { asset: SelectableAsset; score: number; matchedTerms: string[] };

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

function assetText(asset: SelectableAsset) {
  return `${asset.filename} ${asset.category} ${asset.subcategory} ${asset.framing} ${asset.activity} ${asset.mood} ${(asset.tags ?? []).join(" ")}`.toLowerCase();
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

export async function loadSelectableAssets(): Promise<SelectableAsset[]> {
  const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,filename,category,subcategory,orientation,framing,activity,mood,colors,tags,public_url,use_count,last_used_at,source_type,persona_id&enabled=eq.true&public_url=not.is.null&limit=1000`);
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
  const preferred = categoryByType[options.carouselType] ?? ["morning", "self_care", "food", "fitness", "outdoors", "work_study", "stress_reset", "night"];
  const used = new Set<string>();
  const usedIdentities = new Set<string>();
  return options.slides.map((slide) => {
    const queryTerms = terms(`${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`);
    const finalUse = options.assets.filter((asset) => asset.source_type === "stock" || (asset.source_type === "persona_generated" && (!options.personaId || asset.persona_id === options.personaId)));
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
    const compatible = usableRequested.filter((asset) => compatibleWithScene(asset, constraint));
    const unused = compatible.filter((asset) => !used.has(asset.id) && !usedIdentities.has(assetIdentity(asset)));
    const distinct = unused.length || hookNeedsPersona ? compatible : [];
    const candidates = distinct.map((asset) => {
      const haystack = assetText(asset);
      const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
      const categoryRank = preferred.indexOf(asset.category);
      let score = categoryRank === 0 ? 44 : categoryRank > 0 ? Math.max(12, 34 - categoryRank * 7) : -20;
      score += matchedTerms.length * 7;
      score += asset.orientation === "portrait" ? 12 : asset.orientation === "square" ? 4 : 0;
      if (slide.assetType === "persona" && asset.source_type === "persona_generated") score += 28;
      score += asset.framing === "wide" && /wide|room|landscape/.test(slide.visualIntent.toLowerCase()) ? 8 : 0;
      score -= Math.min(asset.use_count ?? 0, 12) * 1.8;
      if (asset.last_used_at && Date.now() - new Date(asset.last_used_at).getTime() < 21 * 86_400_000) score -= 16;
      if (used.has(asset.id)) score -= 1_000;
      return { asset, score, matchedTerms };
    }).sort((a, b) => b.score - a.score || a.asset.use_count - b.asset.use_count);
    const fallbackCandidates = !candidates.length && !hookNeedsPersona
      ? usableRequested
        .filter((asset) => !used.has(asset.id) && !usedIdentities.has(assetIdentity(asset)) && (!constraint || !constraint.forbidden(assetText(asset))))
        .map((asset) => ({ asset, score: -5, matchedTerms: [] as string[] }))
      : [];
    const selected = candidates[0] ?? fallbackCandidates[0];
    if (!selected) {
      if (constraint || !hookNeedsPersona) throw new Error(`NO_COMPATIBLE_ASSET:GENERATE_REQUIRED:slide_${slide.position}`);
      throw new Error(`No usable asset for slide ${slide.position}`);
    }
    used.add(selected.asset.id);
    usedIdentities.add(assetIdentity(selected.asset));
    return { ...selected, score: Number(selected.score.toFixed(2)) };
  });
}

export function selectAssetOrGeneration(options: {
  assets: JitSelectableAsset[];
  personaId: string;
  category: string;
  visualIntent: string;
  minimumScore?: number;
}): JitAssetDecision {
  const minimumScore = options.minimumScore ?? 20;
  const score = (asset: JitSelectableAsset) => {
    const queryTerms = terms(`${options.category} ${options.visualIntent}`);
    const haystack = assetText(asset);
    const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
    let value = matchedTerms.length * 9 + (asset.category === options.category ? 24 : 0);
    value += asset.orientation === "portrait" ? 8 : 0;
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
