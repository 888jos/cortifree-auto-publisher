import { createAcceptanceSample } from "../../../../../src/autonomy/scheduler";
import { processQueuedIdeas } from "../../../../../src/autonomy/processor";
import { ACTIVE_FORMAT_IDS } from "../../../../../src/content/formats";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "editorial-v2-20261002") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  process.env.DRY_RUN = "true";
  process.env.AUTONOMY_AUTO_APPROVE = "false";
  process.env.AUTONOMY_AUTO_PUBLISH = "false";
  process.env.IMAGE_GENERATION_ENABLED = "false";

  const batchId = `V2_${Date.now()}`;
  const formats = [...ACTIVE_FORMAT_IDS];
  const sample = await createAcceptanceSample({
    batchId,
    limit: formats.length,
    formatIds: formats,
  });
  const processed = await processQueuedIdeas(sample.created, { acceptanceBatchId: batchId });

  return Response.json({
    ok: true,
    batchId,
    formats,
    sample,
    processed,
  });
}
