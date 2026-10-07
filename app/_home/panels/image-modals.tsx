import { displayLabel } from "../components";
import type { AssetLibrary } from "../use-asset-library";
import type { ImageGeneration } from "../use-image-generation";

// MASTER + scene reference image generator.
export function ImageGeneratorModal({ library, images }: { library: AssetLibrary; images: ImageGeneration }) {
  const { personas, visualReferences, imageGenerationStatus } = library;
  const { setImageModalOpen, selectedImagePersona, selectedImageReference, imagePersonaId, setImagePersonaId, imageScene, setImageScene, imageCategory, setImageCategory, imageReferenceId, setImageReferenceId, imageFraming, setImageFraming, imageOutfit, setImageOutfit, imageInstructions, setImageInstructions, imageJob, imageBusy, generatePersonaImage } = images;
  return (
    <div className="carouselModal" onClick={() => setImageModalOpen(false)} role="presentation">
      <section aria-label="Générer une image persona" aria-modal="true" className="imageGeneratorModal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modalHead"><div><p className="eyebrow">PERSONA IMAGE GENERATOR</p><h2>MASTER + référence de scène</h2></div><button aria-label="Fermer" onClick={() => setImageModalOpen(false)} type="button">×</button></div>
        <div className="identityEquation">
          <figure>{selectedImagePersona?.master?.public_url ? <img alt={"MASTER " + selectedImagePersona.name} src={selectedImagePersona.master.public_url} /> : <div className="referencePlaceholder">MASTER manquant</div>}<figcaption><b>WHO</b><span>{selectedImagePersona?.name ?? imagePersonaId}</span></figcaption></figure>
          <strong>+</strong>
          <figure>{selectedImageReference?.thumbnail_url ? <img alt={selectedImageReference.id} referrerPolicy="no-referrer" src={selectedImageReference.thumbnail_url} /> : <div className="referencePlaceholder">Image à importer</div>}<figcaption><b>HOW + WHERE</b><span>{selectedImageReference?.id ?? imageReferenceId}</span></figcaption></figure>
        </div>
        <div className="imageGeneratorFields">
          <label><span>Persona</span><select onChange={(event) => setImagePersonaId(event.target.value)} value={imagePersonaId}>{personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.id} · {persona.name}{persona.ready ? "" : " · MASTER non indexé"}</option>)}</select></label>
          <label><span>Scène</span><input onChange={(event) => setImageScene(event.target.value)} value={imageScene} /></label>
          <label><span>Catégorie</span><select onChange={(event) => setImageCategory(event.target.value)} value={imageCategory}><option value="other">Other</option><option value="home">Home</option><option value="fitness">Fitness</option><option value="outdoors">Outdoors</option><option value="self_care">Self care</option><option value="food">Food</option><option value="work_study">Work / Study</option></select></label>
          <label><span>Référence visuelle</span><select onChange={(event) => setImageReferenceId(event.target.value)} value={imageReferenceId}>{visualReferences.map((reference) => <option key={reference.id} value={reference.id}>{reference.id} · {displayLabel(reference.category)}</option>)}</select></label>
          <label><span>Cadrage</span><input onChange={(event) => setImageFraming(event.target.value)} placeholder={selectedImageReference?.framing || "full body"} value={imageFraming} /></label>
          <label><span>Tenue</span><input onChange={(event) => setImageOutfit(event.target.value)} placeholder={selectedImageReference?.outfit || "casual neutral"} value={imageOutfit} /></label>
          <label className="full"><span>Instructions additionnelles</span><textarea onChange={(event) => setImageInstructions(event.target.value)} placeholder="Détails optionnels, sans changer l’identité du MASTER" value={imageInstructions} /></label>
        </div>
        <div className="generationReadiness">
          <span className={imageGenerationStatus?.enabled && imageGenerationStatus?.configured ? "ready" : "off"}>{imageGenerationStatus?.enabled && imageGenerationStatus?.configured ? "Seedream prêt" : "Seedream désactivé"}</span>
          <small>{imageGenerationStatus?.model ?? "MODELARK_MODEL_ID absent"} · {imageGenerationStatus?.usage.images ?? 0} image(s) ce mois</small>
        </div>
        {imageJob && <div className={"jobState state-" + imageJob.status.toLowerCase()}><b>{imageJob.status}</b><span>{imageJob.last_error ?? (imageJob.status === "DONE" ? "Nouvel asset ajouté à la bibliothèque" : "Traitement du job")}</span></div>}
        <div className="modalActions">
          <button className="ghost" onClick={() => setImageReferenceId(visualReferences[(Math.max(0, visualReferences.findIndex((item) => item.id === imageReferenceId)) + 1) % Math.max(visualReferences.length, 1)]?.id ?? imageReferenceId)} type="button">Changer de référence</button>
          <button className="primary" disabled={imageBusy || !selectedImagePersona?.master || !selectedImageReference} onClick={generatePersonaImage} type="button">{imageBusy ? "Génération…" : imageJob?.status === "DONE" ? "Régénérer" : "Générer l’image"}</button>
        </div>
      </section>
    </div>
  );
}



