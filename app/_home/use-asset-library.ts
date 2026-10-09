import { useMemo, useState } from "react";
import type { View } from "./data";
import type { AssetPreview, AssetTab, ImageGenerationStatus, PersonaScene, PersonaSummary, VisualGroupSummary, VisualReferenceSummary } from "./types";
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
  const [visualGroups, setVisualGroups] = useState<VisualGroupSummary[]>([]);
  const [groupFilter, setGroupFilter] = useState("all");

  const filteredAssetPreviews = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    const sourceByTab: Partial<Record<AssetTab, string>> = {
      Stock: "stock", "Persona Generated": "persona_generated", Masters: "persona_master",
    };
    const expectedSource = sourceByTab[assetTab];
    const groupMembers = visualGroups.find((group) => group.id === groupFilter)?.members;
    return assetPreviews.filter((asset) =>
      (!expectedSource || asset.source_type === expectedSource)
      && (!groupMembers || groupMembers.includes(String(asset.persona_id ?? "")))
      && (!query || [asset.metadata?.asset_name ?? "", asset.visual_description ?? "", asset.filename, asset.category, asset.subcategory, asset.persona_id ?? "", asset.mood].join(" ").toLowerCase().includes(query)),
    );
  }, [assetPreviews, assetQuery, assetTab, groupFilter, visualGroups]);
  // Group → face → images, for the persona tabs.
  const assetsByGroup = useMemo(() => visualGroups.map((group) => ({
    group,
    faces: group.members.map((personaId) => ({
      personaId,
      isMaster: personaId === group.master,
      assets: filteredAssetPreviews.filter((asset) => asset.persona_id === personaId),
    })).filter((face) => face.assets.length > 0),
  })).filter((entry) => entry.faces.length > 0), [filteredAssetPreviews, visualGroups]);
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
    if (Array.isArray(personaData.groups)) setVisualGroups(personaData.groups);
    if (Array.isArray(referenceData.references)) setVisualReferences(referenceData.references);
    setImageGenerationStatus(generationData);
    if (Array.isArray(batchData.scenes)) setBatchScenes(batchData.scenes);
  }, () => setNotice("Impossible de charger l’infrastructure images."));

  return {
    assetPreviews, setAssetPreviews, filteredAssetPreviews, visibleAssetGroups,
    visualGroups, groupFilter, setGroupFilter, assetsByGroup,
    assetTab, setAssetTab, assetQuery, setAssetQuery, referenceCategory, setReferenceCategory,
    visualReferences, filteredVisualReferences, personas, imageGenerationStatus, batchScenes,
  };
}

export type AssetLibrary = ReturnType<typeof useAssetLibrary>;
