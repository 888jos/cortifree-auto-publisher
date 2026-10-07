import { isCronOrAdminRequest } from "../../lib/admin-auth";
import { productionGateStatus } from "../../../src/autonomy/production-gate";

export const runtime = "nodejs";

function authorized(request: Request) {
  return isCronOrAdminRequest(request);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await productionGateStatus();
  return Response.json(gate, { status: gate.ready ? 200 : 503 });
}
