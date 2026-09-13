import { convexConfigured } from "../../lib/data-backend";

export async function GET() {
  const configured = convexConfigured();
  return Response.json(
    {
      ok: configured,
      service: "cortifree-auto-publisher",
      workspace: "cortifree",
      backend: "convex",
      backendConfigured: configured,
      dryRun: process.env.DRY_RUN !== "false",
    },
    { status: configured ? 200 : 503 },
  );
}
