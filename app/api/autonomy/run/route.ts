import { runScheduler } from '../../../../src/autonomy/scheduler';
import { processQueuedIdeas, retryPendingRenders } from '../../../../src/autonomy/processor';
import { refillPersonaCaches, processPendingImageJobs } from '../../../../src/autonomy/image-cache';
import { refreshPublishStatuses, refreshPostAnalytics, queueWinnerVariants } from '../../../../src/autonomy/performance';
import { autoScheduleApproved } from '../../../../src/autonomy/publishing';

export const runtime='nodejs';
export const maxDuration=300;

function authorized(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret)return false;
  return request.headers.get('authorization')===`Bearer ${secret}`;
}

export async function GET(request:Request){
  if(!authorized(request))return Response.json({error:'Unauthorized cron request'},{status:401});
  const startedAt=new Date().toISOString();
  const result:Record<string,unknown>={startedAt};
  const errors:Record<string,string>={};
  async function stage<T>(name:string,run:()=>Promise<T>){
    try{
      result[name]=await run();
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      errors[name]=message;
      result[`${name}Error`]=message;
    }
  }
  await stage('publishStatus',refreshPublishStatuses);
  await stage('analytics',refreshPostAnalytics);
  await stage('winnerVariants',queueWinnerVariants);
  await stage('cacheRefill',refillPersonaCaches);
  await stage('imageJobs',processPendingImageJobs);
  await stage('scheduler',runScheduler);
  await stage('drafts',processQueuedIdeas);
  await stage('rerenders',retryPendingRenders);
  await stage('publishing',autoScheduleApproved);
  result.finishedAt=new Date().toISOString();
  result.ok=Object.keys(errors).length===0;
  result.errors=errors;
  return Response.json(result,{status:Object.keys(errors).length===0?200:500});
}
