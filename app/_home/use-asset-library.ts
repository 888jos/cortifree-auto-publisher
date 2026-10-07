import { useMemo, useState } from "react";
import type { View } from "./data";
import type { AssetPreview, AssetTab, ImageGenerationStatus, PersonaScene, PersonaSummary, VisualReferenceSummary } from "./types";
import { getJson, useApi } from "./use-api";

// Asset library data (assets, personas, visual references, image-generation
// status and batch scenes) loaded for the Asset library and Content studio tabs.
export function useAssetLibrary(active: View, setNotice: (notice: string) => void) {
  const [assetPreviews, setAssetPreviews] = useState<AssetPreview[]>([]);
  const [assetTab, setAssetTab] = useState<AssetTab>("All Assets");
  const [assetQuery, setAssetQuery] = useState("");
  const [referenceCategory, setReferenceCategory] = useState("all");
  const [visualReferences, setVisualReferences] = useState<VisualReferenceSummary[]>([]);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [imageGenerationStatus, setImageGenerationStatus] = useState<ImageGenerationStatus | null>(null);
  const [batchScenes, setBatchScenes] = useState<PersonaScene[]>([]);

  const filteredAssetPreviews = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    const sourceByTab: Partial<Record<AssetTab, string>> = {
      Stock: "stock", "Persona Generated": "persona_generated", Masters: "persona_master",
    };
    const expectedSource = sourceByTab[assetTab];
    return assetPreviews.filter((asset) =>
      (!expectedSource || asset.source_type === expectedSource)
      && (!query || [asset.metadata?.asset_name ?? "", asset.visual_description ?? "", asset.filename, asset.category, asset.subcategory, asset.persona_id ?? "", asset.mood].join(" ").toLowerCase().includes(query)),
    );
  }, [assetPreviews, assetQuery, assetTab]);
  const filteredVisualReferences = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    return visualReferences.filter((reference) =>
      (referenceCategory === "all" || reference.category === referenceCategory)
      && (!query || JSON.stringify(reference).toLowerCase().includes(query)),
    );
  }, [assetQuery, referenceCategory, visualReferences]);
  const visibleAssetGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of filteredAssetPreviews) counts.set(asset.category || "other", (counts.get(asset.category || "other") ?? 0) + 1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([category,count])=>({category,count}));
  }, [filteredAssetPreviews]);

  useApi(active === "Asset library" || active === "Content studio", [active], async () => {
    const [assetData, personaData, referenceData, generationData, batchData] = await Promise.all([
      getJson("/api/assets"),
      getJson("/api/personas"),
      getJson("/api/visual-references"),
      getJson("/api/image-generation/status"),
      getJson("/api/image-generation/batch"),
    ]);
    if (Array.isArray(assetData.previews)) setAssetPreviews(assetData.previews);
    if (Array.isArray(personaData.personas)) setPersonas(personaData.personas);
    if (Array.isArray(referenceData.references)) setVisualReferences(referenceData.references);
    setImageGenerationStatus(generationData);
    if (Array.isArray(batchData.scenes)) setBatchScenes(batchData.scenes);
  }, () => setNotice("Impossible de charger l’infrastructure images."));

  return {
    assetPreviews, setAssetPreviews, filteredAssetPreviews, visibleAssetGroups,
    assetTab, setAssetTab, assetQuery, setAssetQuery, referenceCategory, setReferenceCategory,
    visualReferences, filteredVisualReferences, personas, imageGenerationStatus, batchScenes,
  };
}

export type AssetLibrary = ReturnType<typeof useAssetLibrary>;
