import { connectedPlatforms } from "../../../lib/upload-post";
import { listCortiFreePublishingProfiles } from "../../../lib/publishing-profile";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(process.env.UPLOAD_POST_API_KEY);
  if (!configured) return Response.json({ configured: false, connected: false, profiles: [], dryRun: process.env.DRY_RUN !== "false" });
  try {
    const assigned = await listCortiFreePublishingProfiles();
    const profiles = assigned.profiles.map((profile) => ({
      username: profile.username,
      connectedPlatforms: connectedPlatforms(profile),
    }));
    return Response.json({
      configured: true,
      connected: profiles.length > 0,
      profiles,
      profileCount: profiles.length,
      cortifreeAccountCount: assigned.accounts.length,
      assignedProfileCount: profiles.length,
      dryRun: process.env.DRY_RUN !== "false",
    });
  } catch (error) {
    return Response.json({ configured: true, connected: false, profiles: [], error: error instanceof Error ? error.message : "Upload-Post check failed", dryRun: process.env.DRY_RUN !== "false" }, { status: 502 });
  }
}
