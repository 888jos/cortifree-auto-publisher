import { z } from "zod";
import { dataBackend } from "../../../../lib/data-backend";
import { assertCortiFreeCarouselId, CORTIFREE_WORKSPACE_ID } from "../../../../lib/workspace";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("snapshot"), label: z.string().max(120).optional() }),
  z.object({ action: z.literal("restore"), eventId: z.string().uuid() }),
]);

async function loadCarousel(id: string) {
  const response = await dataBackend(
    `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}&select=id,spec,topic,angle,caption,current_version,revision_count&limit=1`,
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json() as Array<any>)[0] ?? null;
}

function snapshotOf(carousel: any, spec = carousel.spec) {
  return { spec, topic: carousel.topic, angle: carousel.angle, caption: carousel.caption };
}

async function writeEvent(options: {
  id: string; type: string; feedback: string; beforeVersion: number; afterVersion: number; snapshot: Record<string, unknown>; patchPlan?: Record<string, unknown>;
}) {
  const response = await dataBackend("carousel_review_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      workspace_id: CORTIFREE_WORKSPACE_ID,
      carousel_id: options.id,
      actor: "editor",
      event_type: options.type,
      target_scope: "carousel",
      feedback_text: options.feedback,
      patch_plan: { ...(options.patchPlan ?? {}), snapshot: options.snapshot },
      before_version: options.beforeVersion,
      after_version: options.afterVersion,
      created_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json() as Array<any>)[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    try { assertCortiFreeCarouselId(id); } catch { return Response.json({ error: "Invalid carousel id" }, { status: 400 }); }
    const response = await dataBackend(
      `carousel_review_events?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(id)}&event_type=in.(EDITOR_SNAPSHOT,STRUCTURE_EDIT,VERSION_RESTORE)&select=id,event_type,feedback_text,patch_plan,before_version,after_version,created_at&order=created_at.desc&limit=30`,
    );
    if (!response.ok) throw new Error(await response.text());
    const events = await response.json() as Array<any>;
    return Response.json({
      versions: events.map((event) => ({
        id: event.id,
        type: event.event_type,
        label: event.feedback_text,
        version: event.after_version,
        created_at: event.created_at,
        slide_count: Array.isArray(event.patch_plan?.snapshot?.spec?.generated_slides) ? event.patch_plan.snapshot.spec.generated_slides.length : null,
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    try { assertCortiFreeCarouselId(id); } catch { return Response.json({ error: "Invalid carousel id" }, { status: 400 }); }
    const body = requestSchema.parse(await request.json());
    const carousel = await loadCarousel(id);
    if (!carousel) return Response.json({ error: "Carousel not found" }, { status: 404 });
    const beforeVersion = Number(carousel.current_version ?? 1);
    const afterVersion = beforeVersion + 1;

    if (body.action === "snapshot") {
      const event = await writeEvent({
        id,
        type: "EDITOR_SNAPSHOT",
        feedback: body.label?.trim() || "Manual editor snapshot",
        beforeVersion,
        afterVersion,
        snapshot: snapshotOf(carousel),
      });
      const update = await dataBackend(
        `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify({ current_version: afterVersion, revision_count: Number(carousel.revision_count ?? 0) + 1, updated_at: new Date().toISOString() }) },
      );
      if (!update.ok) throw new Error(await update.text());
      return Response.json({ version: afterVersion, event });
    }

    const eventResponse = await dataBackend(
      `carousel_review_events?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&carousel_id=eq.${encodeURIComponent(id)}&id=eq.${encodeURIComponent(body.eventId)}&select=id,patch_plan,after_version&limit=1`,
    );
    if (!eventResponse.ok) throw new Error(await eventResponse.text());
    const sourceEvent = (await eventResponse.json() as Array<any>)[0];
    const stored = sourceEvent?.patch_plan?.snapshot;
    if (!stored?.spec) return Response.json({ error: "Version snapshot is unavailable" }, { status: 404 });
    const { rendered_slides: _rendered, rendered_at: _renderedAt, ...restoredBase } = structuredClone(stored.spec);
    const restoredSpec = { ...restoredBase, editor_structure_dirty: true, editor_structure_changed_at: new Date().toISOString() };
    const patch = {
      spec: restoredSpec,
      topic: stored.topic ?? carousel.topic,
      angle: stored.angle ?? carousel.angle,
      caption: stored.caption ?? carousel.caption,
      status: "DRAFT",
      review_status: "AWAITING_REVIEW",
      current_version: afterVersion,
      revision_count: Number(carousel.revision_count ?? 0) + 1,
      last_review_action: "EDITOR_VERSION_RESTORE",
      updated_at: new Date().toISOString(),
    };
    const update = await dataBackend(
      `carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(id)}`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) },
    );
    if (!update.ok) throw new Error(await update.text());
    const updated = (await update.json() as Array<any>)[0] ?? { ...carousel, ...patch };
    await writeEvent({
      id,
      type: "VERSION_RESTORE",
      feedback: `Restored version ${sourceEvent.after_version ?? "unknown"}`,
      beforeVersion,
      afterVersion,
      snapshot: snapshotOf(updated, restoredSpec),
      patchPlan: { restored_from_event_id: sourceEvent.id, restored_from_version: sourceEvent.after_version },
    });
    return Response.json({ carousel: updated, version: afterVersion });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid version action", details: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
