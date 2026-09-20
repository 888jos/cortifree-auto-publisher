import { dataBackend } from "../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";
import { loadRuntimePersonaConfigs } from "../../../src/runtime/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [personas, masterResponse] = await Promise.all([
      loadRuntimePersonaConfigs(),
      dataBackend("assets?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&source_type=eq.persona_master&select=id,persona_id,public_url,filename"),
    ]);
    if (!masterResponse.ok) throw new Error(await masterResponse.text());
    const masters = await masterResponse.json() as Array<{ id: string | number; persona_id: string; public_url: string; filename: string }>;
    return Response.json({
      personas: personas.map((persona) => {
        const master = masters.find((asset) => asset.persona_id === persona.id);
        return { ...persona, master: master ?? null, ready: Boolean(master?.public_url) };
      }),
      missingMasters: personas.filter((persona) => !masters.some((asset) => asset.persona_id === persona.id)).map((persona) => persona.id),
      source: "supabase",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error), personas: [], missingMasters: [] }, { status: 503 });
  }
}
