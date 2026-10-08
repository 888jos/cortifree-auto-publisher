import { isOperatorRequest } from "../../../lib/admin-auth";
import { syncVoiceReferences } from "../../../lib/sync/editorial";

export const runtime = "nodejs";
export const maxDuration = 60;

// Refreshes the persona voice and style-hook references from the Sheet
// without waiting for the full nightly sync on the worker.
export async function POST(request: Request) {
  if (!isOperatorRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, counts: await syncVoiceReferences() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
