import { authorizeRecoveryToken, completeRecoveryToken, recoverModelArkOrphans } from "../../../../lib/recovery/modelark-orphans";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const auth = await authorizeRecoveryToken(url.searchParams.get("token") || "");
  if (!auth.ok) return Response.json({ ok: false, error: auth.reason }, { status: 401 });

  const limit = Number(url.searchParams.get("limit") || 3);
  try {
    const result = await recoverModelArkOrphans({ limit });
    if (result.remaining === 0) await completeRecoveryToken(auth.logId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
