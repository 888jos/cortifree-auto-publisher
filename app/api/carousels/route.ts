import { backendMode, dataBackend } from "../../lib/data-backend";
import { assertCortiFreeAccountId, assertCortiFreeCarouselId, CORTIFREE_ACCOUNT_ID, CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

export async function GET() {
  try {
    const response = await dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&account_id=like.CF_*&select=*&order=created_at.desc`);
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ carousels: await response.json(), source: backendMode() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error), carousels: [] }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || `CF_${Date.now()}`;
  const accountId = body.account_id || CORTIFREE_ACCOUNT_ID;
  try {
    assertCortiFreeCarouselId(id);
    assertCortiFreeAccountId(accountId);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
  const spec = body.spec || { slides: 7 };
  const row = {
    id,
    workspace_id: CORTIFREE_WORKSPACE_ID,
    account_id: accountId,
    persona_id: body.persona_id || "P01",
    language: body.language || "en",
    content_type: body.content_type || spec.carousel_type || "C13_EDUCATIONAL_EXPLAINER",
    topic: body.topic || spec.carousel_type_name || "Carousel draft",
    angle: body.angle || `Draft generated with ${spec.model_id || "selected model"}`,
    caption: body.caption || "Save this for later.",
    status: "DRAFT",
    review_status: "AWAITING_REVIEW",
    requires_human_approval: true,
    auto_post_without_approval: false,
    source_timezone: "Europe/Paris",
    publish_timezone: "America/New_York",
    generation_batch_date: new Date().toISOString().slice(0, 10),
    spec,
  };
  try {
    const response = await dataBackend("carousels", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ carousel: (await response.json())[0] || row, source: backendMode() }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