// Controlled persona batch: queues jobs without running them.
export function ImageBatchModal({ library, images }: { library: AssetLibrary; images: ImageGeneration }) {
  const { personas, batchScenes, imageGenerationStatus } = library;
  const { setBatchModalOpen, batchPersonaIds, setBatchPersonaIds, batchSceneIds, setBatchSceneIds, batchVariations, setBatchVariations, batchConcurrency, setBatchConcurrency, batchConfirmed, setBatchConfirmed, batchBusy, createImageBatch } = images;
  return (
    <div className="carouselModal" onClick={() => setBatchModalOpen(false)} role="presentation">
      <section aria-label="Générateur batch de personas" aria-modal="true" className="imageGeneratorModal batchGeneratorModal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modalHead"><div><p className="eyebrow">PERSONA IMAGE GENERATOR</p><h2>Créer un batch contrôlé</h2></div><button aria-label="Fermer" onClick={() => setBatchModalOpen(false)} type="button">×</button></div>
        <div className="batchColumns">
          <fieldset><legend>Personas</legend><div className="batchChecks">{personas.map((persona) => <label key={persona.id}><input checked={batchPersonaIds.includes(persona.id)} disabled={!persona.ready} onChange={(event) => setBatchPersonaIds((current) => event.target.checked ? [...current, persona.id] : current.filter((id) => id !== persona.id))} type="checkbox" /><span>{persona.id} · {persona.name}{persona.ready ? "" : " · MASTER absent"}</span></label>)}</div></fieldset>
          <fieldset><legend>Scènes</legend><div className="batchChecks">{batchScenes.map((scene) => <label key={scene.id}><input checked={batchSceneIds.includes(scene.id)} onChange={(event) => setBatchSceneIds((current) => event.target.checked ? [...current, scene.id] : current.filter((id) => id !== scene.id))} type="checkbox" /><span>{scene.id.replaceAll("_", " ")}</span></label>)}</div></fieldset>
        </div>
        <div className="batchControls">
          <label><span>Variations</span><select onChange={(event) => setBatchVariations(Number(event.target.value))} value={batchVariations}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
          <label><span>Concurrence demandée</span><select onChange={(event) => setBatchConcurrency(Number(event.target.value))} value={batchConcurrency}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
        </div>
        <div className="batchEstimate"><div><span>Personas</span><b>{batchPersonaIds.length}</b></div><div><span>Scènes</span><b>{batchSceneIds.length}</b></div><div><span>Total</span><b>{batchPersonaIds.length * batchSceneIds.length * batchVariations}</b></div><div><span>Coût estimé</span><b>${((imageGenerationStatus?.unitCostUsd ?? 0) * batchPersonaIds.length * batchSceneIds.length * batchVariations).toFixed(2)}</b></div></div>
        <label className="batchConfirmation"><input checked={batchConfirmed} onChange={(event) => setBatchConfirmed(event.target.checked)} type="checkbox" /><span>Je confirme la création de ces jobs. Ils resteront en attente et ne seront pas exécutés automatiquement.</span></label>
        <div className="modalActions"><button className="ghost" onClick={() => setBatchModalOpen(false)} type="button">Annuler</button><button className="primary" disabled={batchBusy || !batchConfirmed || batchPersonaIds.length * batchSceneIds.length * batchVariations < 1 || batchPersonaIds.length * batchSceneIds.length * batchVariations > 100} onClick={createImageBatch} type="button">{batchBusy ? "Création…" : "Ajouter à la file"}</button></div>
      </section>
    </div>
  );
}

