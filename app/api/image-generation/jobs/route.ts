import { buildImagePrompt, imageGenerationInputSchema } from "../../../../src/image-generation/core";
import { visualReferenceSchema } from "../../../../src/visual-references";
import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";
import { loadRuntimePersonaConfigs } from "../../../../src/runtime/config";

export const runtime = "nodejs";

async function one<T>(resource: string): Promise<T> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  const row = (await response.json() as T[])[0];
  if (!row) throw new Error("Required record not found");
  return row;
}

export async function GET() {
  try {
    const response = await dataBackend("image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&select=*&order=created_at.desc&limit=100");
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ jobs: await response.json() });
  } catch (error) {
    return Response.json({ jobs: [], error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const input = imageGenerationInputSchema.parse(await request.json());
    const personas = await loadRuntimePersonaConfigs();
    const persona = personas.find((item) => item.id === input.persona_id);
    if (!persona) throw new Error("Unknown persona");
    const reference = visualReferenceSchema.parse(await one("visual_references?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(input.visual_reference_id) + "&enabled=eq.true&select=*"));
    const prompt = buildImagePrompt(persona, reference, input);
    const response = await dataBackend("image_generation_jobs", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        workspace_id: CORTIFREE_WORKSPACE_ID, persona_id: input.persona_id, carousel_id: input.carousel_id ?? null,
        slide_id: input.slide_id ?? null, master_asset_id: input.master_asset_id, visual_reference_id: input.visual_reference_id,
        category: input.category, scene: input.scene, input, prompt, provider: "modelark_seedream",
        model: process.env.MODELARK_MODEL_ID ?? null, status: "PENDING", attempts: 0, attempt_count: 0,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ job: (await response.json())[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
