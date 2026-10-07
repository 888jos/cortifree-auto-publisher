import { useMemo, useState } from "react";
import { carouselBlueprints, getCarouselBlueprint } from "../carousel-blueprints.js";
import { referenceCarousels } from "../reference-carousels.js";
import { carouselTypes, modelData, type CarouselTypeId, type ModelId, type View } from "./data";
import type { DraftPreview } from "./types";
import { postJson } from "./use-api";

// Content studio state: chosen concept, format and source structure, the
// draft options and the AI draft -> render -> approval flow.
export function useStudio(setActive: (view: View) => void, setNotice: (notice: string) => void) {
  const [selectedModel, setSelectedModel] = useState<ModelId>("F01_LIFESTYLE_GUIDE");
  const [selectedType, setSelectedType] = useState<CarouselTypeId>("C05_GLOW_UP");
  const [isCreating, setIsCreating] = useState(false);
  const [lastDraftId, setLastDraftId] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);
  const [referenceIndexes, setReferenceIndexes] = useState<Record<string, number>>({});
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("navzsm-glowup");
  const [language, setLanguage] = useState<"en" | "fr">("en");
  const [market, setMarket] = useState("US");
  const [selectedHook, setSelectedHook] = useState<string | null>(null);

  const currentModel = useMemo(
    () => modelData.find((model) => model.id === selectedModel) ?? modelData[0],
    [selectedModel],
  );
  const currentType = useMemo(
    () => carouselTypes.find((type) => type.id === selectedType) ?? carouselTypes[0],
    [selectedType],
  );
  const currentTypeRefs = currentType.refIds
    .map((refId) => referenceCarousels.find((carousel) => carousel.id === refId))
    .filter(Boolean);
  const currentTypeModels = currentType.modelIds
    .map((modelId) => modelData.find((model) => model.id === modelId))
    .filter(Boolean);
  const currentBlueprint = useMemo(() => {
    const allowedIds = new Set<string>(currentType.refIds);
    return carouselBlueprints.find((blueprint) => blueprint.id === selectedBlueprintId && allowedIds.has(blueprint.id))
      ?? carouselBlueprints.find((blueprint) => allowedIds.has(blueprint.id))
      ?? null;
  }, [currentType, selectedBlueprintId]);

  async function create() {
    if (isCreating) return;

    setIsCreating(true);
    setNotice(`Creation du brouillon ${currentType.id} avec ${currentModel.name}...`);
    const draftId = `CF_${Date.now()}`;
    try {
      const requestedSlideCount = currentBlueprint?.slideCount
        ?? Math.max(4, Math.min(12, Number.parseInt(currentModel.slides, 10)));
      const orderedReferences = currentTypeRefs.slice().sort((a, b) => {
        if (a?.id === currentBlueprint?.id) return -1;
        if (b?.id === currentBlueprint?.id) return 1;
        return 0;
      });
      const response = await postJson("/api/ai/carousel/generate", {
        id: draftId,
        accountId: "CF_EN_01",
        personaId: "P01",
        carouselType: currentModel.id,
        layout: currentModel.layout,
        persona: "P01",
        language,
        market,
        references: orderedReferences.map((reference) => {
          const blueprint = getCarouselBlueprint(reference!.id);
          const isPrimary = blueprint?.id === currentBlueprint?.id;
          return {
          id: reference!.id,
          title: reference!.title,
          slideCount: reference!.slides.length,
          sourceUrl: reference!.sourceUrl,
          notes: `${isPrimary ? "PRIMARY STRUCTURE; " : "Secondary reference; "}${currentType.name}; ${currentModel.format}`,
          templateFamily: blueprint?.family,
          rhythm: blueprint?.rhythm,
          slides: isPrimary ? blueprint?.slides.map((slide) => ({
            position: slide.position,
            role: slide.role,
            imagePlacement: currentModel.layout,
            textPlacement: currentModel.layout === "grid-2x2" ? "center" : "lower-third",
            textAlign: currentModel.layout === "grid-2x2" || currentModel.layout === "routine-timeline" ? "center" : "left",
          })) : undefined,
        };
        }),
        recentCarousels: [],
        requestedSlideCount,
        preferredHook: selectedHook ?? undefined,
        ctaMode: "save",
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `API ${response.status}`);
      }

      const data = await response.json();
      const spec = data.spec;
      let preview: DraftPreview = {
        id: data.carousel?.id || draftId,
        typeName: currentType.name,
        modelName: currentModel.name,
        topic: spec.topic,
        angle: spec.angle,
        caption: spec.caption,
        source: data.generation.source,
        model: data.generation.model,
        generatedAt: data.generation.generatedAt,
        warning: data.generation.warning || data.storageWarning,
        saved: data.saved,
        slides: spec.slides.map((slide: { position: number; role: string; headline: string; body: string; assetQuery: string; visualIntent: string }) => ({
          position: slide.position, role: slide.role, headline: slide.headline, body: slide.body,
          asset: slide.assetQuery, visualIntent: slide.visualIntent,
        })),
      };
      setLastDraftId(preview.id);
      setDraftPreview(preview);
      setNotice(`${data.generation.source === "openai" ? "Brouillon IA" : "Brouillon fallback"} ${preview.id} créé${data.saved ? ", sélection des images et rendu en cours…" : ""}.`);

      if (data.saved) {
        const renderResponse = await fetch(`/api/carousels/${encodeURIComponent(preview.id)}/render`, { method: "POST" });
        const renderData = await renderResponse.json().catch(() => ({}));
        if (renderResponse.ok && Array.isArray(renderData.slides)) {
          const renderedByPosition = new Map<number, { url: string; assetFilename: string }>(renderData.slides.map((slide: { position: number; url: string; assetFilename: string }) => [slide.position, slide]));
          preview = {
            ...preview,
            slides: preview.slides.map((slide) => {
              const rendered = renderedByPosition.get(slide.position);
              return rendered ? { ...slide, renderUrl: rendered.url, asset: rendered.assetFilename } : slide;
            }),
          };
          setDraftPreview(preview);
          const approvalResponse = await postJson(`/api/carousels/${encodeURIComponent(preview.id)}/approve`, { platform: "tiktok" });
          const approval = await approvalResponse.json().catch(() => ({}));
          preview = { ...preview, approvalStatus: approval.status, publishReady: approval.publishReady };
          setDraftPreview(preview);
          setNotice(approval.contentApproved
            ? `${preview.id} rendu + QA OK · en attente de validation humaine.`
            : `${preview.id} rendu, mais le contrôle éditorial demande une correction avant review.`);
        } else {
          preview = { ...preview, warning: [preview.warning, `Rendu non terminé : ${renderData.error ?? `API ${renderResponse.status}`}`].filter(Boolean).join(" · ") };
          setDraftPreview(preview);
          setNotice(`${preview.id} est sauvegardé, mais le rendu PNG doit être relancé.`);
        }
      }

      await postJson("/api/logs", {
        stage: "carousel.create",
        status: "SUCCESS",
        carousel_id: preview.id,
        metadata: { format_id: currentModel.id, layout: currentModel.layout, concept_type: currentType.id, blueprint_id: currentBlueprint?.id, generation_source: data.generation.source },
      });
    } catch (error) {
      setNotice(`Erreur creation brouillon: ${error instanceof Error ? error.message : "inconnue"}.`);
    } finally {
      setIsCreating(false);
    }
  }

  function pickModel(modelId: ModelId) {
    const model = modelData.find((item) => item.id === modelId);
    setSelectedModel(modelId);
    setActive("Content studio");
    setNotice(`${model?.name ?? "Modele"} selectionne pour le prochain brouillon.`);
  }

  function openType(typeId: CarouselTypeId) {
    const type = carouselTypes.find((item) => item.id === typeId) ?? carouselTypes[0];
    const firstModel = modelData.find((model) => model.id === type.modelIds[0]);
    setSelectedType(type.id);
    if (firstModel) setSelectedModel(firstModel.id);
    setSelectedBlueprintId(type.refIds[0] ?? "");
    setActive("Content studio");
    setNotice(`${type.name} ouvert avec ses références.`);
  }

  function useHook(hook: string) {
    setSelectedHook(hook);
    setActive("Content studio");
    setNotice("Hook sélectionné pour le prochain brouillon.");
  }

  function moveReference(carouselId: string, direction: -1 | 1) {
    const carousel = referenceCarousels.find((item) => item.id === carouselId);
    if (!carousel) return;

    setReferenceIndexes((current) => {
      const index = current[carouselId] ?? 0;
      const next = (index + direction + carousel.slides.length) % carousel.slides.length;
      return { ...current, [carouselId]: next };
    });
  }

  return {
    selectedModel, setSelectedModel, selectedType, selectedBlueprintId, setSelectedBlueprintId,
    referenceIndexes, setReferenceIndexes, moveReference,
    language, setLanguage, market, setMarket, selectedHook, setSelectedHook,
    isCreating, lastDraftId, draftPreview, create,
    currentModel, currentType, currentTypeRefs, currentTypeModels, currentBlueprint,
    pickModel, openType, useHook,
  };
}

export type Studio = ReturnType<typeof useStudio>;
