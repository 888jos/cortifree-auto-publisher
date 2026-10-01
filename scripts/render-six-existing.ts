import { renderCarousel } from "../app/lib/render-carousel";
import { dataBackend } from "../app/lib/data-backend";
import { z } from "zod";
import { carouselSlideSchema } from "../app/lib/ai/schemas";

const ids = [
"CF_QA_F01_1790889981412","CF_QA_F03_1790889999475","CF_QA_F04_1790890014463",
"CF_QA_F05_1790890028772","CF_QA_F07_1790890044105","CF_QA_F08_1790890061431"
];
const schema=z.object({carousel_type:z.string(),model_id:z.string(),references:z.array(z.any()).optional(),generated_slides:z.array(carouselSlideSchema)}).passthrough();
for(const id of ids){
 const response=await dataBackend(`carousels?id=eq.${encodeURIComponent(id)}&select=id,persona_id,spec&limit=1`);
 if(!response.ok) throw new Error(await response.text());
 const rows=await response.json() as Array<{id:string;persona_id?:string;spec:unknown}>;
 if(!rows[0]) throw new Error(`${id}: missing`);
 const spec=schema.parse(rows[0].spec);
 try{
  const slides=await renderCarousel({id,carouselType:spec.carousel_type,layout:spec.model_id,personaId:rows[0].persona_id,slides:spec.generated_slides,references:spec.references,spec});
  console.log(JSON.stringify({id,ok:true,rendered:slides.length,slides:slides.map((s:any)=>({position:s.position,url:s.url,assetId:s.assetId}))}));
 }catch(error){
  console.log(JSON.stringify({id,ok:false,error:error instanceof Error?error.message:String(error)}));
 }
}