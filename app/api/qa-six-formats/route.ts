import { generateCarousel } from "../../lib/ai/carousel-generator";
import { resolveCanonicalEditorialContext } from "../../lib/editorial/canonical-context";
import { getRecentCarousels, saveGeneratedCarousel } from "../../lib/carousel-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const cases = [
  ["F01_LIFESTYLE_GUIDE","lifestyle-3stack",7],
  ["F03_ROUTINE_TIMELINE","routine-timeline",7],
  ["F04_AESTHETIC_EDUCATIONAL","three-rect-educational",7],
  ["F05_INTERACTIVE_CHECKLIST","interactive-checklist",7],
  ["F07_RANKING","ranking",7],
  ["F08_2X2","grid-2x2",7],
] as const;

export async function GET() {
  const output = [];
  for (const [carouselType, layout, requestedSlideCount] of cases) {
    const id = `CF_QA_${carouselType.slice(0,3)}_${Date.now()}`;
    const accountId = "CF_EN_01";
    const personaId = "P01";
    try {
      const recentCarousels = await getRecentCarousels();
      const canonical = await resolveCanonicalEditorialContext({accountId,personaId,formatId:carouselType,language:"en",market:"US",references:[],preferredHook:undefined});
      const input = {carouselType,layout,persona:"Emma",language:"en" as const,market:"US",references:[],recentCarousels,requestedSlideCount,preferredHook:canonical.preferredHook,ctaMode:"none" as const,bypassMonthlyCap:false,accountId,personaId,topicId:canonical.topicId,hookId:canonical.hookId,formatId:canonical.formatId,editorialContext:canonical.editorialContext,requireCanonicalContext:true};
      const result = await generateCarousel(input, {}, { carouselId:id });
      if (result.source !== "openai") throw new Error(result.warning ?? "AI required");
      const saved = await saveGeneratedCarousel({id,input,result,accountId,personaId});
      output.push({id,carouselType,status:saved.status,review_status:saved.review_status,hook:result.spec.hook,score:result.qa?.score,slides:result.spec.slides.map(s=>({position:s.position,headline:s.headline,body:s.body,assetType:s.assetType}))});
    } catch (error) {
      output.push({id,carouselType,error:error instanceof Error?error.message:String(error)});
    }
  }
  return Response.json({generated:output});
}
