import { z } from "zod";
import { dataBackend } from "../../lib/data-backend";
import { CORTIFREE_ACCOUNT_ID, CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

// Browser-side activity logs only. Operational stages (recovery nonces, OAuth
// tokens, worker state) are written server-side and must not be forgeable here.
const clientLogSchema = z.object({
  stage: z.string().regex(/^(carousel|hook-library)\.[a-z0-9._-]{1,60}$/),
  status: z.enum(["SUCCESS", "ERROR", "INFO"]),
  carousel_id: z.string().max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const parsed = clientLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid log entry" }, { status: 400 });
  const row = { ...parsed.data, workspace_id: CORTIFREE_WORKSPACE_ID, account_id: CORTIFREE_ACCOUNT_ID };
  try { await dataBackend("system_logs", { method: "POST", body: JSON.stringify(row) }); } catch {}
  return Response.json({ ok: true });
}
