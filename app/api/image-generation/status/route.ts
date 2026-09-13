import { getImageGenerationStatus } from "../../../lib/image-generation";
import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  const status = getImageGenerationStatus();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  try {
    const response = await dataBackend("image_generation_usage?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&created_at=gte." + encodeURIComponent(monthStart) + "&select=images_generated,estimated_cost_usd");
    if (!response.ok) throw new Error();
    const rows = await response.json() as Array<{ images_generated: number; estimated_cost_usd: number }>;
    return Response.json({ ...status, usage: rows.reduce((total, row) => ({ images: total.images + Number(row.images_generated), costUsd: total.costUsd + Number(row.estimated_cost_usd) }), { images: 0, costUsd: 0 }) });
  } catch {
    return Response.json({ ...status, usage: { images: 0, costUsd: 0 } });
  }
}
