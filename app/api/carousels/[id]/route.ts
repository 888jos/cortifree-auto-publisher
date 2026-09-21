import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { spec?: Record<string, unknown>; topic?: string; angle?: string; caption?: string };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.spec) patch.spec = body.spec;
    if (body.topic) patch.topic = body.topic;
    if (body.angle) patch.angle = body.angle;
    if (body.caption) patch.caption = body.caption;
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ carousel: (await response.json())[0] ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
