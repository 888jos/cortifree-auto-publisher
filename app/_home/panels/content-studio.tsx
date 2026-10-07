import { fallbackCategoryByType, type ModelId, type View } from "../data";
import { LayoutMockup, referenceCopy, useReferenceFallback, ZoneList } from "../components";
import type { ImageGeneration } from "../use-image-generation";
import type { Studio } from "../use-studio";

// Content studio tab: source structure viewer, recommended formats, draft builder, last draft and image entry points.
export function ContentStudioPanel({ studio, images, setActive }: { studio: Studio; images: ImageGeneration; setActive: (view: View) => void }) {
  const { currentType, currentTypeRefs, currentTypeModels, currentBlueprint, currentModel, setSelectedBlueprintId, referenceIndexes, setReferenceIndexes, moveReference, selectedModel, setSelectedModel, pickModel, selectedHook, setSelectedHook, language, setLanguage, market, setMarket, isCreating, create, draftPreview } = studio;
  const { setImageJob, setImageModalOpen } = images;
  return (
    <>
      <section className="referenceBand">
        <div className="panelHead">
          <div>
            <p className="eyebrow">RÉFÉRENCES DU MODÈLE</p>
            <h2>{currentType.name}</h2>
          </div>
          <span className="modelCount">{currentTypeRefs.reduce((total, item) => total + (item?.slides.length ?? 0), 0)} slides analysées</span>
        </div>

        {currentTypeRefs.length ? (
          <>
            <div className="blueprintTabs" role="tablist" aria-label="Choisir la structure source">
              {currentTypeRefs.map((carousel) => carousel && (
                <button
                  aria-selected={currentBlueprint?.id === carousel.id}
                  className={currentBlueprint?.id === carousel.id ? "selected" : ""}
                  key={carousel.id}
                  onClick={() => setSelectedBlueprintId(carousel.id)}
                  role="tab"
                  type="button"
                >
                  <b>{carousel.title}</b>
                  <span>{carousel.slides.length} slides</span>
                </button>
              ))}
            </div>

            {currentBlueprint && (() => {
              const index = referenceIndexes[currentBlueprint.id] ?? 0;
              const activeSlide = currentBlueprint.slides[index] ?? currentBlueprint.slides[0];
              const activeCopy = referenceCopy(currentBlueprint.title, activeSlide.role, activeSlide.position);
              const fallbackCategory = fallbackCategoryByType[currentType.id];
              return (
                <article className="blueprintViewer">
                  <div className="blueprintHero">
                    <button aria-label="Slide précédente" onClick={() => moveReference(currentBlueprint.id, -1)} type="button">‹</button>
                    <div className={`phoneFrame large referenceVisual placement-${activeSlide.textPlacement}`}>
                      <img alt={`${currentBlueprint.title} slide ${index + 1}`} onError={(event) => useReferenceFallback(event, `${currentBlueprint.id}-${index + 1}`, fallbackCategory)} referrerPolicy="no-referrer" src={activeSlide.image} />
                      <div className="referenceOverlay">
                        <small>{activeCopy.kicker}</small>
                        <strong>{activeCopy.headline}</strong>
                        <p>{activeCopy.body}</p>
                      </div>
                    </div>
                    <button aria-label="Slide suivante" onClick={() => moveReference(currentBlueprint.id, 1)} type="button">›</button>
                    <div className="blueprintMeta">
                      <p className="eyebrow">STRUCTURE ACTIVE</p>
                      <h3>{currentBlueprint.family}</h3>
                      <p>{currentBlueprint.rhythm}</p>
                      <dl>
                        <div><dt>Slide</dt><dd>{index + 1}/{currentBlueprint.slideCount}</dd></div>
                        <div><dt>Rôle</dt><dd>{activeSlide.role}</dd></div>
                        <div><dt>Image</dt><dd>{activeSlide.imagePlacement}</dd></div>
                        <div><dt>Texte</dt><dd>{activeSlide.textPlacement} · {activeSlide.textAlign}</dd></div>
                      </dl>
                      <a href={currentBlueprint.sourceUrl} rel="noreferrer" target="_blank">Voir la source TikTok ↗</a>
                    </div>
                  </div>

                  <div className="fullSequence" aria-label={`Toutes les slides de ${currentBlueprint.title}`}>
                    {currentBlueprint.slides.map((slide) => {
                      const copy = referenceCopy(currentBlueprint.title, slide.role, slide.position);
                      return (
                      <button
                        className={slide.position === index + 1 ? "active" : ""}
                        key={slide.position}
                        onClick={() => setReferenceIndexes((current) => ({ ...current, [currentBlueprint.id]: slide.position - 1 }))}
                        type="button"
                      >
                        <div className={`sequenceVisual placement-${slide.textPlacement}`}>
                          <img alt={`${currentBlueprint.title} slide ${slide.position}`} loading="lazy" onError={(event) => useReferenceFallback(event, `${currentBlueprint.id}-${slide.position}`, fallbackCategory)} referrerPolicy="no-referrer" src={slide.image} />
                          <div className="referenceOverlay compact"><small>{copy.kicker}</small><strong>{copy.headline}</strong></div>
                        </div>
                        <span>{String(slide.position).padStart(2, "0")} · {slide.role}</span>
                      </button>
                    );})}
                  </div>
                </article>
              );
            })()}
          </>
        ) : (
            <div className="emptyRefs">Aucune référence pour ce modèle. Ajoute idéalement 3 carrousels TikTok du même type.</div>
          )}
      </section>
      <section className="modelsBand">
        <div className="panelHead">
          <div>
            <p className="eyebrow">FORMATS RECOMMANDÉS</p>
            <h2>{currentType.id}</h2>
          </div>
          <span className="modelCount">{currentTypeModels.length} formats</span>
        </div>

        <div className="modelGrid">
          {currentTypeModels.map((model) => {
            if (!model) return null;
            return (
            <button
              className={`modelCard ${selectedModel === model.id ? "selected" : ""}`}
              key={model.id}
              onClick={() => pickModel(model.id)}
              type="button"
            >
              <LayoutMockup layout={model.layout} reference={model.reference} sample={model.spec.sample} />
              <span>{model.slides}</span>
              <h3>{model.name}</h3>
              <p>{model.format}</p>
              <small>{model.spec.bestFor}</small>
            </button>
            );
          })}
        </div>
      </section>
      <section className="studioPanel">
        <div>
          <p className="eyebrow">DRAFT BUILDER</p>
          <h2>{currentType.name}</h2>
          <p className="muted">Layout actif : {currentModel.name} · {currentModel.format}</p>
          {currentBlueprint && <p className="structureLock">Structure source : <b>{currentBlueprint.title}</b> · {currentBlueprint.slideCount} slides complètes</p>}
          {selectedHook && (
            <div className="activeHook">
              <div><span>HOOK ACTIF</span><b>{selectedHook}</b></div>
              <button aria-label="Retirer le hook" onClick={() => setSelectedHook(null)} type="button">×</button>
            </div>
          )}
        </div>

        <div className="layoutInspector">
          <LayoutMockup
            layout={currentModel.layout}
            reference={currentModel.reference}
            sample={currentModel.spec.sample}
          />
          <div className="layoutZones">
            <p>{currentModel.spec.bestFor}</p>
            <ZoneList label="Images" items={currentModel.spec.imageZones} />
            <ZoneList label="Texte" items={currentModel.spec.textZones} />
          </div>
        </div>

        <label>
          Format
          <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value as ModelId)}>
            {currentTypeModels.map((model) => {
              if (!model) return null;
              return (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
              );
            })}
          </select>
        </label>

        <div className="studioOptions">
          <label>
            Langue
            <select value={language} onChange={(event) => {
              const nextLanguage = event.target.value as "en" | "fr";
              setLanguage(nextLanguage);
              setMarket(nextLanguage === "fr" ? "FR" : "US");
            }}>
              <option value="en">English (US)</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <label>
            Marché
            <select value={market} onChange={(event) => setMarket(event.target.value)}>
              <option value="US">US</option>
              <option value="FR">France</option>
              <option value="CA">Canada</option>
              <option value="UK">UK</option>
            </select>
          </label>
        </div>

        <button className="primary" disabled={isCreating} onClick={create} type="button">
          {isCreating ? "Création..." : "Créer ce brouillon"}
        </button>
      </section>
      {draftPreview && (
        <section className="draftPreviewPanel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">BROUILLON CRÉÉ</p>
              <h2>{draftPreview.topic}</h2>
            </div>
            <span className="modelCount">{draftPreview.id}</span>
          </div>

          <div className={`generationBadge ${draftPreview.source}`}>
            <b>{draftPreview.source === "openai" ? "Generated with AI" : "Deterministic fallback"}</b>
            <span>{draftPreview.model ?? "Local generator"} · {new Date(draftPreview.generatedAt).toLocaleString("fr-FR")}</span>
          </div>
          {draftPreview.approvalStatus && (
            <div className={`generationBadge ${draftPreview.approvalStatus === "APPROVED" ? "openai" : "fallback"}`}>
              <b>{draftPreview.approvalStatus === "APPROVED" ? "Contenu validé pour publication" : "Révision nécessaire"}</b>
              <span>{draftPreview.publishReady ? "Upload-Post prêt" : "Profil média Upload-Post à connecter"}</span>
            </div>
          )}
          {draftPreview.warning && <p className="aiWarning">{draftPreview.warning}</p>}

          <div className="draftSummary">
            <div>
              <span>Type</span>
              <b>{draftPreview.typeName}</b>
            </div>
            <div>
              <span>Layout</span>
              <b>{draftPreview.modelName}</b>
            </div>
            <div>
              <span>Slides</span>
              <b>{draftPreview.slides.length}</b>
            </div>
          </div>

          <p className="draftAngle">{draftPreview.angle}</p>
          <p className="draftCaption">{draftPreview.caption}</p>

          <div className="draftSlides">
            {draftPreview.slides.map((slide) => (
              <article key={slide.position}>
                {slide.renderUrl && <img alt={`Slide ${slide.position} — ${slide.headline}`} loading="lazy" src={slide.renderUrl} />}
                <span>{String(slide.position).padStart(2, "0")} · {slide.role}</span>
                <h3>{slide.headline}</h3>
                <p>{slide.body}</p>
                <small>{slide.asset}</small>
                <em>{slide.visualIntent}</em>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="imageStudioBar">
        <div>
          <p className="eyebrow">IMAGE</p>
          <h2>Visuels persona</h2>
          <p>Choisis un asset existant ou crée une variation à partir d’un MASTER et d’une référence de scène.</p>
        </div>
        <div className="imageStudioActions">
          <button className="secondary" onClick={() => setActive("Asset library")} type="button">Changer d’asset</button>
          <button className="primary" onClick={() => { setImageJob(null); setImageModalOpen(true); }} type="button">Générer une image</button>
        </div>
      </section>
    </>
  );
}
