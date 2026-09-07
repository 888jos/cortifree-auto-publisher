import { referenceModels } from "../../lib/reference-models.js";
export async function GET(){return Response.json({models:referenceModels,source:"TikTok reference analysis",editable:true});}
