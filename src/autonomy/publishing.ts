import { loadRuntimeAccounts } from '../runtime/config';
import { dataBackend } from '../lib/data-backend';
import { evaluatePublishReadiness } from '../../app/lib/publish-readiness';
import { resolvePublishingProfile } from '../../app/lib/publishing-profile';
import { uploadPhotoCarousel } from '../../app/lib/upload-post';

type Row = Record<string, unknown>;
async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function patch(resource: string, body: Record<string, unknown>) {
  const response = await dataBackend(resource, { method: 'PATCH', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
}
async function insert(resource: string, body: unknown) {
  const response = await dataBackend(resource, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year:get('year'), month:get('month'), day:get('day'), hour:get('hour'), minute:get('minute') };
}
function zonedToUtc(year:number,month:number,day:number,hour:number,minute:number,timezone:string) {
  let guess = Date.UTC(year,month-1,day,hour,minute);
  for (let i=0;i<3;i+=1) {
    const p=localParts(new Date(guess),timezone);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    guess += Date.UTC(year,month-1,day,hour,minute)-represented;
  }
  return new Date(guess);
}
export function nextPostingTime(slots: string[], timezone: string, now = new Date()) {
  const local=localParts(now,timezone);
  const candidates=slots.map((slot)=>slot.split(':').map(Number)).filter((x)=>x.length===2&&Number.isFinite(x[0])&&Number.isFinite(x[1])) as number[][];
  for (const [hour,minute] of candidates.sort((a,b)=>a[0]*60+a[1]-b[0]*60-b[1])) {
    if (hour*60+minute > local.hour*60+local.minute+2) return zonedToUtc(local.year,local.month,local.day,hour,minute,timezone);
  }
  const nextCalendar=new Date(Date.UTC(local.year,local.month-1,local.day)+86_400_000);
  const [hour,minute]=candidates[0] ?? [11,30];
  return zonedToUtc(nextCalendar.getUTCFullYear(),nextCalendar.getUTCMonth()+1,nextCalendar.getUTCDate(),hour,minute,timezone);
}

export async function autoScheduleApproved() {
  if (process.env.AUTONOMY_AUTO_PUBLISH !== 'true') return [{ action:'AUTO_PUBLISH_DISABLED' }];
  if (process.env.DRY_RUN !== 'false') return [{ action:'BLOCKED_DRY_RUN' }];
  const report: Row[]=[];
  const accounts = await loadRuntimeAccounts();
  for (const account of accounts.filter((a)=>a.enabled&&a.posting_enabled&&a.warmup_status==='ACTIVE'&&Boolean(a.upload_post_profile))) {
    const carousel=(await rows(`carousels?account_id=eq.${encodeURIComponent(account.id)}&status=eq.APPROVED&order=created_at.asc&limit=1`))[0];
    if (!carousel) { report.push({account_id:account.id,action:'NO_APPROVED'}); continue; }
    const id=String(carousel.id);
    try {
      const existing=(await rows(`publish_jobs?carousel_id=eq.${encodeURIComponent(id)}&status=in.(SCHEDULING,SCHEDULED,PUBLISHING,PUBLISHED)&limit=1`))[0];
      if (existing) { report.push({account_id:account.id,carousel_id:id,action:'ALREADY_QUEUED'}); continue; }
      const platform:'tiktok'|'instagram'='tiktok';
      const profile=await resolvePublishingProfile({accountId:account.id,platform});
      if (!profile) { report.push({account_id:account.id,carousel_id:id,action:'BLOCKED_PROFILE'}); continue; }
      const slideRows=await rows(`carousel_slides?carousel_id=eq.${encodeURIComponent(id)}&select=position,rendered_url,asset_id&order=position.asc`);
      const spec=carousel.spec as Record<string,any>;
      const rawSpec={title:spec.title,topic:carousel.topic,angle:carousel.angle,hook:spec.hook,language:carousel.language,caption:carousel.caption,ctaType:carousel.cta_type,slides:spec.generated_slides};
      const rendered=slideRows.filter((s)=>s.rendered_url).map((s)=>({position:Number(s.position),url:String(s.rendered_url),assetId:s.asset_id as string|number|undefined}));
      const readiness=await evaluatePublishReadiness({rawSpec,renderedSlides:rendered,platform,profile});
      if(!readiness.ready){report.push({account_id:account.id,carousel_id:id,action:'BLOCKED_READINESS',issues:readiness.issues});continue;}
      const scheduledDate=nextPostingTime(account.posting_slots,account.timezone).toISOString();
      const idempotencyKey=`cortifree:${profile}:${platform}:${id}`;
      const jobs=await insert('publish_jobs?on_conflict=idempotency_key',{workspace_id:'cortifree',carousel_id:id,account_id:account.id,platform,scheduled_at:scheduledDate,external_id:id,idempotency_key:idempotencyKey,attempts:1,status:'SCHEDULING'});
      const job=jobs[0];
      const result=await uploadPhotoCarousel({carouselId:id,profile,platform,spec:readiness.spec,slides:rendered,scheduledDate});
      const requestId=typeof result.request_id==='string'?result.request_id:id;
      const jobId=typeof result.job_id==='string'?result.job_id:null;
      if(job?.id)await patch(`publish_jobs?id=eq.${encodeURIComponent(String(job.id))}`,{status:'SCHEDULED',provider_request_id:requestId,provider_job_id:jobId,last_error:null});
      await patch(`carousels?id=eq.${encodeURIComponent(id)}`,{status:'SCHEDULED',updated_at:new Date().toISOString()});
      report.push({account_id:account.id,carousel_id:id,action:'SCHEDULED',scheduled_at:scheduledDate});
    } catch(error){report.push({account_id:account.id,carousel_id:id,action:'ERROR',error:error instanceof Error?error.message:String(error)});}
  }
  return report;
}
