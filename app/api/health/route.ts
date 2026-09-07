export async function GET() { return Response.json({ ok: true, service: "cortifree-auto-publisher", dryRun: process.env.DRY_RUN !== "false" }); }
