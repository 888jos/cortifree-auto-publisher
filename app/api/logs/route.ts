import { supabase } from "../../lib/supabase.js";
export async function POST(req:Request){const row=await req.json();try{await supabase("system_logs",{method:"POST",body:JSON.stringify(row)});}catch{}return Response.json({ok:true});}
