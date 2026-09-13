import { processImageGenerationJob } from "../../../../lib/image-generation";
import { dataBackend } from "../../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const response = await dataBackend("image_generation_jobs?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&id=eq." + encodeURIComponent(id) + "&select=*");
    if (!response.ok) throw new Error(await response.text());
    const job = (await response.json())[0];
    return job ? Response.json({ job }) : Response.json({ error: "Job not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (body.action !== "run") return Response.json({ error: "Unknown action" }, { status: 400 });
  try {
    return Response.json({ asset: await processImageGenerationJob(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
