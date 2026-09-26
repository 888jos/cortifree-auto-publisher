"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { REVIEW_REASONS, type RejectionAction } from "../lib/review-reasons";
import "./review.css";

type Slide = { position:number; url:string };
type Carousel = {
  id:string; account_id?:string; persona_id?:string; topic?:string; angle?:string; content_type?:string;
  status:string; review_status:string; current_version?:number; revision_count?:number; created_at?:string;
  review_notes?:string|null; rejection_reason_code?:string|null; rejection_action?:string|null;
  slides:Slide[];
};
type Payload = { status:string; summary:Record<string,number>; carousels:Carousel[] };

const statuses = [
  ["AWAITING_REVIEW","À vérifier"],
  ["APPROVED","Validés"],
  ["NEEDS_FIX","À corriger"],
  ["REJECTED","Rejetés"],
] as const;

export default function ReviewPage() {
  const [status,setStatus]=useState("AWAITING_REVIEW");
  const [payload,setPayload]=useState<Payload>({status:"AWAITING_REVIEW",summary:{},carousels:[]});
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(0);
  const [slideIndex,setSlideIndex]=useState(0);
  const [busy,setBusy]=useState("");
  const [rejectOpen,setRejectOpen]=useState(false);
  const [reasonCode,setReasonCode]=useState("COPY_AI");
  const [rejectionAction,setRejectionAction]=useState<RejectionAction>("ARCHIVE");
  const [feedback,setFeedback]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch(`/api/review?status=${encodeURIComponent(status)}&limit=100`,{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||`API ${response.status}`);
      setPayload(data);
      setSelected(0);setSlideIndex(0);
    }catch(error){setBusy(error instanceof Error?error.message:String(error))}
    finally{setLoading(false)}
  },[status]);

  useEffect(()=>{void load()},[load]);

  const carousel=payload.carousels[selected]??null;
  const activeSlide=carousel?.slides[slideIndex]??carousel?.slides[0]??null;
  const personas=useMemo(()=>new Set(payload.carousels.map(item=>item.persona_id).filter(Boolean)).size,[payload.carousels]);

  async function approve() {
    if(!carousel)return;
    setBusy("Validation…");
    const response=await fetch("/api/review/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({carouselId:carousel.id,actor:"studio"})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setBusy(data.error||"Validation impossible");return}
    setBusy("Validé · prêt à planifier");
    await load();
  }

  async function reject() {
    if(!carousel)return;
    setBusy(rejectionAction==="REVISION"?"Correction en préparation…":"Refus…");
    const response=await fetch("/api/review/reject",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      carouselId:carousel.id,actor:"studio",reasonCode,action:rejectionAction,reason:feedback.trim()||undefined,
    })});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setBusy(data.error||"Refus impossible");return}
    setRejectOpen(false);setFeedback("");
    setBusy(rejectionAction==="REVISION"?"Refus enregistré · correction envoyée":"Carrousel rejeté");
    await load();
  }

  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(["INPUT","TEXTAREA","SELECT"].includes(target.tagName)||target.isContentEditable||rejectOpen)return;
      if(event.key==="ArrowRight"&&payload.carousels.length){event.preventDefault();setSelected(i=>Math.min(payload.carousels.length-1,i+1));setSlideIndex(0)}
      if(event.key==="ArrowLeft"&&payload.carousels.length){event.preventDefault();setSelected(i=>Math.max(0,i-1));setSlideIndex(0)}
      if(status==="AWAITING_REVIEW"&&event.key.toLowerCase()==="a"){event.preventDefault();void approve()}
      if(status==="AWAITING_REVIEW"&&event.key.toLowerCase()==="r"){event.preventDefault();setRejectOpen(true)}
      if(carousel&&event.key.toLowerCase()==="e"){window.location.href=`/editor/${carousel.id}`}
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[payload.carousels.length,status,rejectOpen,carousel]);

  return <main className="reviewShell">
    <header className="reviewTop">
      <div className="reviewBrand"><Link href="/"><span>CF</span>CortiFree</Link><i>/</i><b>Review</b></div>
      <nav><Link href="/planning">Planning</Link><Link href="/">Studio</Link></nav>
    </header>

    <section className="reviewHero">
      <div><p>EDITORIAL REVIEW</p><h1>Décider vite, corriger seulement quand il faut.</h1><span>Chaque validation garde la version exacte. Une modification après validation rend l’approbation obsolète.</span></div>
      <div className="reviewStats">
        <div><b>{payload.summary.AWAITING_REVIEW??0}</b><span>À vérifier</span></div>
        <div><b>{payload.summary.APPROVED??0}</b><span>Validés</span></div>
        <div><b>{payload.summary.NEEDS_FIX??0}</b><span>À corriger</span></div>
        <div><b>{personas}</b><span>Personas ici</span></div>
      </div>
    </section>

    <div className="reviewTabs">{statuses.map(([value,label])=><button key={value} className={status===value?"active":""} onClick={()=>setStatus(value)}>{label}<span>{payload.summary[value]??0}</span></button>)}</div>

    {loading?<div className="reviewEmpty">Chargement de la queue…</div>:!carousel?<div className="reviewEmpty"><b>Queue vide.</b><span>Pour une fois, aucun humain n’a rien à décider.</span></div>:
    <section className="reviewWorkspace">
      <aside className="reviewQueue">
        {payload.carousels.map((item,index)=><button key={item.id} className={index===selected?"active":""} onClick={()=>{setSelected(index);setSlideIndex(0)}}>
          {item.slides[0]?.url?<img src={item.slides[0].url} alt=""/>:<div className="reviewNoThumb">No PNG</div>}
          <div><strong>{item.topic||item.id}</strong><span>{item.persona_id||"—"} · {item.content_type||"—"}</span><small>{item.review_status}</small></div>
        </button>)}
      </aside>

      <div className="reviewStage">
        <div className="reviewMeta">
          <div><span>{carousel.persona_id||"—"} · {carousel.account_id||"—"}</span><h2>{carousel.topic||carousel.id}</h2><p>{carousel.angle||carousel.content_type||""}</p></div>
          <div className="reviewCounter">{selected+1} / {payload.carousels.length}</div>
        </div>

        <div className="reviewPreview">
          {activeSlide?.url?<img src={activeSlide.url} alt={`Slide ${activeSlide.position}`}/>:<div className="reviewNoRender">Rendu final indisponible</div>}
        </div>

        <div className="reviewStrip">{carousel.slides.map((slide,index)=><button key={slide.position} className={slideIndex===index?"active":""} onClick={()=>setSlideIndex(index)}><img src={slide.url} alt=""/><span>{slide.position}</span></button>)}</div>

        <div className="reviewActions">
          <Link className="secondary" href={`/editor/${carousel.id}`}>Modifier <kbd>E</kbd></Link>
          {status==="AWAITING_REVIEW"&&<><button className="reject" onClick={()=>setRejectOpen(true)}>Refuser <kbd>R</kbd></button><button className="approve" onClick={()=>void approve()}>Valider <kbd>A</kbd></button></>}
        </div>
        {busy&&<div className="reviewNotice">{busy}</div>}
      </div>

      <aside className="reviewDetails">
        <h3>Détails</h3>
        <dl><div><dt>ID</dt><dd>{carousel.id}</dd></div><div><dt>Persona</dt><dd>{carousel.persona_id||"—"}</dd></div><div><dt>Compte</dt><dd>{carousel.account_id||"—"}</dd></div><div><dt>Format</dt><dd>{carousel.content_type||"—"}</dd></div><div><dt>Version</dt><dd>v{carousel.current_version??1}</dd></div><div><dt>Révisions</dt><dd>{carousel.revision_count??0}</dd></div></dl>
        {carousel.review_notes&&<div className="reviewNote"><b>Dernier feedback</b><p>{carousel.review_notes}</p></div>}
        <div className="reviewShortcuts"><b>Raccourcis</b><span>← → navigation</span><span>A valider</span><span>R refuser</span><span>E modifier</span></div>
      </aside>
    </section>}

    {rejectOpen&&carousel&&<div className="reviewModalBackdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setRejectOpen(false)}}>
      <div className="reviewModal">
        <div><p>REFUS · {carousel.persona_id}</p><h2>Pourquoi ce carrousel ne passe pas ?</h2></div>
        <label>Raison<select value={reasonCode} onChange={e=>setReasonCode(e.target.value)}>{REVIEW_REASONS.map(reason=><option value={reason.code} key={reason.code}>{reason.label}</option>)}</select></label>
        <label>Action<select value={rejectionAction} onChange={e=>setRejectionAction(e.target.value as RejectionAction)}><option value="ARCHIVE">Refuser définitivement</option><option value="REVISION">Refuser + demander une correction</option></select></label>
        <label>Feedback complémentaire<textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Optionnel : ce qui doit changer précisément…"/></label>
        <div className="reviewModalActions"><button onClick={()=>setRejectOpen(false)}>Annuler</button><button className="reject" onClick={()=>void reject()}>{rejectionAction==="REVISION"?"Refuser et corriger":"Refuser"}</button></div>
      </div>
    </div>}
  </main>
}
