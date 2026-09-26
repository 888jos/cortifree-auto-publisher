import { z } from "zod";
import { applyEditorStructureAction } from "../../../../lib/editor-structure";
import { dataBackend } from "../../../../lib/data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reorder"), fromIndex: z.number().int().min(0).max(11), toIndex: z.number().int().min(0).max(11) }),
  z.object({ action: z.literal("duplicate"), index: z.number().int().min(0).max(11) }),
  z.object({ action: z.literal("delete"), index: z.number().int().min(0).max(11) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    try { assertCortiFreeCarouselId(id); } catch { return Response.json({ error: "Invalid carousel id" }, { status: 400 }); }
    const action = actionSchema.parse(await request.json());
    const response = await dataBackend(
      `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=id,spec,topic,angle,caption,current_version,revision_count&limit=1`,
    );
    if (!response.ok) throw new Error(await response.text());
    const carousel = (await response.json() as Array<any>)[0];
    if (!carousel) return Response.json({ error: "Carousel not found" }, { status: 404 });

    const result = applyEditorStructureAction(carousel.spec ?? {}, action);
    const beforeVersion = Number(carousel.current_version ?? 1);
    const afterVersion = beforeVersion + 1;
    const now = new Date().toISOString();
    const patch = {
      spec: result.spec,
      status: "DRAFT",
      review_status: "AWAITING_REVIEW",
      current_version: afterVersion,
      revision_count: Number(carousel.revision_count ?? 0) + 1,
      last_review_action: `EDITOR_${action.action.toUpperCase()}`,
      updated_at: now,
    };
    const update = await dataBackend(
      `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) },
    );
    if (!update.ok) throw new Error(await update.text());
    const updated = (await update.json() as Array<any>)[0] ?? { ...carousel, ...patch };

    const event = await dataBackend("carousel_review_events", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: CORTIFREE_WORKSPACE_ID,
        carousel_id: id,
        actor: "editor",
        event_type: "STRUCTURE_EDIT",
        target_scope: "carousel",
        slide_index: action.action === "reorder" ? action.fromIndex + 1 : action.index + 1,
        feedback_text: action.action,
        patch_plan: {
          action,
          snapshot: {
            spec: result.spec,
            topic: carousel.topic,
            angle: carousel.angle,
            caption: carousel.caption,
          },
        },
        before_version: beforeVersion,
        after_version: afterVersion,
        created_at: now,
      }),
    });
    if (!event.ok) throw new Error(`Version event save failed: ${await event.text()}`);

    return Response.json({ carousel: updated, activeIndex: result.activeIndex, version: afterVersion });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid structure action", details: error.issues }, { status: 400 });
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("EDITOR_STRUCTURE_") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
