import { z } from "zod";
import { acceptanceGateStatus, recordAcceptanceGate } from "../../../src/autonomy/acceptance";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CORTIFREE_ADMIN_TOKEN || process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-admin-token");
  return supplied === expected;
}

const bodySchema = z.object({
  reviewed: z.number().int().min(0).max(100),
  usable: z.number().int().min(0).max(100),
  batchId: z.string().min(1).max(160).optional(),
  notes: z.string().max(2000).optional(),
}).refine((value) => value.usable <= value.reviewed, { message: "usable cannot exceed reviewed" });

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await acceptanceGateStatus());
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = bodySchema.parse(await request.json());
    return Response.json(await recordAcceptanceGate(body), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
