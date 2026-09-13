import { supabase } from "./supabase";
import { CORTIFREE_WORKSPACE_ID } from "./workspace";

export type SelectableAsset = {
  id: string; filename: string; category: string; subcategory: string; orientation: string; framing: string;
  activity: string; mood: string; colors: string[]; tags: string[]; public_url: string; use_count: number; last_used_at: string | null;
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
};

const stopWords = new Set(["the", "and", "with", "this", "that", "your", "for", "from", "into", "one", "clear", "everyday", "lifestyle", "image", "photo", "slide", "natural"]);
function terms(value: string) {
  return [...new Set(value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((term) => term.length > 2 && !stopWords.has(term)))];
}

function assetText(asset: SelectableAsset) {
  return `${asset.filename} ${asset.category} ${asset.subcategory} ${asset.framing} ${asset.activity} ${asset.mood} ${(asset.tags ?? []).join(" ")}`.toLowerCase();
}

export async function loadSelectableAssets(): Promise<SelectableAsset[]> {
  const response = await supabase(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&storage_bucket=eq.cortifree-assets&select=id,filename,category,subcategory,orientation,framing,activity,mood,colors,tags,public_url,use_count,last_used_at&enabled=eq.true&public_url=not.is.null&limit=1000`);
  if (!response.ok) throw new Error(`Cannot load assets: ${await response.text()}`);
  return await response.json() as SelectableAsset[];
}

export function chooseAssets(options: {
  assets: SelectableAsset[];
  carouselType: string;
  slides: Array<{ position: number; headline: string; body: string; assetQuery: string; visualIntent: string }>;
}): AssetMatch[] {
  const preferred = categoryByType[options.carouselType] ?? ["morning", "self_care", "food", "fitness", "outdoors", "work_study", "stress_reset", "night"];
  const used = new Set<string>();
  return options.slides.map((slide) => {
    const queryTerms = terms(`${slide.headline} ${slide.body} ${slide.assetQuery} ${slide.visualIntent}`);
    const candidates = options.assets.map((asset) => {
      const haystack = assetText(asset);
      const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
      const categoryRank = preferred.indexOf(asset.category);
      let score = categoryRank === 0 ? 44 : categoryRank > 0 ? Math.max(12, 34 - categoryRank * 7) : -20;
      score += matchedTerms.length * 7;
      score += asset.orientation === "portrait" ? 12 : asset.orientation === "square" ? 4 : 0;
      score += asset.framing === "wide" && /wide|room|landscape/.test(slide.visualIntent.toLowerCase()) ? 8 : 0;
      score -= Math.min(asset.use_count ?? 0, 12) * 1.8;
      if (asset.last_used_at && Date.now() - new Date(asset.last_used_at).getTime() < 14 * 86_400_000) score -= 16;
      if (used.has(asset.id)) score -= 1_000;
      return { asset, score, matchedTerms };
    }).sort((a, b) => b.score - a.score || a.asset.use_count - b.asset.use_count);
    const selected = candidates[0];
    if (!selected) throw new Error(`No usable asset for slide ${slide.position}`);
    used.add(selected.asset.id);
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
    if (asset.last_used_at && Date.now() - new Date(asset.last_used_at).getTime() < 14 * 86_400_000) value -= 16;
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
