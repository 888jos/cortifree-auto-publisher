import type { CarouselLibrary } from "../use-carousel-library";

// Slides preview and human review actions for one stored carousel.
export function CarouselReviewModal({ library }: { library: CarouselLibrary }) {
  const { openedCarousel, setOpenedCarousel, reviewFeedback, setReviewFeedback, reviewBusy, submitReviewAction } = library;
  if (!openedCarousel) return null;
  return (
    <div className="carouselModal" onClick={() => setOpenedCarousel(null)} role="presentation">
      <section aria-label={`Aperçu de ${openedCarousel.topic}`} aria-modal="true" className="carouselModalPanel" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modalHead"><div><p className="eyebrow">{openedCarousel.id}</p><h2>{openedCarousel.spec?.hook ?? openedCarousel.topic}</h2></div><button aria-label="Fermer" onClick={() => setOpenedCarousel(null)} type="button">×</button></div>
        <div className="modalMeta"><span className={`statusTag status-${openedCarousel.status.toLowerCase()}`}>{openedCarousel.review_status ?? openedCarousel.status}</span><span>v{openedCarousel.current_version ?? 1}</span><span>{openedCarousel.spec?.model_id ?? "Layout inconnu"}</span><span>{openedCarousel.language.toUpperCase()}</span></div>
        <div className="modalSlides">
          {(openedCarousel.spec?.rendered_slides ?? []).slice().sort((a, b) => a.position - b.position).map((slide) => <figure key={slide.position}><img alt={`Slide ${slide.position}`} src={slide.url} /><figcaption>{slide.position}</figcaption></figure>)}
        </div>
        {!openedCarousel.spec?.rendered_slides?.length && <div className="libraryEmpty">Ce brouillon n’a pas encore de PNG rendu.</div>}
        <div className="modalCaption"><b>Légende</b><p>{openedCarousel.caption}</p></div>
        <div className="reviewPanel">
          <div className="reviewPanelHead">
            <div><b>Human approval</b><span>{openedCarousel.revision_count ?? 0} correction(s)</span></div>
            {openedCarousel.scheduled_for && <small>Prévu : {new Date(openedCarousel.scheduled_for).toLocaleString("fr-FR", { timeZone: "America/New_York" })} NYC</small>}
          </div>
          <textarea
            disabled={reviewBusy}
            onChange={(event) => setReviewFeedback(event.target.value)}
            placeholder="Ex: slide 2 plus punchy, garde le reste. Change seulement l’image de la slide 4 pour une scène bedroom journaling."
            rows={4}
            value={reviewFeedback}
          />
          <div className="reviewActions">
            <button className="primary" disabled={reviewBusy} onClick={() => submitReviewAction("approve")} type="button">{reviewBusy ? "Traitement…" : "Approve"}</button>
            <button disabled={reviewBusy || !reviewFeedback.trim()} onClick={() => submitReviewAction("request-changes")} type="button">Request changes</button>
            <button disabled={reviewBusy || !reviewFeedback.trim()} onClick={() => submitReviewAction("reject")} type="button">Reject</button>
          </div>
          <small>Les corrections sont ciblées : les slides non visées restent inchangées.</small>
        </div>
      </section>
    </div>
  );
}

