"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./editor.css";

type Override={headline?:string;body?:string;assetId?:string|number;text?:Record<string,any>;image?:Record<string,any>};
type Slide={position:number;headline?:string;body?:string;rendered_url?:string;render_metadata?:any;asset_id?:string|number};
type Asset={id:string|number;public_url:string;filename:string;source_type?:string;persona_id?:string|null};
const FONTS=["TikTok Sans","Instrument Sans","Manrope","Inter Tight","DM Sans","Plus Jakarta Sans","Space Grotesk","Bricolage Grotesque","Archivo","Urbanist"];

export default function CarouselEditor({params}:{params:Promise<{id:string}>}) {
 const [id,setId]=useState(""); const [carousel,setCarousel]=useState<any>(null); const [slides,setSlides]=useState<Slide[]>([]);
 const [assets,setAssets]=useState<Asset[]>([]); const [personas,setPersonas]=useState<any[]>([]); const [refs,setRefs]=useState<any[]>([]);
 const [active,setActive]=useState(0); const [selected,setSelected]=useState<"headline"|"body"|"image">("headline");
 const [overrides,setOverrides]=useState<Record<string,Override>>({}); const [dirty,setDirty]=useState(false); const [busy,setBusy]=useState("");
 const [scene,setScene]=useState(""); const drag=useRef<{x:number;y:number;startX:number;startY:number}|null>(null);
 useEffect(()=>{params.then(p=>setId(p.id))},[params]);
 useEffect(()=>{if(!id)return; Promise.all([
   fetch("/api/carousels/"+id).then(r=>r.json()), fetch("/api/assets").then(r=>r.json()),
   fetch("/api/personas").then(r=>r.json()), fetch("/api/visual-references").then(r=>r.json())
 ]).then(([c,a,p,v])=>{setCarousel(c.carousel);setSlides(c.slides||[]);setAssets(a.previews||[]);setPersonas(p.personas||[]);setRefs(v.references||v.visualReferences||[]);setOverrides(c.carousel?.spec?.editor_overrides||{})})},[id]);
 const generated=carousel?.spec?.generated_slides||[]; const slide=slides[active]||{}; const gen=generated[active]||{};
 const key=String(gen.position||slide.position||active+1); const ov=overrides[key]||{};
 const geometry=slide.render_metadata?.geometry||{}; const text={...(geometry.text||{}),...(ov.text||{})}; const image={...(geometry.image||{}),...(ov.image||{})};
 const headline=ov.headline??gen.headline??slide.headline??""; const body=ov.body??gen.body??slide.body??"";
 const preview=useMemo(()=> assets.find(a=>String(a.id)===String(ov.assetId))?.public_url || slide.rendered_url || carousel?.spec?.rendered_slides?.[active]?.url,[assets,ov.assetId,slide,carousel,active]);
 function patch(next:Override){setOverrides(o=>({...o,[key]:{...(o[key]||{}),...next}}));setDirty(true)}
 function textPatch(next:Record<string,any>){patch({text:{...(ov.text||{}),...next}})}
 function imagePatch(next:Record<string,any>){patch({image:{...(ov.image||{}),...next}})}
 function pointerDown(e:React.PointerEvent){if(selected==="image")return;drag.current={x:e.clientX,y:e.clientY,startX:Number(text.x||82),startY:Number(selected==="headline"?(text.headlineY??text.y??810):(text.bodyY??980))};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
 function pointerMove(e:React.PointerEvent){if(!drag.current)return;const scale=540/1080;const dx=(e.clientX-drag.current.x)/scale,dy=(e.clientY-drag.current.y)/scale;const y=drag.current.startY+dy;textPatch(selected==="headline"?{x:Math.round(drag.current.startX+dx),headlineY:Math.round(y)}:{x:Math.round(drag.current.startX+dx),bodyY:Math.round(y)})}
 function pointerUp(){drag.current=null}
 async function save(render=false){setBusy(render?"Rendering…":"Saving…");const spec={...carousel.spec,editor_overrides:overrides};const r=await fetch("/api/carousels/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec})});if(!r.ok){setBusy("Save failed");return}setCarousel((c:any)=>({...c,spec}));setDirty(false);if(render){const rr=await fetch("/api/carousels/"+id+"/render",{method:"POST"});setBusy(rr.ok?"Render queued/saved":"Render failed")}else setBusy("Saved");setTimeout(()=>setBusy(""),1800)}
 async function generatePersona(){const persona=personas.find(p=>p.id===carousel?.persona_id)||personas[0];const ref=refs[0];if(!persona?.master||!ref){setBusy("Persona master/reference missing");return}setBusy("Generating…");const create=await fetch("/api/image-generation/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({persona_id:persona.id,master_asset_id:persona.master.id,visual_reference_id:ref.id,carousel_id:id,slide_id:"slide_"+key,category:"self_care",scene:scene||"candid natural lifestyle photo matching this carousel slide",framing:"portrait"})});const cj=await create.json();if(!cj.job?.id){setBusy(cj.error||"Generation failed");return}const run=await fetch("/api/image-generation/jobs/"+cj.job.id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"run"})});const out=await run.json();if(out.asset?.id){patch({assetId:out.asset.id});setAssets(a=>[...a,out.asset]);setBusy("Generated")}else setBusy(out.error||"Generation failed")}
 if(!carousel)return <main className="ce-loading">Loading editor…</main>;
 const controlText=selected==="headline"?headline:body;
 return <main className="ce-shell">
  <header className="ce-top"><a href="/">← CortiFree</a><strong>Carousel Studio</strong><span>{dirty?"Unsaved changes":"Saved"}</span><button onClick={()=>save(false)}>Save</button><button className="primary" onClick={()=>save(true)}>Save & render</button></header>
  <aside className="ce-slides">{generated.map((s:any,i:number)=><button key={s.position} className={i===active?"active":""} onClick={()=>setActive(i)}><span>{s.position}</span><img src={slides[i]?.rendered_url||carousel.spec?.rendered_slides?.[i]?.url||""}/></button>)}</aside>
  <section className="ce-work">
   <div className="ce-canvas" style={{backgroundImage:preview?`url("${preview}")`:"none",backgroundPosition:`${Number(image.x||0)/10.8}% ${Number(image.y||0)/13.5}%`,backgroundSize:"cover"}}>
    <div className={"ce-text headline "+(selected==="headline"?"sel":"")} onClick={()=>setSelected("headline")} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} style={{left:(Number(text.x||82)/2)+"px",top:(Number(text.headlineY??text.y??810)/2)+"px",width:(Number(text.width||916)/2)+"px",fontSize:(Number(text.headlineSize||52)/2)+"px",color:text.headlineColor||"#fff",fontFamily:text.fontFamily||"TikTok Sans",textAlign:text.align||"left",fontWeight:text.headlineWeight||700}}>{headline}</div>
    {body&&<div className={"ce-text body "+(selected==="body"?"sel":"")} onClick={()=>setSelected("body")} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} style={{left:(Number(text.x||82)/2)+"px",top:(Number(text.bodyY||980)/2)+"px",width:(Number(text.width||916)/2)+"px",fontSize:(Number(text.bodySize||28)/2)+"px",color:text.bodyColor||"#fff",fontFamily:text.fontFamily||"TikTok Sans",textAlign:text.align||"left",fontWeight:text.bodyWeight||500}}>{body}</div>}
    <button className="ce-image-hit" onClick={()=>setSelected("image")} aria-label="Select image"/>
   </div>
   <div className="ce-status">{busy}</div>
  </section>
  <aside className="ce-props">
   <div className="ce-tabs"><button onClick={()=>setSelected("headline")}>Title</button><button onClick={()=>setSelected("body")}>Body</button><button onClick={()=>setSelected("image")}>Image</button></div>
   {selected!=="image"?<div className="ce-panel">
    <label>Text<textarea value={controlText} onChange={e=>patch(selected==="headline"?{headline:e.target.value}:{body:e.target.value})}/></label>
    <label>Font<select value={text.fontFamily||"TikTok Sans"} onChange={e=>textPatch({fontFamily:e.target.value})}>{FONTS.map(f=><option key={f}>{f}</option>)}</select></label>
    <div className="ce-row"><label>Size<input type="number" value={selected==="headline"?text.headlineSize||52:text.bodySize||28} onChange={e=>textPatch(selected==="headline"?{headlineSize:+e.target.value}:{bodySize:+e.target.value})}/></label><label>Color<input type="color" value={(selected==="headline"?text.headlineColor:text.bodyColor)||"#ffffff"} onChange={e=>textPatch(selected==="headline"?{headlineColor:e.target.value}:{bodyColor:e.target.value})}/></label></div>
    <label>Align<select value={text.align||"left"} onChange={e=>textPatch({align:e.target.value})}><option>left</option><option>center</option><option>right</option></select></label>
    <div className="ce-row"><label>X<input type="number" value={text.x||82} onChange={e=>textPatch({x:+e.target.value})}/></label><label>Width<input type="number" value={text.width||916} onChange={e=>textPatch({width:+e.target.value})}/></label></div>
   </div>:<div className="ce-panel">
    <h3>Image</h3><div className="ce-row"><label>X<input type="number" value={image.x||0} onChange={e=>imagePatch({x:+e.target.value})}/></label><label>Y<input type="number" value={image.y||0} onChange={e=>imagePatch({y:+e.target.value})}/></label></div>
    <div className="ce-row"><label>Width<input type="number" value={image.width||1080} onChange={e=>imagePatch({width:+e.target.value})}/></label><label>Height<input type="number" value={image.height||1350} onChange={e=>imagePatch({height:+e.target.value})}/></label></div>
    <button onClick={()=>patch({assetId:undefined,image:{}})}>Reset image</button><h3>Replace from library</h3><div className="ce-assets">{assets.slice(0,60).map(a=><button key={a.id} onClick={()=>patch({assetId:a.id})}><img src={a.public_url}/></button>)}</div>
    <h3>Generate with persona</h3><p>{personas.find(p=>p.id===carousel.persona_id)?.name||carousel.persona_id}</p><textarea placeholder="Describe the scene…" value={scene} onChange={e=>setScene(e.target.value)}/><button className="primary wide" onClick={generatePersona}>Generate & use</button>
   </div>}
   <button className="reset" onClick={()=>{setOverrides(o=>{const n={...o};delete n[key];return n});setDirty(true)}}>Reset slide to template</button>
  </aside>
 </main>
}
