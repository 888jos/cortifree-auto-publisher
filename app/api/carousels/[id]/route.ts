import { dataBackend } from "../../../lib/data-backend";
import { assertCortiFreeAccountId, CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { spec?: Record<string, unknown>; topic?: string; angle?: string; caption?: string; account_id?: string; persona_id?: string };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.account_id) {
      assertCortiFreeAccountId(body.account_id);
      patch.account_id = body.account_id;
    }
    if (body.persona_id) {
      if (!/^P\d{2}$/.test(body.persona_id)) throw new Error("Invalid persona id");
      patch.persona_id = body.persona_id;
    }
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
