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
 useEffect(()=>{if(id)void loadVersions()},[id]);
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
 function layerId(target:LayerTarget){return typeof target==="number"?"image:"+target:target}
 function layerFlags(target:LayerTarget){return editorState.layers?.[key]?.[layerId(target)]||{}}
 function isLocked(target:LayerTarget){return Boolean(layerFlags(target).locked)}
 function isHidden(target:LayerTarget){return Boolean(layerFlags(target).hidden)}
 function checkpoint(){setHistory(h=>[...h.slice(-49),{overrides:structuredClone(overrides),editorState:structuredClone(editorState)}]);setFuture([])}
 function markChanged(){revision.current+=1;setDirty(true);setSaveState("unsaved");setRenderOutdated(true)}
 function updateLayerFlags(target:LayerTarget,next:Partial<LayerFlags>){checkpoint();const id=layerId(target);setEditorState(state=>{const slideLayers=state.layers?.[key]||{};return {...state,layers:{...(state.layers||{}),[key]:{...slideLayers,[id]:{...(slideLayers[id]||{}),...next}}}}});markChanged()}
 function toggleSnap(){checkpoint();setEditorState(state=>({...state,snap:state.snap===false}));markChanged()}
 function setOv(next:Override,live=false){if(isLocked(selection))return;if(!live)checkpoint();setOverrides(o=>({...o,[key]:{...(o[key]||{}),...next}}));markChanged()}
 function textPatch(next:any,live=false){if(typeof selection==="number"||isLocked(selection))return;setOv({text:{...(ov.text||{}),...next}},live)}
 function slotPatch(index:number,next:Partial<Frame>,live=false){if(isLocked(index))return;const arr=slots.map(x=>({...x}));arr[index]={...arr[index]!,...next};setOv({imageSlots:arr},live)}
 function chooseAsset(index:number,aid:string|number){if(isLocked(index))return;const ids=[...assetIds];ids[index]=aid;setOv({assetIds:ids})}
 function undo(){if(!history.length)return;const prev=history.at(-1)!;setFuture(f=>[{overrides:structuredClone(overrides),editorState:structuredClone(editorState)},...f]);setOverrides(prev.overrides);setEditorState(prev.editorState);setHistory(h=>h.slice(0,-1));markChanged()}
 function redo(){if(!future.length)return;const next=future[0]!;setHistory(h=>[...h,{overrides:structuredClone(overrides),editorState:structuredClone(editorState)}]);setOverrides(next.overrides);setEditorState(next.editorState);setFuture(f=>f.slice(1));markChanged()}
 function snapAxis(value:number,size:number,axis:"x"|"y"){if(editorState.snap===false)return {value:Math.round(value)};const targets=axis==="x"?[0,64,540,1016,1080]:[0,64,675,1286,1350],anchors=[0,size/2,size];let best:{delta:number;guide:number}|null=null;for(const target of targets){for(const anchor of anchors){const delta=target-(value+anchor);if(Math.abs(delta)<=12&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,guide:target}}}return best?{value:Math.round(value+best.delta),guide:best.guide}:{value:Math.round(value)}}
 function down(e:React.PointerEvent,kind:string,target:LayerTarget=selection){e.stopPropagation();if(isLocked(target))return;checkpoint();const fr=typeof target==="number"?slots[target]:null;const textX=target==="headline"?(text.headlineX??text.x??90):(text.bodyX??text.x??90);drag.current={kind,target,x:e.clientX,y:e.clientY,x0:fr?.x??Number(textX),y0:fr?.y??Number(target==="headline"?(text.headlineY??text.y??700):(text.bodyY??900)),w0:fr?.width??Number(text.width||850),h0:fr?.height??300,size0:Number(target==="headline"?text.headlineSize||54:text.bodySize||28)};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
 function move(e:React.PointerEvent){const d=drag.current;if(!d)return;const target=d.target as LayerTarget,scale=Math.max(.1,canvasScale),dx=(e.clientX-d.x)/scale,dy=(e.clientY-d.y)/scale;if(typeof target==="number"){if(d.kind==="resize"){slotPatch(target,{width:Math.max(80,Math.round(d.w0+dx)),height:Math.max(80,Math.round(d.h0+dy))},true);setGuides({})}else{const sx=snapAxis(d.x0+dx,d.w0,"x"),sy=snapAxis(d.y0+dy,d.h0,"y");setGuides({x:sx.guide,y:sy.guide});slotPatch(target,{x:sx.value,y:sy.value},true)}}else if(d.kind==="resize"){textPatch(target==="headline"?{width:Math.max(120,Math.round(d.w0+dx)),headlineSize:Math.max(12,Math.round(d.size0+dy*.18))}:{width:Math.max(120,Math.round(d.w0+dx)),bodySize:Math.max(12,Math.round(d.size0+dy*.18))},true);setGuides({})}else{const sx=snapAxis(d.x0+dx,d.w0,"x"),sy=snapAxis(d.y0+dy,d.h0,"y");setGuides({x:sx.guide,y:sy.guide});textPatch(target==="headline"?{headlineX:sx.value,headlineY:sy.value}:{bodyX:sx.value,bodyY:sy.value},true)}}
 function endDrag(){drag.current=null;setGuides({})}
 function copySelected(){if(typeof selection==="number"){setClipboard({kind:"image",assetId:assetIds[selection],frame:structuredClone(slots[selection]||defaultSlots(layout,isHook,1)[0]!)});setBusy("Image layer copied");return}const common={fontFamily:text.fontFamily,align:text.align,width:text.width};const props=selection==="headline"?{...common,headlineSize:text.headlineSize,editorHeadlineColor:text.editorHeadlineColor,headlineColor:text.headlineColor,headlineWeight:text.headlineWeight,headlineX:text.headlineX,headlineY:text.headlineY}:{...common,bodySize:text.bodySize,editorBodyColor:text.editorBodyColor,bodyColor:text.bodyColor,bodyWeight:text.bodyWeight,bodyX:text.bodyX,bodyY:text.bodyY};setClipboard({kind:"text",source:selection,content:String(selection==="headline"?headline:body),props});setBusy((selection==="headline"?"Title":"Body")+" copied")}
 function pasteSelected(){if(!clipboard){setBusy("Nothing copied yet");return}if(isLocked(selection)){setBusy("Unlock this layer before pasting");return}if(clipboard.kind==="text"){if(typeof selection==="number"||selection!==clipboard.source){setBusy("Paste into the same text layer type");return}checkpoint();setOverrides(o=>({...o,[key]:{...(o[key]||{}),...(selection==="headline"?{headline:clipboard.content}:{body:clipboard.content}),text:{...(o[key]?.text||{}),...clipboard.props}}}));markChanged();setBusy("Text layer pasted");return}if(typeof selection!=="number"){setBusy("Select an image layer to paste");return}checkpoint();const ids=[...assetIds],frames=slots.map(x=>({...x}));if(clipboard.assetId!=null)ids[selection]=clipboard.assetId;frames[selection]={...clipboard.frame};setOverrides(o=>({...o,[key]:{...(o[key]||{}),assetIds:ids,imageSlots:frames}}));markChanged();setBusy("Image layer pasted")}
 function isStructureProtected(index:number){const role=String(generated[index]?.role||"").toUpperCase();return index===0||role==="HOOK"||role==="CTA"||role==="TAKEAWAY"}
 async function loadVersions(){if(!id)return;const response=await fetch("/api/carousels/"+id+"/versions",{cache:"no-store"});if(response.ok){const out=await response.json();setVersions(out.versions||[])}}
 async function snapshotVersion(label="Manual editor snapshot"){const response=await fetch("/api/carousels/"+id+"/versions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"snapshot",label})});if(!response.ok){setBusy("Version snapshot failed");return false}const out=await response.json();setCarousel((current:any)=>({...current,current_version:out.version}));await loadVersions();return true}
 async function saveNow(){const ok=await save(false,false);if(ok){await snapshotVersion("Manual save");setBusy("Saved + version created")}}
 async function restoreVersion(eventId:string){setStructureBusy(true);setBusy("Restoring version...");try{if(dirty){const ok=await save(false,true);if(!ok)return}const response=await fetch("/api/carousels/"+id+"/versions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"restore",eventId})});const out=await response.json();if(!response.ok||!out.carousel){setBusy(out.error||"Restore failed");return}setCarousel(out.carousel);setSlides([]);setOverrides(out.carousel.spec?.editor_overrides||{});setEditorState(out.carousel.spec?.editor_state||{snap:true,layers:{}});setActive(0);setSelection("headline");setHistory([]);setFuture([]);setDirty(false);setSaveState("saved");setRenderOutdated(true);setHistoryMode(false);setBusy("Version restored · render required");await loadVersions()}finally{setStructureBusy(false)}}
 async function structureAction(payload:any){if(structureBusy)return;setStructureBusy(true);setBusy(payload.action==="reorder"?"Reordering slides...":payload.action==="duplicate"?"Duplicating slide...":"Deleting slide...");try{if(dirty){const ok=await save(false,true);if(!ok)return}const response=await fetch("/api/carousels/"+id+"/structure",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const out=await response.json();if(!response.ok||!out.carousel){setBusy(out.error||"Structure update failed");return}setCarousel(out.carousel);setSlides([]);setOverrides(out.carousel.spec?.editor_overrides||{});setEditorState(out.carousel.spec?.editor_state||{snap:true,layers:{}});setActive(Number(out.activeIndex||0));setSelection("headline");setEditingText(null);setHistory([]);setFuture([]);setDirty(false);setSaveState("saved");setRenderOutdated(true);setBusy("Structure updated · render required");await loadVersions()}finally{setSlideDragIndex(null);setStructureBusy(false)}}
 async function refreshCarousel(){const next=await fetch("/api/carousels/"+id,{cache:"no-store"}).then(r=>r.json());if(next.carousel){setCarousel(next.carousel);setSlides(next.slides||[]);setOverrides(next.carousel.spec?.editor_overrides||overrides);setEditorState(next.carousel.spec?.editor_state||editorState)}return next}
 async function waitForRender(){for(let attempt=0;attempt<30;attempt+=1){await new Promise(resolve=>setTimeout(resolve,1500));const next=await refreshCarousel();if(next.carousel?.status==="READY_FOR_REVIEW"&&!next.carousel?.spec?.editor_structure_dirty)return true}return false}
 async function save(render=false,silent=false){const rev=revision.current,snapshot=structuredClone(overrides),editorSnapshot=structuredClone(editorState);setSaveState("saving");if(!silent)setBusy(render?"Rendering...":"Saving...");const spec={...carousel.spec,editor_overrides:snapshot,editor_state:editorSnapshot};const r=await fetch("/api/carousels/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({spec})});if(!r.ok){setSaveState("error");if(!silent)setBusy("Save failed");return false}setCarousel((current:any)=>({...current,spec}));if(revision.current===rev){setDirty(false);setSaveState("saved")}else setSaveState("unsaved");if(!render){if(!silent)setBusy("Saved");return true}const rr=await fetch("/api/carousels/"+id+"/render",{method:"POST"});if(!rr.ok){setBusy("Render failed");return false}if(rr.status===202){setBusy("Render queued...");const done=await waitForRender();setBusy(done?"Rendered":"Render still running");if(done)setRenderOutdated(false)}else{await refreshCarousel();setRenderOutdated(false);setBusy("Rendered")}return true}
 function commitInline(kind:"headline"|"body",event:React.FocusEvent<HTMLDivElement>){if(isLocked(kind)){setEditingText(null);return}const value=event.currentTarget.innerText.replace(/\n{3,}/g,"\n\n").trim();const current=kind==="headline"?String(headline):String(body);if(value!==current)setOv(kind==="headline"?{headline:value}:{body:value});setEditingText(null)}
 async function generate(){if(selectedSlot===null||isLocked(selectedSlot))return;const persona=personas.find(p=>p.id===carousel.persona_id)||personas[0],ref=refs[0];if(!persona?.master||!ref){setBusy("Missing persona/reference");return}setBusy("Generating persona image…");const cr=await fetch("/api/image-generation/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({persona_id:persona.id,master_asset_id:persona.master.id,visual_reference_id:ref.id,carousel_id:id,slide_id:"slide_"+key,category:"self_care",scene:scene||"natural candid lifestyle photo matching the selected carousel image slot",framing:"portrait"})});const cj=await cr.json();if(!cj.job?.id){setBusy(cj.error||"Generation failed");return}const rr=await fetch("/api/image-generation/jobs/"+cj.job.id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"run"})});const out=await rr.json();if(out.asset?.id){const generatedAsset:Asset={...out.asset,public_url:out.asset.public_url||out.asset.url,source_type:"persona_generated",persona_id:persona.id};setAssets(a=>[generatedAsset,...a.filter(x=>String(x.id)!==String(generatedAsset.id))]);chooseAsset(selectedSlot,generatedAsset.id);setBusy("Generated & inserted")}else setBusy(out.error||"Generation failed")}
 if(!carousel)return <main className="ce-loading">Loading Carousel Studio…</main>;
 const filtered=assets.filter(a=>(assetFilter==="all"||a.source_type===assetFilter)&&(!assetSearch||[a.filename,a.source_type,a.persona_id,a.category,a.subcategory,a.scene].join(" ").toLowerCase().includes(assetSearch.toLowerCase()))).slice(0,240);
 const saveLabel=saveState==="saving"?"Saving…":saveState==="unsaved"?"Unsaved":saveState==="error"?"Save failed":"Saved";
 const activeHealth=diagnostics[active]||{level:"ok",issues:[]};
 return <main className="ce-shell" tabIndex={-1} onKeyDown={e=>{
   const target=e.target as HTMLElement,typing=Boolean(editingText)||["INPUT","TEXTAREA","SELECT"].includes(target.tagName)||target.isContentEditable;
   if(!typing&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo()}
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="s"){e.preventDefault();void saveNow()}
   if(!typing&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="c"){e.preventDefault();copySelected()}
   if(!typing&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="v"){e.preventDefault();pasteSelected()}
   if(e.key==="Escape"){setEditingText(null);setPreviewMode(false);setDiagnoseMode(false);setHistoryMode(false);setGuides({})}
 }}>
  <header className="ce-top">
   <a href="/">← Carrousels</a>
   <div className="ce-titleblock"><strong>{carousel.topic||carousel.content_type||"Untitled carousel"}</strong><small>{carousel.content_type} · {layout}</small></div>
   <div className="ce-history-actions"><button disabled={!history.length} onClick={undo} title="Undo">↶</button><button disabled={!future.length} onClick={redo} title="Redo">↷</button></div>
   <span className={"ce-save-state "+saveState}>{saveLabel}</span>
   {renderOutdated&&<span className="ce-outdated">Render outdated</span>}
   <button className={previewMode?"active":""} onClick={()=>{setPreviewMode(v=>!v);setDiagnoseMode(false);setHistoryMode(false)}}>Preview</button>
   <button className={(diagnoseMode?"active ":"")+"ce-diagnose-button"} onClick={()=>{setDiagnoseMode(v=>!v);setPreviewMode(false);setHistoryMode(false)}}>Diagnose {blockingCount>0?<b>{blockingCount}</b>:warningCount>0?<em>{warningCount}</em>:<i>✓</i>}</button>
   <button className={historyMode?"active":""} onClick={()=>{void loadVersions();setHistoryMode(v=>!v);setPreviewMode(false);setDiagnoseMode(false)}}>History</button>
   <button onClick={()=>void saveNow()}>Save now</button>
   <button className="primary" onClick={()=>{if(blockingCount){setDiagnoseMode(true);setPreviewMode(false);setBusy(blockingCount+" blocking issue"+(blockingCount>1?"s":"")+" before render")}else void save(true)}}>Render</button>
  </header>

  <aside className="ce-slides">
   <div className="ce-sidebar-label">Slides <span>{generated.length}</span></div>
   {generated.map((s:any,i:number)=>{
    const health=diagnostics[i]||{level:"ok",issues:[]};
    const ids=assignedIds(i),fallback=assets.find(a=>String(a.id)===String(ids[0]))?.public_url;
    const thumb=slides[i]?.rendered_url||carousel.spec?.rendered_slides?.[i]?.url||fallback||"";
    const protectedSlide=isStructureProtected(i);
    return <div key={s.position??i} className={"ce-slide-card "+(i===active?"active ":"")+(slideDragIndex===i?"dragging ":"")} draggable={!protectedSlide&&!structureBusy} onDragStart={e=>{if(protectedSlide){e.preventDefault();return}setSlideDragIndex(i);e.dataTransfer.effectAllowed="move"}} onDragOver={e=>{if(slideDragIndex!==null&&!protectedSlide){e.preventDefault();e.dataTransfer.dropEffect="move"}}} onDrop={e=>{e.preventDefault();if(slideDragIndex!==null&&!protectedSlide&&slideDragIndex!==i)void structureAction({action:"reorder",fromIndex:slideDragIndex,toIndex:i})}} onDragEnd={()=>setSlideDragIndex(null)}>
      <button className="ce-slide-main" onClick={()=>{setActive(i);setSelection("headline");setEditingText(null);setPreviewMode(false)}}>
       <div className="ce-thumb-wrap">{thumb?<img src={thumb} alt={"Slide "+(i+1)}/>:<div className="ce-thumb-empty">No render</div>}<span className={"ce-health "+health.level}>{health.level==="ok"?"✓":health.level==="error"?"!":"⚠"}</span>{protectedSlide&&<span className="ce-structure-lock" title="Protected format slide">◆</span>}</div>
       <div className="ce-slide-meta"><b>{String(s.position??i+1).padStart(2,"0")}</b><span>{String(s.role||"slide").toLowerCase()}</span><i>{protectedSlide?"fixed":"drag"}</i></div>
      </button>
      <div className="ce-slide-actions">
       <button disabled={protectedSlide||generated.length>=12||structureBusy} title="Duplicate slide" onClick={()=>void structureAction({action:"duplicate",index:i})}>⧉</button>
       <button disabled={protectedSlide||generated.length<=4||structureBusy} title="Delete slide" onClick={()=>void structureAction({action:"delete",index:i})}>×</button>
      </div>
     </div>
   })}
   <div className="ce-slide-help">Drag middle slides to reorder. Hook and CTA stay fixed.</div>
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
      <button className={"ce-snap-toggle "+(editorState.snap===false?"":"active")} onClick={toggleSnap}>Snap {editorState.snap===false?"off":"on"}</button>
      <button className="ce-context-action" onClick={copySelected}>Copy</button><button className="ce-context-action" disabled={!clipboard} onClick={pasteSelected}>Paste</button>
      <span className="ce-tip">Double-click text to edit inline</span>
     </div>
     <div ref={canvasRef} className={"ce-canvas layout-"+layout}>
      <div className="ce-safe-area"/>
      {guides.x!=null&&<div className="ce-guide ce-guide-v" style={{left:guides.x*canvasScale}}/>}{guides.y!=null&&<div className="ce-guide ce-guide-h" style={{top:guides.y*canvasScale}}/>}
      {layout==="interactive-checklist"&&!isHook&&<div className="ce-checklist-panel"/>}
      {layout==="ranking"&&<div className="ce-ranking-wash"/>}
      {slots.map((frame:Frame,i:number)=>{
       if(isHidden(i))return null;
       const asset=slotAssets[i],locked=isLocked(i);
       return <div key={i} className={"ce-image-frame "+(selection===i?"sel ":"")+(asset?"":"ce-missing-slot ")+(locked?"locked":"")} style={{left:frame.x*canvasScale,top:frame.y*canvasScale,width:frame.width*canvasScale,height:frame.height*canvasScale}} onClick={()=>setSelection(i)} onPointerDown={e=>{setSelection(i);down(e,"move",i)}} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {asset?<img draggable={false} src={asset.public_url} style={{transform:`scale(${frame.zoom||1})`,objectPosition:`${frame.cropX??50}% ${frame.cropY??50}%`}}/>:<span>+ image</span>}
        {selection===i&&!locked&&<i className="ce-handle" onPointerDown={e=>down(e,"resize",i)} onPointerMove={move}/>}
        {locked&&<span className="ce-lock-badge">Locked</span>}
       </div>
      })}
      {!isHidden("headline")&&<div contentEditable={editingText==="headline"&&!isLocked("headline")} suppressContentEditableWarning className={"ce-text "+(selection==="headline"?"sel ":"")+(editingText==="headline"?"editing ":"")+(isLocked("headline")?"locked":"")} onClick={()=>setSelection("headline")} onDoubleClick={e=>{e.stopPropagation();setSelection("headline");if(!isLocked("headline"))setEditingText("headline")}} onBlur={e=>commitInline("headline",e)} onPointerDown={e=>{if(editingText!=="headline")down(e,"move","headline");else e.stopPropagation()}} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag} style={{left:Number(text.headlineX??text.x??90)*canvasScale,top:Number(text.headlineY??text.y??700)*canvasScale,width:Number(text.width||850)*canvasScale,fontSize:Number(text.headlineSize||54)*canvasScale,color:text.editorHeadlineColor||text.headlineColor||"#fff",fontFamily:text.fontFamily||"TikTok Sans",textAlign:text.align||"left",fontWeight:text.headlineWeight||700}}>{headline}{selection==="headline"&&editingText!=="headline"&&!isLocked("headline")&&<i className="ce-handle" onPointerDown={e=>down(e,"resize","headline")} onPointerMove={move}/>} {isLocked("headline")&&<span className="ce-lock-badge">Locked</span>}</div>}
      {body&&!isHidden("body")&&<div contentEditable={editingText==="body"&&!isLocked("body")} suppressContentEditableWarning className={"ce-text body "+(selection==="body"?"sel ":"")+(editingText==="body"?"editing ":"")+(isLocked("body")?"locked":"")} onClick={()=>setSelection("body")} onDoubleClick={e=>{e.stopPropagation();setSelection("body");if(!isLocked("body"))setEditingText("body")}} onBlur={e=>commitInline("body",e)} onPointerDown={e=>{if(editingText!=="body")down(e,"move","body");else e.stopPropagation()}} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag} style={{left:Number(text.bodyX??text.x??90)*canvasScale,top:Number(text.bodyY||900)*canvasScale,width:Number(text.width||850)*canvasScale,fontSize:Number(text.bodySize||28)*canvasScale,color:text.editorBodyColor||text.bodyColor||"#fff",fontFamily:text.fontFamily||"TikTok Sans",textAlign:text.align||"left",fontWeight:text.bodyWeight||500}}>{body}{selection==="body"&&editingText!=="body"&&!isLocked("body")&&<i className="ce-handle" onPointerDown={e=>down(e,"resize","body")} onPointerMove={move}/>} {isLocked("body")&&<span className="ce-lock-badge">Locked</span>}</div>}
     </div>
    </>
   }
   <div className="ce-status">{busy}</div>
  </section>

  <aside className="ce-props">
   {historyMode?
    <div className="ce-history-panel">
     <div className="ce-diagnostic-head"><div><h2>Version history</h2><small>Persistent snapshots stored with this carousel.</small></div><button onClick={()=>setHistoryMode(false)}>×</button></div>
     <button className="ce-history-create" onClick={()=>void snapshotVersion("Manual snapshot")}>+ Create snapshot now</button>
     {!versions.length&&<div className="ce-history-empty">No saved versions yet. Structural edits and manual saves will appear here.</div>}
     <div className="ce-version-list">{versions.map(version=><div className="ce-version-card" key={version.id}><div><b>v{version.version??"?"} · {version.label||version.type}</b><span>{new Date(version.created_at).toLocaleString()}</span><small>{version.slide_count?version.slide_count+" slides":version.type.replaceAll("_"," ").toLowerCase()}</small></div><button disabled={structureBusy} onClick={()=>void restoreVersion(version.id)}>Restore</button></div>)}</div>
     <div className="ce-history-note">Restoring a version invalidates the current render. Nothing is published automatically.</div>
    </div>:
   diagnoseMode?
    <div className="ce-diagnostics">
     <div className="ce-diagnostic-head"><h2>Carousel health</h2><button onClick={()=>setDiagnoseMode(false)}>×</button></div>
     <div className="ce-health-summary"><div><b>{blockingCount}</b><span>blocking</span></div><div><b>{warningCount}</b><span>warnings</span></div><div><b>{diagnostics.filter((d:any)=>d.level==="ok").length}</b><span>ready slides</span></div></div>
     {blockingCount===0&&warningCount===0&&<div className="ce-all-good"><b>Ready to render</b><span>No structural or asset issues detected.</span></div>}
     {diagnostics.map((d:any,i:number)=>d.issues.length?<div className="ce-diagnostic-group" key={i}><h3>Slide {i+1} · {String(generated[i]?.role||"slide")}</h3>{d.issues.map((issue:any,j:number)=><button key={j} className={"ce-finding "+issue.level} onClick={()=>{setActive(i);setSelection(issue.selection??"headline");setDiagnoseMode(false);setPreviewMode(false)}}><span>{issue.level==="error"?"!":"⚠"}</span><div><b>{issue.label}</b>{issue.detail&&<small>{issue.detail}</small>}</div></button>)}</div>:null)}
    </div>:
    <>
     <div className="ce-layerlist">
      <div className="ce-layer-title"><b>Layers</b><span>slide {active+1}</span></div>
      <div className={"ce-layer-row "+(selection==="headline"?"active ":"")+(isHidden("headline")?"hidden ":"")+(isLocked("headline")?"locked":"")}><button className="ce-layer-main" onClick={()=>setSelection("headline")}>T · Title</button><button title="Hide in editor only" onClick={()=>updateLayerFlags("headline",{hidden:!isHidden("headline")})}>{isHidden("headline")?"◌":"◉"}</button><button title={isLocked("headline")?"Unlock layer":"Lock layer"} onClick={()=>updateLayerFlags("headline",{locked:!isLocked("headline")})}>{isLocked("headline")?"🔒":"🔓"}</button></div>
      {body&&<div className={"ce-layer-row "+(selection==="body"?"active ":"")+(isHidden("body")?"hidden ":"")+(isLocked("body")?"locked":"")}><button className="ce-layer-main" onClick={()=>setSelection("body")}>T · Body</button><button title="Hide in editor only" onClick={()=>updateLayerFlags("body",{hidden:!isHidden("body")})}>{isHidden("body")?"◌":"◉"}</button><button title={isLocked("body")?"Unlock layer":"Lock layer"} onClick={()=>updateLayerFlags("body",{locked:!isLocked("body")})}>{isLocked("body")?"🔒":"🔓"}</button></div>}
      {slots.map((_,i)=><div className={"ce-layer-row "+(selection===i?"active ":"")+(isHidden(i)?"hidden ":"")+(isLocked(i)?"locked":"")} key={i}><button className="ce-layer-main" onClick={()=>setSelection(i)}>▧ · Image {i+1}</button><button title="Hide in editor only" onClick={()=>updateLayerFlags(i,{hidden:!isHidden(i)})}>{isHidden(i)?"◌":"◉"}</button><button title={isLocked(i)?"Unlock layer":"Lock layer"} onClick={()=>updateLayerFlags(i,{locked:!isLocked(i)})}>{isLocked(i)?"🔒":"🔓"}</button></div>)}
      <small className="ce-layer-note">Eye = editor visibility only. Lock prevents accidental edits.</small>
     </div>
     <div className="ce-layer-actions"><button onClick={copySelected}>Copy <kbd>⌘C</kbd></button><button disabled={!clipboard} onClick={pasteSelected}>Paste <kbd>⌘V</kbd></button></div>
     {isLocked(selection)&&<div className="ce-locked-notice">This layer is locked. Unlock it above to edit.</div>}
     {isHidden(selection)&&<div className="ce-hidden-notice">This layer is hidden on the editor canvas only. It still renders normally.</div>}
     {typeof selection!=="number"?
      <div className={"ce-panel "+(isLocked(selection)?"locked":"")}>
       <div className="ce-panel-heading"><div><b>{selection==="headline"?"Title":"Body"}</b><span>Content & design</span></div><button disabled={isLocked(selection)||isHidden(selection)} onClick={()=>setEditingText(selection)}>Edit inline</button></div>
       <label>Text<textarea disabled={isLocked(selection)} value={selection==="headline"?headline:body} onChange={e=>setOv(selection==="headline"?{headline:e.target.value}:{body:e.target.value})}/><small className={(selection==="headline"?headline.length:body.length)>(selection==="headline"?90:280)?"over":""}>{selection==="headline"?headline.length:body.length}/{selection==="headline"?90:280}</small></label>
       <label>Font<select disabled={isLocked(selection)} value={text.fontFamily||"TikTok Sans"} onChange={e=>textPatch({fontFamily:e.target.value})}>{FONTS.map(x=><option key={x}>{x}</option>)}</select></label>
       <div className="ce-row"><label>Size<input disabled={isLocked(selection)} type="number" value={selection==="headline"?text.headlineSize||54:text.bodySize||28} onChange={e=>textPatch(selection==="headline"?{headlineSize:+e.target.value}:{bodySize:+e.target.value})}/></label><label>Color<input disabled={isLocked(selection)} type="color" value={(selection==="headline"?text.editorHeadlineColor||text.headlineColor:text.editorBodyColor||text.bodyColor)||"#ffffff"} onChange={e=>textPatch(selection==="headline"?{editorHeadlineColor:e.target.value,headlineColor:e.target.value}:{editorBodyColor:e.target.value,bodyColor:e.target.value})}/></label></div>
       <label>Align<select disabled={isLocked(selection)} value={text.align||"left"} onChange={e=>textPatch({align:e.target.value})}><option>left</option><option>center</option><option>right</option></select></label>
       <div className="ce-row"><label>X<input disabled={isLocked(selection)} type="number" value={selection==="headline"?(text.headlineX??text.x??90):(text.bodyX??text.x??90)} onChange={e=>textPatch(selection==="headline"?{headlineX:+e.target.value}:{bodyX:+e.target.value})}/></label><label>Y<input disabled={isLocked(selection)} type="number" value={selection==="headline"?(text.headlineY??text.y??700):(text.bodyY??900)} onChange={e=>textPatch(selection==="headline"?{headlineY:+e.target.value}:{bodyY:+e.target.value})}/></label></div>
       <div className="ce-row"><label>Width<input disabled={isLocked(selection)} type="number" value={text.width??850} onChange={e=>textPatch({width:+e.target.value})}/></label><label>Weight<input disabled={isLocked(selection)} type="number" min="100" max="900" step="100" value={selection==="headline"?text.headlineWeight||700:text.bodyWeight||500} onChange={e=>textPatch(selection==="headline"?{headlineWeight:+e.target.value}:{bodyWeight:+e.target.value})}/></label></div>
      </div>:
      <div className={"ce-panel "+(isLocked(selection)?"locked":"")}>
       <div className="ce-panel-heading"><div><b>Image {selection+1}</b><span>Crop, source & replacement</span></div></div>
       {selectedAsset?<div className="ce-selected-asset"><img src={selectedAsset.public_url}/><div><b>{selectedAsset.filename}</b><span>{selectedAsset.source_type||"unknown"}{selectedAsset.persona_id?" · "+selectedAsset.persona_id:""}</span><small>{selectedAsset.scene||selectedAsset.category||"No scene metadata"}</small></div></div>:<div className="ce-selected-asset missing"><b>No image assigned</b><span>Choose an asset below. Silent stock fallback is not allowed.</span></div>}
       {selectedAsset&&<div className="ce-provenance"><span><b>Source</b>{selectedAsset.source_type||"—"}</span><span><b>Persona</b>{selectedAsset.persona_id||"—"}</span><span><b>Uses</b>{selectedAsset.use_count??0}</span><span><b>Drive</b>{selectedAsset.drive_file_id?"linked":"—"}</span>{Boolean(selectedAsset.metadata?.generation_job_id)&&<span className="wide-meta"><b>Generation job</b>{String(selectedAsset.metadata?.generation_job_id)}</span>}</div>}
       <div className="ce-row"><label>X<input disabled={isLocked(selection)} type="number" value={selectedFrame?.x||0} onChange={e=>slotPatch(selection,{x:+e.target.value})}/></label><label>Y<input disabled={isLocked(selection)} type="number" value={selectedFrame?.y||0} onChange={e=>slotPatch(selection,{y:+e.target.value})}/></label></div>
       <div className="ce-row"><label>Width<input disabled={isLocked(selection)} type="number" value={selectedFrame?.width||0} onChange={e=>slotPatch(selection,{width:+e.target.value})}/></label><label>Height<input disabled={isLocked(selection)} type="number" value={selectedFrame?.height||0} onChange={e=>slotPatch(selection,{height:+e.target.value})}/></label></div>
       <label>Zoom<input disabled={isLocked(selection)} type="range" min="1" max="4" step=".05" value={selectedFrame?.zoom||1} onChange={e=>slotPatch(selection,{zoom:+e.target.value})}/></label>
       <div className="ce-row"><label>Crop X<input disabled={isLocked(selection)} type="range" min="0" max="100" value={selectedFrame?.cropX??50} onChange={e=>slotPatch(selection,{cropX:+e.target.value})}/></label><label>Crop Y<input disabled={isLocked(selection)} type="range" min="0" max="100" value={selectedFrame?.cropY??50} onChange={e=>slotPatch(selection,{cropY:+e.target.value})}/></label></div>
       <div className="ce-asset-heading"><h3>Replace</h3><small>{filtered.length} shown / {assets.length}</small></div>
       <input disabled={isLocked(selection)} placeholder="Search filename, persona, scene…" value={assetSearch} onChange={e=>setAssetSearch(e.target.value)}/>
       <div className="ce-asset-filters">{([["all","All"],["persona_generated","Persona"],["stock","Stock"],["app_screenshot","App"]] as const).map(([value,label])=><button disabled={isLocked(selection)} key={value} className={assetFilter===value?"active":""} onClick={()=>setAssetFilter(value)}>{label}</button>)}</div>
       <div className="ce-assets">{filtered.map(a=><button disabled={isLocked(selection)} className={String(a.id)===String(selectedAsset?.id)?"active":""} key={a.id} title={a.filename+" · "+(a.scene||a.source_type||"")} onClick={()=>chooseAsset(selection,a.id)}><img src={a.public_url}/><span>{a.persona_id||a.source_type?.replace("_generated","")||"asset"}</span></button>)}</div>
       <h3>Generate with {personas.find(p=>p.id===carousel.persona_id)?.name||carousel.persona_id}</h3>
       <textarea disabled={isLocked(selection)} value={scene} onChange={e=>setScene(e.target.value)} placeholder="Scene: mirror selfie after skincare…"/>
       <button disabled={isLocked(selection)} className="primary wide" onClick={generate}>Generate & insert here</button>
      </div>
     }
     <button className="reset" onClick={()=>{checkpoint();setOverrides(o=>{const n={...o};delete n[key];return n});setEditorState(state=>{const layers={...(state.layers||{})};delete layers[key];return {...state,layers}});markChanged()}}>Reset slide to template</button>
    </>
   }
  </aside>
 </main>
}