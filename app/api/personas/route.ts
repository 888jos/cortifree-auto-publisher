import personas from "../../../config/personas.json" with { type: "json" };
import { supabase } from "../../lib/supabase";
import { CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  let masters: Array<{ id: string | number; persona_id: string; public_url: string; filename: string }> = [];
  try {
    const response = await supabase("assets?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&source_type=eq.persona_master&select=id,persona_id,public_url,filename");
    if (response.ok) masters = await response.json();
  } catch {}
  return Response.json({
    personas: personas.map((persona) => {
      const master = masters.find((asset) => asset.persona_id === persona.id);
      return { ...persona, master: master ?? null, ready: Boolean(master?.public_url) };
    }),
    missingMasters: personas.filter((persona) => !masters.some((asset) => asset.persona_id === persona.id)).map((persona) => persona.id),
  });
}
