import Link from "next/link";
import { canonicalFormatById, canonicalFormats } from "../data";
import type { CarouselLibrary } from "../use-carousel-library";

// Edit tab: pick an existing carousel to open in the Studio editor.
export function EditPanel({ library }: { library: CarouselLibrary }) {
  const { filteredCarousels, carouselsLoading, carouselQuery, setCarouselQuery, carouselStatus, setCarouselStatus, carouselFormat, setCarouselFormat } = library;
  return (
    <section className="editHub">
      <div className="panelHead"><div><p className="eyebrow">EDIT</p><h2>Carousel editor</h2><p className="muted">Choisis un carrousel existant. Le Studio ouvre les slides rendues et leurs calques éditables.</p></div><span className="modelCount">{filteredCarousels.length} carrousel{filteredCarousels.length>1?"s":""}</span></div>
      <div className="carouselToolbar">
        <label><span>Rechercher</span><input onChange={(event)=>setCarouselQuery(event.target.value)} placeholder="Titre, hook ou identifiant" type="search" value={carouselQuery}/></label>
        <label><span>Format</span><select onChange={(event)=>setCarouselFormat(event.target.value)} value={carouselFormat}><option value="ALL">F01–F08 · Tous</option>{canonicalFormats.map(format=><option key={format.id} value={format.id}>{format.short} · {format.name}</option>)}</select></label>
        <label><span>Statut</span><select onChange={(event)=>setCarouselStatus(event.target.value)} value={carouselStatus}><option value="ALL">Tous</option><option value="APPROVED">Validés</option><option value="DRAFT">Brouillons</option><option value="READY_FOR_REVIEW">À revoir</option><option value="SCHEDULED">Planifiés</option><option value="PUBLISHED">Publiés</option><option value="FAILED">Échecs</option></select></label>
      </div>
      {carouselsLoading?<div className="libraryEmpty">Chargement des carrousels…</div>:<div className="editGrid">{filteredCarousels.map(carousel=>{const rendered=(carousel.spec?.rendered_slides??[]).slice().sort((a,b)=>a.position-b.position);const format=canonicalFormatById.get(carousel.content_type as typeof canonicalFormats[number]["id"]);return <article className="editCard" key={carousel.id}><div className="editThumbs">{rendered.slice(0,4).map(slide=><img alt={`Slide ${slide.position}`} key={slide.position} src={slide.url}/>)}{!rendered.length&&<div className="editNoRender">No render</div>}</div><div className="editCardBody"><div className="editIdentity"><b>{format?.short??"OLD"}</b><span>{format?.name??carousel.content_type}</span><i className={`statusTag status-${carousel.status.toLowerCase()}`}>{carousel.status}</i></div><h3>{carousel.spec?.hook??carousel.topic}</h3><p>{carousel.topic}</p><Link className="editLaunch" href={`/editor/${carousel.id}`}>Edit in Studio →</Link></div></article>})}</div>}
    </section>
  );
}

