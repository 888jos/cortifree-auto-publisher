"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./planning.css";

type Item={
  id:string;accountId:string;personaId:string;topic:string;format:string;status:string;reviewStatus:string;
  scheduledFor:string|null;publishedAt:string|null;postUrl:string|null;error:string|null;approvedAt:string|null;
  approvalStale:boolean;date:string|null;cover:string|null;
};
type Persona={
  accountId:string;personaId:string;username?:string|null;name?:string|null;timezone:string;dailyTarget:number;
  postingSlots:string[];enabled:boolean;postingEnabled:boolean;warmupStatus:string;backlog:Item[];
  byDay:Record<string,Item[]>;
};
type PlanningPayload={generatedAt:string;start:string;days:string[];summary:{awaitingReview:number;approvedBacklog:number;scheduled:number;published:number;failed:number};personas:Persona[];items:Item[]};

function todayKey(){
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
}
function shortDay(day:string){
  return new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"2-digit",month:"2-digit"}).format(new Date(day+"T12:00:00"));
}
function timeLabel(value:string|null,timezone:string){
  if(!value)return "";
  return new Intl.DateTimeFormat("fr-FR",{timeZone:timezone,hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}
function statusLabel(status:string){
  const labels:Record<string,string>={APPROVED:"Validé",SCHEDULED:"Planifié",PUBLISHING:"Publication",PUBLISHED:"Publié",FAILED:"Échec",READY_FOR_REVIEW:"À vérifier"};
  return labels[status]||status;
}

export default function PlanningPage(){
  const [payload,setPayload]=useState<PlanningPayload|null>(null);
  const [loading,setLoading]=useState(true);
  const [start,setStart]=useState(todayKey());
  const [selectedPersona,setSelectedPersona]=useState("");
  const [busy,setBusy]=useState("");
  const [manualItem,setManualItem]=useState<Item|null>(null);
  const [manualDate,setManualDate]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch(`/api/planning?days=7&start=${encodeURIComponent(start)}`,{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||`API ${response.status}`);
      setPayload(data);
      setSelectedPersona(current=>current||data.personas?.[0]?.personaId||"");
    }catch(error){setBusy(error instanceof Error?error.message:String(error))}
    finally{setLoading(false)}
  },[start]);
  useEffect(()=>{void load()},[load]);

  const selected=useMemo(()=>payload?.personas.find(persona=>persona.personaId===selectedPersona)||null,[payload,selectedPersona]);
  const allBacklog=useMemo(()=>payload?.personas.flatMap(persona=>persona.backlog.map(item=>({...item,timezone:persona.timezone,personaName:persona.name||persona.personaId})))||[],[payload]);

  async function post(body:Record<string,unknown>){
    setBusy("Mise à jour du planning…");
    const response=await fetch("/api/planning",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,actor:"studio"})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setBusy(data.error||"Planning impossible");return false}
    setBusy(body.action==="unschedule"?"Retiré du planning":"Planifié");
    await load();
    return true;
  }
  async function planNext(item:Item){await post({action:"schedule",carouselId:item.id,mode:"next"})}
  async function unschedule(item:Item){await post({action:"unschedule",carouselId:item.id})}
  async function planExact(){
    if(!manualItem||!manualDate)return;
    const scheduledFor=new Date(manualDate).toISOString();
    if(await post({action:"schedule",carouselId:manualItem.id,mode:"exact",scheduledFor})){setManualItem(null);setManualDate("")}
  }

  return <main className="planningShell">
    <header className="planningTop"><div className="planningBrand"><Link href="/"><span>CF</span>CortiFree</Link><i>/</i><b>Planning</b></div><nav><Link href="/review">Review</Link><Link href="/">Studio</Link></nav></header>

    <section className="planningHero">
      <div><p>CONTENT PLANNING</p><h1>Une semaine, 16 personas, zéro devinette.</h1><span>Les carrousels validés restent en backlog tant qu’ils n’ont pas de créneau.</span></div>
      {payload&&<div className="planningStats">
        <div><b>{payload.summary.approvedBacklog}</b><span>À planifier</span></div>
        <div><b>{payload.summary.scheduled}</b><span>Planifiés</span></div>
        <div><b>{payload.summary.published}</b><span>Publiés</span></div>
        <div><b>{payload.summary.awaitingReview}</b><span>À vérifier</span></div>
      </div>}
    </section>

    <section className="planningControls">
      <label>Semaine du <input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
      {busy&&<span>{busy}</span>}
    </section>

    {loading||!payload?<div className="planningEmpty">Chargement du planning…</div>:<>
      <section className="planningMatrixWrap">
        <div className="planningMatrix" style={{gridTemplateColumns:`190px repeat(${payload.days.length},minmax(155px,1fr))`}}>
          <div className="planningCorner">Persona / compte</div>
          {payload.days.map(day=><div className="planningDayHead" key={day}><b>{shortDay(day)}</b><span>{day}</span></div>)}
          {payload.personas.map(persona=><div className="planningRow" style={{display:"contents"}} key={persona.accountId}>
            <button className={"planningPersona "+(selectedPersona===persona.personaId?"active":"")} onClick={()=>setSelectedPersona(persona.personaId)}>
              <strong>{persona.name||persona.personaId}</strong><span>{persona.personaId} · {persona.accountId}</span><small>{persona.warmupStatus} · cible {persona.dailyTarget}/j</small>
            </button>
            {payload.days.map(day=>{
              const items=persona.byDay[day]||[];
              return <div className={"planningCell "+(items.length>persona.dailyTarget?"over":"")} key={day}>
                {items.length===0?<span className="planningEmptyCell">—</span>:items.map(item=><article className={"planningCard status-"+item.status.toLowerCase()} key={item.id}>
                  {item.cover&&<img src={item.cover} alt=""/>}
                  <div><b>{timeLabel(item.publishedAt||item.scheduledFor,persona.timezone)||"—"}</b><strong>{item.topic}</strong><span>{item.format}</span><small>{statusLabel(item.status)}</small></div>
                  {item.status==="SCHEDULED"&&<button title="Retirer du planning" onClick={()=>void unschedule(item)}>×</button>}
                </article>)}
              </div>
            })}
          </div>)}
        </div>
      </section>

      <section className="planningBottom">
        <div className="planningBacklog">
          <div className="planningSectionHead"><div><p>BACKLOG APPROUVÉ</p><h2>{allBacklog.length} carrousel{allBacklog.length>1?"s":""} à placer</h2></div><Link href="/review">Ouvrir Review →</Link></div>
          <div className="planningBacklogGrid">{allBacklog.length?allBacklog.map(item=><article key={item.id}>
            {item.cover?<img src={item.cover} alt=""/>:<div className="planningNoCover">No PNG</div>}
            <div className="planningBacklogCopy"><span>{item.personaName} · {item.format}</span><strong>{item.topic}</strong>{item.approvalStale&&<em>Validation obsolète</em>}</div>
            <div className="planningBacklogActions"><button disabled={item.approvalStale} onClick={()=>void planNext(item)}>Prochain créneau</button><button disabled={item.approvalStale} onClick={()=>{setManualItem(item);setManualDate("")}}>Choisir…</button><Link href={`/editor/${item.id}`}>Éditer</Link></div>
          </article>):<div className="planningEmptyBacklog">Aucun carrousel validé en attente de créneau.</div>}</div>
        </div>

        <aside className="planningPersonaDetail">
          <p>PERSONA</p><h2>{selected?.name||selected?.personaId||"—"}</h2>
          {selected&&<><dl><div><dt>ID</dt><dd>{selected.personaId}</dd></div><div><dt>Compte</dt><dd>{selected.accountId}</dd></div><div><dt>Timezone</dt><dd>{selected.timezone}</dd></div><div><dt>Warm-up</dt><dd>{selected.warmupStatus}</dd></div><div><dt>Posting</dt><dd>{selected.postingEnabled?"activé":"désactivé"}</dd></div></dl>
          <div className="planningSlots"><b>Créneaux</b>{selected.postingSlots.length?selected.postingSlots.map(slot=><span key={slot}>{slot}</span>):<span>18:00</span>}</div>
          <div className="planningWeekSummary"><b>Cette semaine</b><span>{payload.days.reduce((n,day)=>n+(selected.byDay[day]?.length||0),0)} contenu(s) planifié(s)</span><span>{selected.backlog.length} approuvé(s) en backlog</span></div></>}
        </aside>
      </section>
    </>}

    {manualItem&&<div className="planningModalBackdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setManualItem(null)}}><div className="planningModal">
      <p>PLANIFIER · {manualItem.personaId}</p><h2>{manualItem.topic}</h2>
      <label>Date et heure<input type="datetime-local" value={manualDate} onChange={e=>setManualDate(e.target.value)}/></label>
      <small>La valeur est saisie dans le fuseau horaire de ton navigateur puis stockée en UTC.</small>
      <div><button onClick={()=>setManualItem(null)}>Annuler</button><button className="primary" disabled={!manualDate} onClick={()=>void planExact()}>Planifier</button></div>
    </div></div>}
  </main>
}
