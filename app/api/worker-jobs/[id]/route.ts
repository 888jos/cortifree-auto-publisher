import { isOperatorRequest } from "../../../lib/admin-auth";
import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status and result of one worker job, for operators following a queued sync,
// archive or sample from the dashboard.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isOperatorRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid job id" }, { status: 400 });
  const response = await dataBackend(`worker_jobs?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${id}&select=id,kind,status,attempts,max_attempts,payload,result,last_error,created_at,started_at,finished_at&limit=1`);
  if (!response.ok) return Response.json({ error: await response.text() }, { status: 502 });
  const [job] = await response.json() as Array<Record<string, unknown>>;
  return job ? Response.json({ job }) : Response.json({ error: "Not found" }, { status: 404 });
}
