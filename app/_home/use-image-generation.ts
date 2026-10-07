import { useState } from "react";
import type { ImageJob } from "./types";
import { getJson, postJson } from "./use-api";
import type { AssetLibrary } from "./use-asset-library";

// Persona image generation: the single MASTER + reference job modal and the
// controlled batch modal that only queues jobs.
export function useImageGeneration(library: Pick<AssetLibrary, "personas" | "visualReferences" | "setAssetPreviews">, setNotice: (notice: string) => void) {
  const { personas, visualReferences, setAssetPreviews } = library;
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imagePersonaId, setImagePersonaId] = useState("P06");
  const [imageReferenceId, setImageReferenceId] = useState("MIRROR_001");
  const [imageScene, setImageScene] = useState("casual mirror selfie");
  const [imageCategory, setImageCategory] = useState("other");
  const [imageFraming, setImageFraming] = useState("");
  const [imageOutfit, setImageOutfit] = useState("");
  const [imageInstructions, setImageInstructions] = useState("");
  const [imageJob, setImageJob] = useState<ImageJob | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchPersonaIds, setBatchPersonaIds] = useState<string[]>([]);
  const [batchSceneIds, setBatchSceneIds] = useState<string[]>([]);
  const [batchVariations, setBatchVariations] = useState(1);
  const [batchConcurrency, setBatchConcurrency] = useState(1);
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const selectedImagePersona = personas.find((persona) => persona.id === imagePersonaId) ?? null;
  const selectedImageReference = visualReferences.find((reference) => reference.id === imageReferenceId) ?? null;

  async function generatePersonaImage() {
    if (imageBusy) return;
    const persona = personas.find((item) => item.id === imagePersonaId);
    if (!persona?.master) { setNotice("Cette persona n’a pas de MASTER indexé."); return; }
    setImageBusy(true);
    setImageJob({ id: "pending", status: "PENDING" });
    try {
      const createResponse = await postJson("/api/image-generation/jobs", {
        persona_id: imagePersonaId, master_asset_id: persona.master.id, visual_reference_id: imageReferenceId,
        scene: imageScene, category: imageCategory, framing: imageFraming || undefined, outfit: imageOutfit || undefined,
        prompt_additions: imageInstructions || undefined,
      });
      const created = await createResponse.json();
      if (!createResponse.ok) throw new Error(created.error || "Création du job impossible");
      setImageJob(created.job);
      const runResponse = await postJson("/api/image-generation/jobs/" + created.job.id, { action: "run" });
      const completed = await runResponse.json();
      if (!runResponse.ok) throw new Error(completed.error || "Génération impossible");
      setImageJob({ ...created.job, status: "DONE", output_asset_id: completed.asset.id });
      setNotice("Image générée, vérifiée et ajoutée à l’Asset Library.");
      const refreshed = await getJson("/api/assets");
      if (Array.isArray(refreshed.previews)) setAssetPreviews(refreshed.previews);
    } catch (error) {
      setImageJob((current) => ({ id: current?.id ?? "failed", status: "FAILED", last_error: error instanceof Error ? error.message : String(error) }));
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setImageBusy(false);
    }
  }

  async function createImageBatch() {
    const total = batchPersonaIds.length * batchSceneIds.length * batchVariations;
    if (!batchConfirmed || total < 1 || total > 100 || batchBusy) return;
    setBatchBusy(true);
    try {
      const response = await postJson("/api/image-generation/batch", { persona_ids: batchPersonaIds, scene_ids: batchSceneIds, variations: batchVariations, max_concurrency: batchConcurrency, confirmed: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Création du batch impossible");
      setNotice(`${result.total} jobs image ajoutés à la file. Aucune génération n’a été lancée automatiquement.`);
      setBatchModalOpen(false);
      setBatchConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchBusy(false);
    }
  }

  return {
    imageModalOpen, setImageModalOpen, imagePersonaId, setImagePersonaId, imageReferenceId, setImageReferenceId,
    imageScene, setImageScene, imageCategory, setImageCategory, imageFraming, setImageFraming, imageOutfit, setImageOutfit,
    imageInstructions, setImageInstructions, imageJob, setImageJob, imageBusy, selectedImagePersona, selectedImageReference,
    generatePersonaImage,
    batchModalOpen, setBatchModalOpen, batchPersonaIds, setBatchPersonaIds, batchSceneIds, setBatchSceneIds,
    batchVariations, setBatchVariations, batchConcurrency, setBatchConcurrency, batchConfirmed, setBatchConfirmed, batchBusy,
    createImageBatch,
  };
}

export type ImageGeneration = ReturnType<typeof useImageGeneration>;
