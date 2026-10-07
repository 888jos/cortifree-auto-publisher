import Link from "next/link";
import { canonicalFormatById, canonicalFormats } from "../data";
import type { CarouselLibrary } from "../use-carousel-library";

// Carrousels tab: library summary, format strip, filters and the carousel grid.
export function CarouselsPanel({ library }: { library: CarouselLibrary }) {
  const { storedCarousels, filteredCarousels, carouselsLoading, carouselQuery, setCarouselQuery, carouselStatus, setCarouselStatus, carouselFormat, setCarouselFormat, setOpenedCarousel } = library;
  return (
    <section className="carouselLibrary">
      <div className="librarySummary">
        <div><span>Total</span><b>{storedCarousels.length}</b></div>
        <div><span>Validés</span><b>{storedCarousels.filter((item) => item.status === "APPROVED").length}</b></div>
        <div><span>Prêts à publier</span><b>{storedCarousels.filter((item) => item.spec?.publish_review?.publishReady).length}</b></div>
        <div><span>Avec PNG</span><b>{storedCarousels.filter((item) => item.spec?.rendered_slides?.length).length}</b></div>
      </div>
      <div className="canonicalFormatStrip">
        {canonicalFormats.map(format => <button className={carouselFormat===format.id?"selected":""} key={format.id} onClick={()=>setCarouselFormat(current=>current===format.id?"ALL":format.id)} type="button">
          <div><b>{format.short}</b><span className={format.status==="READY"?"ready":"legacy"}>{format.status}</span></div>
          <strong>{format.name}</strong><small>{format.mode}</small><em>{format.concepts}</em>
        </button>)}
      </div>
      <div className="carouselToolbar">
        <label><span>Rechercher</span><input onChange={(event) => setCarouselQuery(event.target.value)} placeholder="Titre, hook ou identifiant" type="search" value={carouselQuery} /></label>
        <label><span>Format</span><select onChange={(event)=>setCarouselFormat(event.target.value)} value={carouselFormat}><option value="ALL">F01–F08 · Tous</option>{canonicalFormats.map(format=><option key={format.id} value={format.id}>{format.short} · {format.name}</option>)}</select></label>
        <label><span>Statut</span><select onChange={(event) => setCarouselStatus(event.target.value)} value={carouselStatus}><option value="ALL">Tous</option><option value="APPROVED">Validés</option><option value="DRAFT">Brouillons</option><option value="READY_FOR_REVIEW">À revoir</option><option value="SCHEDULED">Planifiés</option><option value="PUBLISHED">Publiés</option><option value="FAILED">Échecs</option></select></label>
      </div>
      {carouselsLoading ? <div className="libraryEmpty">Chargement des carrousels…</div> : filteredCarousels.length === 0 ? <div className="libraryEmpty">Aucun carrousel ne correspond à ce filtre.</div> : (
        <div className="carouselGrid">
          {filteredCarousels.map((carousel) => {
            const cover = carousel.spec?.rendered_slides?.slice().sort((a, b) => a.position - b.position)[0]?.url;
            const slideCount = carousel.spec?.rendered_slides?.length ?? carousel.spec?.generated_slides?.length ?? 0;
            return <article className="carouselItem" key={carousel.id}>
              <button className="carouselCover" onClick={() => setOpenedCarousel(carousel)} type="button">
                {cover ? <img alt={`Couverture de ${carousel.topic}`} loading="lazy" src={cover} /> : <div className="missingCover"><span>Pas encore rendu</span><b>{carousel.spec?.hook ?? carousel.topic}</b></div>}
                <span className="slideCount">{slideCount} slides</span>
              </button>
              <div className="carouselInfo">
                <div><span className={`statusTag status-${carousel.status.toLowerCase()}`}>{carousel.status}</span><time>{new Date(carousel.created_at).toLocaleDateString("fr-FR")}</time></div>
                <h2>{carousel.spec?.hook ?? carousel.topic}</h2>
                <p>{carousel.topic}</p>
                {(()=>{const format=canonicalFormatById.get(carousel.content_type as typeof canonicalFormats[number]["id"]) ?? canonicalFormatById.get(carousel.spec?.model_id as typeof canonicalFormats[number]["id"]);return format?<div className="formatIdentity"><b>{format.short}</b><span>{format.name}</span><small>{format.mode}</small></div>:<div className="formatIdentity legacy"><b>OLD</b><span>{carousel.content_type}</span></div>})()}
                <div className="carouselActions"><button onClick={() => setOpenedCarousel(carousel)} type="button">Voir les slides</button><Link className="editCarousel" href={`/editor/${carousel.id}`}>✦ Edit in Studio</Link></div>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}

