import { convexConfigured } from "../../lib/data-backend";

function hostname(value?: string) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function GET() {
  const backendConfigured = convexConfigured();
  const expectedHost = (process.env.CORTIFREE_CANONICAL_HOST || "cortifree-auto-publisher.vercel.app").toLowerCase();
  const deployedHost = hostname(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? hostname(process.env.NEXT_PUBLIC_APP_URL);
  const local = deployedHost === "localhost" || deployedHost === "127.0.0.1";
  const domainIsolationOk = !deployedHost || local || deployedHost === expectedHost;
  const configured = backendConfigured && domainIsolationOk;

  return Response.json(
    {
      ok: configured,
      service: "cortifree-auto-publisher",
      workspace: "cortifree",
      backend: "convex",
      backendConfigured,
      domainIsolationOk,
      expectedHost,
      deployedHost,
      legacySupabaseRuntimeEnabled: false,
      dryRun: process.env.DRY_RUN !== "false",
    },
    { status: configured ? 200 : 503 },
  );
}
