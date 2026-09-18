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
  try{result.publishStatus=await refreshPublishStatuses();}catch(error){result.publishStatusError=error instanceof Error?error.message:String(error);}
  try{result.analytics=await refreshPostAnalytics();}catch(error){result.analyticsError=error instanceof Error?error.message:String(error);}
  try{result.winnerVariants=await queueWinnerVariants();}catch(error){result.winnerVariantsError=error instanceof Error?error.message:String(error);}
  try{result.cacheRefill=await refillPersonaCaches();}catch(error){result.cacheRefillError=error instanceof Error?error.message:String(error);}
  try{result.imageJobs=await processPendingImageJobs();}catch(error){result.imageJobsError=error instanceof Error?error.message:String(error);}
  try{result.scheduler=await runScheduler();}catch(error){result.schedulerError=error instanceof Error?error.message:String(error);}
  try{result.drafts=await processQueuedIdeas();}catch(error){result.draftsError=error instanceof Error?error.message:String(error);}
  try{result.rerenders=await retryPendingRenders();}catch(error){result.rerendersError=error instanceof Error?error.message:String(error);}
  try{result.publishing=await autoScheduleApproved();}catch(error){result.publishingError=error instanceof Error?error.message:String(error);}
  result.finishedAt=new Date().toISOString();
  return Response.json(result);
}
