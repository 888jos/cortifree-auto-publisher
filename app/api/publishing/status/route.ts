import { listUploadPostProfiles } from "../../../lib/upload-post";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(process.env.UPLOAD_POST_API_KEY);
  if (!configured) return Response.json({ configured: false, connected: false, profiles: [], dryRun: process.env.DRY_RUN !== "false" });
  try {
    const payload = await listUploadPostProfiles();
    const profiles = Array.isArray(payload) ? payload : Array.isArray((payload as { users?: unknown[] }).users) ? (payload as { users: unknown[] }).users : [];
    return Response.json({ configured: true, connected: true, profiles, profileCount: profiles.length, dryRun: process.env.DRY_RUN !== "false" });
  } catch (error) {
    return Response.json({ configured: true, connected: false, profiles: [], error: error instanceof Error ? error.message : "Upload-Post check failed", dryRun: process.env.DRY_RUN !== "false" }, { status: 502 });
  }
}
