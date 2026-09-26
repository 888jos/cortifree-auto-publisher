"use client";
// Carousel Studio v2: canonical layer editor for production carousels.
import { useEffect,useMemo,useRef,useState } from "react";
import "./editor.css";
import { canonicalLayoutFor } from "../../lib/canonical-layout";
import { getSlideGeometry } from "../../lib/layout-geometry.js";
type Frame={x:number;y:number;width:number;height:number;cropX?:number;cropY?:number;zoom?:number;fit?:string};
type Override={headline?:string;body?:string;assetIds?:Array<string|number>;text?:Record<string,any>;image?:Record<string,any>;imageSlots?:Frame[]};
type Asset={id:string|number;public_url:string;filename:string;source_type?:string;persona_id?:string|null;category?:string;subcategory?:string;scene?:string;use_count?:number;last_used_at?:string|null;drive_file_id?:string|null;metadata?:Record<string,unknown>|null};
type LayerTarget="headline"|"body"|number;
type LayerFlags={locked?:boolean;hidden?:boolean};
type EditorState={snap?:boolean;layers?:Record<string,Record<string,LayerFlags>>};
type EditSnapshot={overrides:Record<string,Override>;editorState:EditorState};
type VersionItem={id:string;type:string;label?:string|null;version?:number|null;created_at:string;slide_count?:number|null};
type ClipboardItem={kind:"text";source:"headline"|"body";content:string;props:Record<string,any>}|{kind:"image";assetId?:string|number;frame:Frame};
const FONTS=["TikTok Sans","Instrument Sans","Manrope","Inter Tight","DM Sans","Plus Jakarta Sans","Space Grotesk","Bricolage Grotesque","Archivo","Urbanist"];
function defaultSlots(layout:string,isHook:boolean,count:number):Frame[]{
 if(layout==="lifestyle-3stack"&&!isHook)return [{x:0,y:0,width:1080,height:450},{x:0,y:450,width:1080,height:450},{x:0,y:900,width:1080,height:450}];
 if(layout==="three-rect-educational")return isHook?[{x:690,y:90,width:300,height:390},{x:90,y:830,width:300,height:390}]:[{x:80,y:110,width:450,height:430},{x:90,y:820,width:390,height:390},{x:600,y:820,width:390,height:390}];
 if(layout==="editorial-asym-hero")return [{x:60,y:190,width:590,height:770},{x:690,y:215,width:310,height:310},{x:690,y:555,width:310,height:310}];
 if(layout==="editorial-collage")return isHook?[{x:42,y:70,width:570,height:760},{x:610,y:210,width:420,height:600}]:[{x:50,y:70,width:500,height:700},{x:560,y:150,width:470,height:620}];
 if(layout==="grid-2x2"&&!isHook)return [{x:32,y:32,width:500,height:635},{x:548,y:32,width:500,height:635},{x:32,y:683,width:500,height:635},{x:548,y:683,width:500,height:635}];
 if(layout==="ranking")return isHook?[{x:70,y:650,width:450,height:420},{x:560,y:650,width:450,height:420}]:[{x:330,y:900,width:420,height:300}];
 return Array.from({length:Math.max(1,count)},()=>({x:0,y:0,width:1080,height:1350}));
}
export default function Editor({params}:{params:Promise<{id:string}>}){
 const [id,setId]=useState(""),[carousel,setCarousel]=useState<any>(),[slides,setSlides]=useState<any[]>([]),[assets,setAssets]=useState<Asset[]>([]),[personas,setPersonas]=useState<any[]>([]),[refs,setRefs]=useState<any[]>([]);
 const [active,setActive]=useState(0),[selection,setSelection]=useState<"headline"|"body"|number>("headline"),[overrides,setOverrides]=useState<Record<string,Override>>({}),[editorState,setEditorState]=useState<EditorState>({snap:true,layers:{}}),[history,setHistory]=useState<EditSnapshot[]>([]),[future,setFuture]=useState<EditSnapshot[]>([]);
 const [dirty,setDirty]=useState(false),[saveState,setSaveState]=useState<"saved"|"saving"|"unsaved"|"error">("saved"),[busy,setBusy]=useState(""),[scene,setScene]=useState(""),[assetSearch,setAssetSearch]=useState(""),[assetFilter,setAssetFilter]=useState<"all"|"persona_generated"|"stock"|"app_screenshot">("all"),[previewMode,setPreviewMode]=useState(false),[diagnoseMode,setDiagnoseMode]=useState(false),[historyMode,setHistoryMode]=useState(false),[versions,setVersions]=useState<VersionItem[]>([]),[editingText,setEditingText]=useState<"headline"|"body"|null>(null),[renderOutdated,setRenderOutdated]=useState(false),[structureBusy,setStructureBusy]=useState(false),[guides,setGuides]=useState<{x?:number;y?:number}>({}),[clipboard,setClipboard]=useState<ClipboardItem|null>(null),[slideDragIndex,setSlideDragIndex]=useState<number|null>(null),[canvasScale,setCanvasScale]=useState(.5),drag=useRef<any>(null),canvasRef=useRef<HTMLDivElement>(null),revision=useRef(0);
 useEffect(()=>{params.then(x=>setId(x.id))},[params]);
 useEffect(()=>{if(!id)return;Promise.all([fetch("/api/carousels/"+id,{cache:"no-store"}).then(r=>r.json()),fetch("/api/assets?editor=1",{cache:"no-store"}).then(r=>r.json()),fetch("/api/personas",{cache:"no-store"}).then(r=>r.json()),fetch("/api/visual-references",{cache:"no-store"}).then(r=>r.json())]).then(([c,a,p,v])=>{setCarousel(c.carousel);setSlides(c.slides||[]);setAssets(a.previews||[]);setPersonas(p.personas||[]);setRefs(v.references||[]);setOverrides(c.carousel?.spec?.editor_overrides||{});setEditorState(c.carousel?.spec?.editor_state||{snap:true,layers:{}});setDirty(false);setSaveState("saved");setRenderOutdated(Boolean(c.carousel?.spec?.editor_structure_dirty))})},[id]);
 useEffect(()=>{if(!carousel||previewMode)return;const el=canvasRef.current;if(!el)return;const sync=()=>setCanvasScale(el.getBoundingClientRect().width/1080||.5);sync();const observer=new ResizeObserver(sync);observer.observe(el);return()=>observer.disconnect()},[carousel,previewMode]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(!dirty)return;event.preventDefault();event.returnValue=""};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn)},[dirty]);
 useEffect(()=>{if(!dirty||!carousel||!id||structureBusy)return;const timer=window.setTimeout(()=>{void save(false,true)},900);return()=>window.clearTimeout(timer)},[overrides,editorState,dirty,id,carousel,structureBusy]);
 const generated=carousel?.spec?.generated_slides||[],slide=slides[active]||{},gen=generated[active]||{},key=String(gen.position||slide.position||active+1),ov=overrides[key]||{},layout=canonicalLayoutFor(carousel?.content_type||carousel?.spec?.carousel_type,carousel?.spec?.model_id||slide.template_id||"single-image"),isHook=active===0||String(gen.role||"").toUpperCase()==="HOOK";
 const isRoutineCtaFinal=layout==="routine-timeline"&&active===generated.length-1&&["CTA","TAKEAWAY"].includes(String(gen.role||"").toUpperCase());
 const isVisualFinal=active===generated.length-1&&(layout!=="routine-timeline"||isRoutineCtaFinal);
 const canonicalGeometry=getSlideGeometry({...gen,layout},isHook,isVisualFinal,{});
 const storedGeometry=slide.render_metadata?.geometry;
 const storedIsCanonical=storedGeometry&&!slide.render_metadata?.synthesized_from_spec&&String(slide.template_id||"")===layout;
 const baseText=(storedIsCanonical?storedGeometry?.text:canonicalGeometry?.text)||{},text={...baseText,...(ov.text||{})},headline=ov.headline??gen.headline??slide.headline??"",body=ov.body??gen.body??slide.body??"";
 const originalIds=(slide.render_metadata?.asset_ids||[slide.asset_id]).filter(Boolean),assetIds=ov.assetIds||originalIds,slots=ov.imageSlots||defaultSlots(layout,isHook,assetIds.length);
 const slotAssets=assetIds.map((aid:any)=>assets.find(a=>String(a.id)===String(aid)));
 const selectedSlot=typeof selection==="number"?selection:null,selectedFrame=selectedSlot===null?null:(slots[selectedSlot]||defaultSlots(layout,isHook,assetIds.length)[selectedSlot]);
 const selectedAsset=selectedSlot===null?undefined:assets.find(a=>String(a.id)===String(assetIds[selectedSlot]));
 const finalRenderUrl=slide.rendered_url||carousel?.spec?.rendered_slides?.[active]?.url||"";
 function assignedIds(index:number){const s=slides[index]||{},g=generated[index]||{},k=String(g.position||s.position||index+1),o=overrides[k]||{},original=(s.render_metadata?.asset_ids||[s.asset_id]).filter(Boolean);return (o.assetIds||original) as Array<string|number>}
 function slideHealth(index:number){const s=slides[index]||{},g=generated[index]||{},k=String(g.position||s.position||index+1),o=overrides[k]||{},ids=assignedIds(index),headlineValue=String(o.headline??g.headline??s.headline??""),bodyValue=String(o.body??g.body??s.body??""),role=String(g.role||"").toUpperCase(),hook=index===0||role==="HOOK",assetType=String(g.assetType??g.asset_type??"").toLowerCase(),expected=defaultSlots(layout,hook,Math.max(1,ids.length)).length,issues:Array<{level:"error"|"warn";label:string;detail?:string;selection?:"headline"|"body"|number}>=[];if(!headlineValue.trim())issues.push({level:"error",label:"Missing headline",selection:"headline"});if(/\b(lorem|placeholder|todo|tbd|undefined|null)\b/i.test(headlineValue+" "+bodyValue))issues.push({level:"error",label:"Placeholder text detected",selection:"headline"});if(headlineValue.length>90)issues.push({level:"warn",label:"Headline is long",detail:headlineValue.length+" chars",selection:"headline"});if(bodyValue.length>280)issues.push({level:"warn",label:"Body copy is long",detail:bodyValue.length+" chars",selection:"body"});if(assetType!=="text_only"&&ids.length<expected)issues.push({level:"warn",label:"Image slots incomplete",detail:ids.length+"/"+expected+" assigned",selection:Math.min(ids.length,expected-1)});const resolved=ids.map(aid=>assets.find(a=>String(a.id)===String(aid)));resolved.forEach((a,i)=>{if(!a)issues.push({level:"error",label:"Assigned asset unavailable",detail:String(ids[i]),selection:i})});const personaRequired=assetType==="persona"||(hook&&assetType!=="app_screenshot");if(personaRequired&&!resolved.some(a=>a?.source_type==="persona_generated"&&(!carousel?.persona_id||a.persona_id===carousel.persona_id)))issues.push({level:"error",label:"Persona asset required",detail:hook?"Hook identity continuity is mandatory":"This slide requires the carousel persona",selection:0});if(!(s.rendered_url||carousel?.spec?.rendered_slides?.[index]?.url))issues.push({level:"warn",label:"No final render yet"});return {level:issues.some(x=>x.level==="error")?"error":issues.length?"warn":"ok",issues}}
 const diagnostics=generated.map((_:any,i:number)=>slideHealth(i)),blockingCount=diagnostics.reduce((n:any,d:any)=>n+d.issues.filter((x:any)=>x.level==="error").length,0),warningCount=diagnostics.reduce((n:any,d:any)=>n+d.issues.filter((x:any)=>x.level==="warn").length,0);
 function checkpoint(){setHistory(h=>[...h.slice(-49),structuredClone(overrides)]);setFuture([])}
 function markChanged(){revision.current+=1;setDirty(true);setSaveState("unsaved");setRenderOutdated(true)}
 function setOv(next:Override,live=false){if(!live)checkpoint();setOverrides(o=>({...o,[key]:{...(o[key]||{}),...next}}));markChanged()}
 function textPatch(next:any,live=false){setOv({text:{...(ov.text||{}),...next}},live)}
 function slotPatch(index:number,next:Partial<Frame>,live=false){const arr=slots.map(x=>({...x}));arr[index]={...arr[index]!,...next};setOv({imageSlots:arr},live)}
 function chooseAsset(index:number,aid:string|number){const ids=[...assetIds];ids[index]=aid;setOv({assetIds:ids})}
 function undo(){if(!history.length)return;const prev=history.at(-1)!;setFuture(f=>[structuredClone(overrides),...f]);setOverrides(prev);setHistory(h=>h.slice(0,-1));markChanged()}
 function redo(){if(!future.length)return;const next=future[0]!;setHistory(h=>[...h,structuredClone(overrides)]);setOverrides(next);setFuture(f=>f.slice(1));markChanged()}
 function down(e:React.PointerEvent,kind:string,target:"headline"|"body"|number=selection){e.stopPropagation();checkpoint();const fr=typeof target==="number"?slots[target]:null;const textX=target==="headline"?(text.headlineX??text.x??90):(text.bodyX??text.x??90);drag.current={kind,target,x:e.clientX,y:e.clientY,x0:fr?.x??Number(textX),y0:fr?.y??Number(target==="headline"?(text.headlineY??text.y??700):(text.bodyY??900)),w0:fr?.width??Number(text.width||850),h0:fr?.height??300,size0:Number(target==="headline"?text.headlineSize||54:text.bodySize||28)};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
 function move(e:React.PointerEvent){const d=drag.current;if(!d)return;const target=d.target as "headline"|"body"|number,scale=Math.max(.1,canvasScale),dx=(e.clientX-d.x)/scale,dy=(e.clientY-d.y)/scale;if(typeof target==="number"){if(d.kind==="resize")slotPatch(target,{width:Math.max(80,Math.round(d.w0+dx)),height:Math.max(80,Math.round(d.h0+dy))},true);else slotPatch(target,{x:Math.round(d.x0+dx),y:Math.round(d.y0+dy)},true)}else if(d.kind==="resize"){textPatch(target==="headline"?{width:Math.max(120,Math.round(d.w0+dx)),headlineSize:Math.max(12,Math.round(d.size0+dy*.18))}:{width:Math.max(120,Math.round(d.w0+dx)),bodySize:Math.max(12,Math.round(d.size0+dy*.18))},true)}else textPatch(target==="headline"?{headlineX:Math.round(d.x0+dx),headlineY:Math.round(d.y0+dy)}:{bodyX:Math.round(d.x0+dx),bodyY:Math.round(d.y0+dy)},true)}
 async function refreshCarousel(){const next=await fetch("/api/carousels/"+id,{cache:"no-store"}).then(r=>r.json());if(next.carousel){setCarousel(next.carousel);setSlides(next.slides||[])}return next}
 async function waitForRender(){for(let attempt=0;attempt<30;attempt+=1){await new Promise(resolve=>setTimeout(resolve,1500));const next=await refreshCarousel();if(next.carousel?.status==="READY_FOR_REVIEW")return true}return false}
 async function save(render=false,silent=false){const rev=revision.current,snapshot=structuredClone(overrides);setSaveState("saving");if(!silent)setBusy(render?"Rendering...":"Saving...");const spec={...carousel.spec,editor_overrides:snapshot};const r=await fetch("/api/carousels/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec})});if(!r.ok){setSaveState("error");if(!silent)setBusy("Save failed");return false}setCarousel((c:any)=>({...c,spec}));if(revision.current===rev){setDirty(false);setSaveState("saved")}else setSaveState("unsaved");if(!render){if(!silent)setBusy("Saved");return true}const rr=await fetch("/api/carousels/"+id+"/render",{method:"POST"});if(!rr.ok){setBusy("Render failed");return false}if(rr.status===202){setBusy("Render queued...");const done=await waitForRender();setBusy(done?"Rendered":"Render still running");if(done)setRenderOutdated(false)}else{await refreshCarousel();setRenderOutdated(false);setBusy("Rendered")}return true}
 function commitInline(kind:"headline"|"body",event:React.FocusEvent<HTMLDivElement>){const value=event.currentTarget.innerText.replace(/\n{3,}/g,"\n\n").trim();const current=kind==="headline"?String(headline):String(body);if(value!==current)setOv(kind==="headline"?{headline:value}:{body:value});setEditingText(null)}
 async function generate(){if(selectedSlot===null)return;const persona=personas.find(p=>p.id===carousel.persona_id)||personas[0],ref=refs[0];if(!persona?.master||!ref){setBusy("Missing persona/reference");return}setBusy("Generating persona image…");const cr=await fetch("/api/image-generation/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({persona_id:persona.id,master_asset_id:persona.master.id,visual_reference_id:ref.id,carousel_id:id,slide_id:"slide_"+key,category:"self_care",scene:scene||"natural candid lifestyle photo matching the selected carousel image slot",framing:"portrait"})});const cj=await cr.json();if(!cj.job?.id){setBusy(cj.error||"Generation failed");return}const rr=await fetch("/api/image-generation/jobs/"+cj.job.id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"run"})});const out=await rr.json();if(out.asset?.id){const generatedAsset:Asset={...out.asset,public_url:out.asset.public_url||out.asset.url,source_type:"persona_generated",persona_id:persona.id};setAssets(a=>[generatedAsset,...a.filter(x=>String(x.id)!==String(generatedAsset.id))]);chooseAsset(selectedSlot,generatedAsset.id);setBusy("Generated & inserted")}else setBusy(out.error||"Generation failed")}
 if(!carousel)return <main className="ce-loading">Loading Carousel Studio…</main>;
 const filtered=assets.filter(a=>(assetFilter==="all"||a.source_type===assetFilter)&&(!assetSearch||[a.filename,a.source_type,a.persona_id,a.category,a.subcategory,a.scene].join(" ").toLowerCase().includes(assetSearch.toLowerCase()))).slice(0,240);
 const saveLabel=saveState==="saving"?"Saving…":saveState==="unsaved"?"Unsaved":saveState==="error"?"Save failed":"Saved";
 const activeHealth=diagnostics[active]||{level:"ok",issues:[]};
 return <main className="ce-shell" tabIndex={-1} onKeyDown={e=>{
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo()}
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="s"){e.preventDefault();void save()}
   if(e.key==="Escape"){setEditingText(null);setPreviewMode(false);setDiagnoseMode(false)}
 }}>
  <header className="ce-top">
   <a href="/">← Carrousels</a>
   <div className="ce-titleblock"><strong>{carousel.topic||carousel.content_type||"Untitled carousel"}</strong><small>{carousel.content_type} · {layout}</small></div>
   <div className="ce-history-actions"><button disabled={!history.length} onClick={undo} title="Undo">↶</button><button disabled={!future.length} onClick={redo} title="Redo">↷</button></div>
   <span className={"ce-save-state "+saveState}>{saveLabel}</span>
   {renderOutdated&&<span className="ce-outdated">Render outdated</span>}
   <button className={previewMode?"active":""} onClick={()=>{setPreviewMode(v=>!v);setDiagnoseMode(false)}}>Preview</button>
   <button className={(diagnoseMode?"active ":"")+"ce-diagnose-button"} onClick={()=>{setDiagnoseMode(v=>!v);setPreviewMode(false)}}>Diagnose {blockingCount>0?<b>{blockingCount}</b>:warningCount>0?<em>{warningCount}</em>:<i>✓</i>}</button>
   <button onClick={()=>void save()}>Save now</button>
   <button className="primary" onClick={()=>{if(blockingCount){setDiagnoseMode(true);setPreviewMode(false);setBusy(blockingCount+" blocking issue"+(blockingCount>1?"s":"")+" before render")}else void save(true)}}>Render</button>
  </header>

  <aside className="ce-slides">
   <div className="ce-sidebar-label">Slides <span>{generated.length}</span></div>
   {generated.map((s:any,i:number)=>{
    const health=diagnostics[i]||{level:"ok",issues:[]};
    const ids=assignedIds(i),fallback=assets.find(a=>String(a.id)===String(ids[0]))?.public_url;
    const thumb=slides[i]?.rendered_url||carousel.spec?.rendered_slides?.[i]?.url||fallback||"";
    return <button key={s.position??i} className={i===active?"active":""} onClick={()=>{setActive(i);setSelection("headline");setEditingText(null);setPreviewMode(false)}}>
      <div className="ce-thumb-wrap">{thumb?<img src={thumb} alt={"Slide "+(i+1)}/>:<div className="ce-thumb-empty">No render</div>}<span className={"ce-health "+health.level}>{health.level==="ok"?"✓":health.level==="error"?"!":"⚠"}</span></div>
      <div className="ce-slide-meta"><b>{String(s.position??i+1).padStart(2,"0")}</b><span>{String(s.role||"slide").toLowerCase()}</span></div>
    </button>
   })}
  </aside>

  <section className="ce-work">
   {previewMode?
    <div className="ce-preview-wrap">
     <div className="ce-preview-head"><strong>Final renderer · slide {active+1}/{generated.length}</strong><span>{renderOutdated?"Needs render":"Latest render"}</span></div>
     {finalRenderUrl?<img className="ce-preview-image" src={finalRenderUrl} alt={"Final render slide "+(active+1)}/>:<div className="ce-preview-empty"><b>No final render yet</b><span>Render the carousel to compare the exact PNG output.</span></div>}
     {renderOutdated&&<div className="ce-preview-warning">Your editor changes are newer than this PNG.</div>}
    </div>:
    <>
     <div className="ce-contextbar">
      <span>Slide {active+1}</span><span>{String(gen.role||"slide")}</span><span>{layout}</span>
      <span className={"ce-active-health "+activeHealth.level}>{activeHealth.level==="ok"?"Ready":activeHealth.issues.length+" issue"+(activeHealth.issues.length>1?"s":"")}</span>
      <span className="ce-tip">Double-click text to edit inline</span>
     </div>
     <div ref={canvasRef} className={"ce-canvas layout-"+layout}>
      <div className="ce-safe-area"/>
      {layout==="interactive-checklist"&&!isHook&&<div className="ce-checklist-panel"/>}
      {layout==="ranking"&&<div className="ce-ranking-wash"/>}
      {slots.map((frame:Frame,i:number)=>{
       const asset=slotAssets[i];
       return <div key={i} className={"ce-image-frame "+(selection===i?"sel ":"")+(asset?"":"ce-missing-slot")} style={{left:frame.x*canvasScale,top:frame.y*canvasScale,width:frame.width*canvasScale,height:frame.height*canvasScale}} onClick={()=>setSelection(i)} onPointerDown={e=>{setSelection(i);down(e,"move",i)}} onPointerMove={move} onPointerUp={()=>drag.current=null}>
        {asset?<img draggable={false} src={asset.public_url} style={{transform:`scale(${frame.zoom||1})`,objectPosition:`${frame.cropX??50}% ${frame.cropY??50}%`}}/>:<span>+ image</span>}
        {selection===i&&<i className="ce-handle" onPointerDown={e=>down(e,"resize",i)} onPointerMove={move}/>}
       </div>
      })}
      <div contentEditable={editingText==="headline"} suppressContentEditableWarning className={"ce-text "+(selection==="headline"?"sel ":"")+(editingText==="headline"?"editing":"")} onClick={()=>setSelection("headline")} onDoubleClick={e=>{e.stopPropagation();setSelection("headline");setEditingText("headline")}} onBlur={e=>commitInline("headline",e)} onPointerDown={e=>{if(editingText!=="headline")down(e,"move","headline");else e.stopPropagation()}} onPointerMove={move} onPointerUp={()=>drag.current=null} style={{left:Number(text.headlineX??text.x??90)*canvasScale,top:Number(text.headlineY??text.y??700)*canvasScale,width:Number(text.width||850)*canvasScale,fontSize:Number(text.headlineSize||54)*canvasScale,color:text.editorHeadlineColor||text.headlineColor||"#fff",fontFamily:text.fontFamily||"TikTok Sans",textAlign:text.align||"left",fontWeight:text.headlineWeight||700}}>{headline}{selection==="headline"&&editingText!=="headline"&&<i className="ce-handle" onPointerDown={e=>down(e,"resize","headline")} onPointerMove={move}/>}</div>
      {body&&<div contentEditable={editingText==="body"} suppressContentEditableWarning className={"ce-text body "+(selection==="body"?"sel ":"")+(editingText==="body"?"editing":"")} onClick={()=>setSelection("body")} onDoubleClick={e=>{e.stopPropagation();setSelection("body");setEditingText("body")}} onBlur={e=>commitInline("body",e)} onPointerDown={e=>{if(editingText!=="body")down(e,"move","body");else e.stopPropagation()}} onPointerMove={move} onPointerUp={()=>drag.current=null} style={{left:Number(text.bodyX??text.x??90)*canvasScale,top:Number(text.bodyY||900)*canvasScale,width:Number(text.width||850)*canvasScale,fontSize:Number(text.bodySize||28)*canvasScale,color:text.editorBodyColor||text.bodyColor||"#fff",fontFamily:text.fontFamily||"TikTok Sans",textAlign:text.align||"left",fontWeight:text.bodyWeight||500}}>{body}{selection==="body"&&editingText!=="body"&&<i className="ce-handle" onPointerDown={e=>down(e,"resize","body")} onPointerMove={move}/>}</div>}
     </div>
    </>
   }
   <div className="ce-status">{busy}</div>
  </section>

  <aside className="ce-props">
   {diagnoseMode?
    <div className="ce-diagnostics">
     <div className="ce-diagnostic-head"><h2>Carousel health</h2><button onClick={()=>setDiagnoseMode(false)}>×</button></div>
     <div className="ce-health-summary"><div><b>{blockingCount}</b><span>blocking</span></div><div><b>{warningCount}</b><span>warnings</span></div><div><b>{diagnostics.filter((d:any)=>d.level==="ok").length}</b><span>ready slides</span></div></div>
     {blockingCount===0&&warningCount===0&&<div className="ce-all-good"><b>Ready to render</b><span>No structural or asset issues detected.</span></div>}
     {diagnostics.map((d:any,i:number)=>d.issues.length?<div className="ce-diagnostic-group" key={i}><h3>Slide {i+1} · {String(generated[i]?.role||"slide")}</h3>{d.issues.map((issue:any,j:number)=><button key={j} className={"ce-finding "+issue.level} onClick={()=>{setActive(i);setSelection(issue.selection??"headline");setDiagnoseMode(false);setPreviewMode(false)}}><span>{issue.level==="error"?"!":"⚠"}</span><div><b>{issue.label}</b>{issue.detail&&<small>{issue.detail}</small>}</div></button>)}</div>:null)}
    </div>:
    <>
     <div className="ce-layerlist"><b>Layers</b><button className={selection==="headline"?"active":""} onClick={()=>setSelection("headline")}>T · Title</button>{body&&<button className={selection==="body"?"active":""} onClick={()=>setSelection("body")}>T · Body</button>}{slots.map((_,i)=><button className={selection===i?"active":""} key={i} onClick={()=>setSelection(i)}>▧ · Image {i+1}</button>)}</div>
     {typeof selection!=="number"?
      <div className="ce-panel">
       <div className="ce-panel-heading"><div><b>{selection==="headline"?"Title":"Body"}</b><span>Content & design</span></div><button onClick={()=>setEditingText(selection)}>Edit inline</button></div>
       <label>Text<textarea value={selection==="headline"?headline:body} onChange={e=>setOv(selection==="headline"?{headline:e.target.value}:{body:e.target.value})}/><small className={(selection==="headline"?headline.length:body.length)>(selection==="headline"?90:280)?"over":""}>{selection==="headline"?headline.length:body.length}/{selection==="headline"?90:280}</small></label>
       <label>Font<select value={text.fontFamily||"TikTok Sans"} onChange={e=>textPatch({fontFamily:e.target.value})}>{FONTS.map(x=><option key={x}>{x}</option>)}</select></label>
       <div className="ce-row"><label>Size<input type="number" value={selection==="headline"?text.headlineSize||54:text.bodySize||28} onChange={e=>textPatch(selection==="headline"?{headlineSize:+e.target.value}:{bodySize:+e.target.value})}/></label><label>Color<input type="color" value={(selection==="headline"?text.editorHeadlineColor||text.headlineColor:text.editorBodyColor||text.bodyColor)||"#ffffff"} onChange={e=>textPatch(selection==="headline"?{editorHeadlineColor:e.target.value,headlineColor:e.target.value}:{editorBodyColor:e.target.value,bodyColor:e.target.value})}/></label></div>
       <label>Align<select value={text.align||"left"} onChange={e=>textPatch({align:e.target.value})}><option>left</option><option>center</option><option>right</option></select></label>
       <div className="ce-row"><label>X<input type="number" value={selection==="headline"?(text.headlineX??text.x??90):(text.bodyX??text.x??90)} onChange={e=>textPatch(selection==="headline"?{headlineX:+e.target.value}:{bodyX:+e.target.value})}/></label><label>Y<input type="number" value={selection==="headline"?(text.headlineY??text.y??700):(text.bodyY??900)} onChange={e=>textPatch(selection==="headline"?{headlineY:+e.target.value}:{bodyY:+e.target.value})}/></label></div>
       <div className="ce-row"><label>Width<input type="number" value={text.width??850} onChange={e=>textPatch({width:+e.target.value})}/></label><label>Weight<input type="number" min="100" max="900" step="100" value={selection==="headline"?text.headlineWeight||700:text.bodyWeight||500} onChange={e=>textPatch(selection==="headline"?{headlineWeight:+e.target.value}:{bodyWeight:+e.target.value})}/></label></div>
      </div>:
      <div className="ce-panel">
       <div className="ce-panel-heading"><div><b>Image {selection+1}</b><span>Crop, source & replacement</span></div></div>
       {selectedAsset?<div className="ce-selected-asset"><img src={selectedAsset.public_url}/><div><b>{selectedAsset.filename}</b><span>{selectedAsset.source_type||"unknown"}{selectedAsset.persona_id?" · "+selectedAsset.persona_id:""}</span><small>{selectedAsset.scene||selectedAsset.category||"No scene metadata"}</small></div></div>:<div className="ce-selected-asset missing"><b>No image assigned</b><span>Choose an asset below. Silent stock fallback is not allowed.</span></div>}
       {selectedAsset&&<div className="ce-provenance"><span><b>Source</b>{selectedAsset.source_type||"—"}</span><span><b>Persona</b>{selectedAsset.persona_id||"—"}</span><span><b>Uses</b>{selectedAsset.use_count??0}</span><span><b>Drive</b>{selectedAsset.drive_file_id?"linked":"—"}</span>{Boolean(selectedAsset.metadata?.generation_job_id)&&<span className="wide-meta"><b>Generation job</b>{String(selectedAsset.metadata?.generation_job_id)}</span>}</div>}
       <div className="ce-row"><label>X<input type="number" value={selectedFrame?.x||0} onChange={e=>slotPatch(selection,{x:+e.target.value})}/></label><label>Y<input type="number" value={selectedFrame?.y||0} onChange={e=>slotPatch(selection,{y:+e.target.value})}/></label></div>
       <div className="ce-row"><label>Width<input type="number" value={selectedFrame?.width||0} onChange={e=>slotPatch(selection,{width:+e.target.value})}/></label><label>Height<input type="number" value={selectedFrame?.height||0} onChange={e=>slotPatch(selection,{height:+e.target.value})}/></label></div>
       <label>Zoom<input type="range" min="1" max="4" step=".05" value={selectedFrame?.zoom||1} onChange={e=>slotPatch(selection,{zoom:+e.target.value})}/></label>
       <div className="ce-row"><label>Crop X<input type="range" min="0" max="100" value={selectedFrame?.cropX??50} onChange={e=>slotPatch(selection,{cropX:+e.target.value})}/></label><label>Crop Y<input type="range" min="0" max="100" value={selectedFrame?.cropY??50} onChange={e=>slotPatch(selection,{cropY:+e.target.value})}/></label></div>
       <div className="ce-asset-heading"><h3>Replace</h3><small>{filtered.length} shown / {assets.length}</small></div>
       <input placeholder="Search filename, persona, scene…" value={assetSearch} onChange={e=>setAssetSearch(e.target.value)}/>
       <div className="ce-asset-filters">{([["all","All"],["persona_generated","Persona"],["stock","Stock"],["app_screenshot","App"]] as const).map(([value,label])=><button key={value} className={assetFilter===value?"active":""} onClick={()=>setAssetFilter(value)}>{label}</button>)}</div>
       <div className="ce-assets">{filtered.map(a=><button className={String(a.id)===String(selectedAsset?.id)?"active":""} key={a.id} title={a.filename+" · "+(a.scene||a.source_type||"")} onClick={()=>chooseAsset(selection,a.id)}><img src={a.public_url}/><span>{a.persona_id||a.source_type?.replace("_generated","")||"asset"}</span></button>)}</div>
       <h3>Generate with {personas.find(p=>p.id===carousel.persona_id)?.name||carousel.persona_id}</h3>
       <textarea value={scene} onChange={e=>setScene(e.target.value)} placeholder="Scene: mirror selfie after skincare…"/>
       <button className="primary wide" onClick={generate}>Generate & insert here</button>
      </div>
     }
     <button className="reset" onClick={()=>{checkpoint();setOverrides(o=>{const n={...o};delete n[key];return n});markChanged()}}>Reset slide to template</button>
    </>
   }
  </aside>
 </main>
}