import { useMemo, useState } from "react";
import { getCarouselBlueprint } from "../carousel-blueprints.js";
import { hookLibrary } from "../hook-library.js";
import { referenceCarousels } from "../reference-carousels.js";
import { getHookGenerationPlan } from "../lib/hook-selector";
import { carouselTypes, modelData } from "./data";
import { postJson } from "./use-api";
import type { Studio } from "./use-studio";

// Hook bank search and the "generate every hook" batch (draft, render and
// approval per hook, one at a time).
export function useHookLibrary(studio: Pick<Studio, "isCreating" | "language" | "market">, setNotice: (notice: string) => void) {
  const { isCreating, language, market } = studio;
  const [hookQuery, setHookQuery] = useState("");
  const [hookCategory, setHookCategory] = useState("All");
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, failed: 0 });

  const filteredHooks = useMemo(() => {
    const query = hookQuery.trim().toLowerCase();
    return hookLibrary.filter((hook) =>
      (hookCategory === "All" || hook.category === hookCategory)
      && (!query || hook.text.toLowerCase().includes(query)),
    );
  }, [hookCategory, hookQuery]);

  async function generateOneLibraryHook(hook: (typeof hookLibrary)[number], index: number) {
    const plan = getHookGenerationPlan(hook);
    const model = modelData.find((item) => item.id === plan.formatId) ?? modelData[0];
    const type = carouselTypes.find((item) => item.id === plan.conceptType) ?? carouselTypes[0];
    const refs = type.refIds
      .map((refId) => referenceCarousels.find((carousel) => carousel.id === refId))
      .filter(Boolean);
    const draftId = `CF_HOOK_${hook.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${Date.now().toString().slice(-6)}`;
    const response = await postJson("/api/ai/carousel/generate", {
      id: draftId,
      accountId: "CF_EN_01",
      personaId: "P01",
      carouselType: plan.formatId,
      layout: plan.layout,
      persona: "P01",
      language,
      market,
      references: refs.slice(0, 3).map((reference) => ({
        id: reference!.id,
        title: reference!.title,
        slideCount: reference!.slides.length,
        sourceUrl: reference!.sourceUrl,
        notes: `Visual reference for ${type.name}; preserve only the editorial rhythm.`,
        templateFamily: getCarouselBlueprint(reference!.id)?.family,
        rhythm: getCarouselBlueprint(reference!.id)?.rhythm,
      })),
      recentCarousels: [],
      requestedSlideCount: plan.requestedSlideCount,
      preferredHook: hook.text,
      ctaMode: "save",
      requireAI: true,
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error || `API ${response.status}`);
    }
    const data = await response.json();
    if (!data.saved) throw new Error(data.storageWarning || "Brouillon non sauvegardé dans Supabase");

    const renderResponse = await fetch(`/api/carousels/${encodeURIComponent(data.carousel.id)}/render`, { method: "POST" });
    const renderData = await renderResponse.json().catch(() => ({}));
    if (!renderResponse.ok || !Array.isArray(renderData.slides)) throw new Error(renderData.error || "Rendu PNG impossible");
    const approvalResponse = await postJson(`/api/carousels/${encodeURIComponent(data.carousel.id)}/approve`, { platform: "tiktok" });
    const approval = await approvalResponse.json().catch(() => ({}));
    if (!approvalResponse.ok) throw new Error(approval.error || "Validation impossible");
    await postJson("/api/logs", {
      stage: "hook-library.generate",
      status: "SUCCESS",
      carousel_id: data.carousel.id,
      metadata: { hook_id: hook.id, hook: hook.text, format_id: plan.formatId, layout: plan.layout, concept_type: plan.conceptType, approval: approval.status },
    });
    return { id: data.carousel.id, source: data.generation.source, slides: renderData.slides.length };
  }

  async function generateAllHooks() {
    if (isCreating || isBatchGenerating) return;
    setIsBatchGenerating(true);
    setBatchProgress({ done: 0, total: hookLibrary.length, failed: 0 });
    setNotice(`Génération IA de ${hookLibrary.length} carrousels lancée…`);
    let done = 0;
    let failed = 0;
    for (const [index, hook] of hookLibrary.entries()) {
      try {
        const result = await generateOneLibraryHook(hook, index);
        done += 1;
        setNotice(`${done}/${hookLibrary.length} · ${result.id} créé avec « ${hook.text} »`);
      } catch (error) {
        failed += 1;
        setNotice(`${done + failed}/${hookLibrary.length} · hook ignoré : ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
      setBatchProgress({ done, total: hookLibrary.length, failed });
    }
    setIsBatchGenerating(false);
    setNotice(`Génération terminée : ${done} carrousels créés, ${failed} échecs. Les échecs peuvent être relancés.`);
  }

  return { hookQuery, setHookQuery, hookCategory, setHookCategory, filteredHooks, isBatchGenerating, batchProgress, generateAllHooks };
}

export type HookLibrary = ReturnType<typeof useHookLibrary>;
