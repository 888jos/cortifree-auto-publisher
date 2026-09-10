import { supabase } from "../../lib/supabase.js";
import { CORTIFREE_ACCOUNT_ID, CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";
export async function POST(req:Request){const input=await req.json();const row={...input,workspace_id:CORTIFREE_WORKSPACE_ID,account_id:input.account_id||CORTIFREE_ACCOUNT_ID};try{await supabase("system_logs",{method:"POST",body:JSON.stringify(row)});}catch{}return Response.json({ok:true});}
