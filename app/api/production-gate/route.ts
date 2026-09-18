import { productionGateStatus } from "../../../src/autonomy/production-gate";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CORTIFREE_ADMIN_TOKEN || process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-admin-token");
  return supplied === expected;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await productionGateStatus();
  return Response.json(gate, { status: gate.ready ? 200 : 503 });
}
