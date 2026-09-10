import { pickUploadPostProfile, listUploadPostProfiles } from "./upload-post";
import { supabase } from "./supabase";
import { assertCortiFreeAccountId, CORTIFREE_WORKSPACE_ID } from "./workspace";

export async function resolvePublishingProfile(input: {
  accountId: string;
  platform: "tiktok" | "instagram";
  requestedProfile?: string;
}) {
  assertCortiFreeAccountId(input.accountId);
  let storedProfile: string | undefined;
  const accountResponse = await supabase(`accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(input.accountId)}&select=upload_post_profile&limit=1`);
  if (accountResponse.ok) {
    storedProfile = ((await accountResponse.json()) as Array<{ upload_post_profile?: string }>)[0]?.upload_post_profile || undefined;
  }

  const preferred = input.requestedProfile ?? storedProfile;
  let profile = preferred;
  try {
    profile = pickUploadPostProfile(await listUploadPostProfiles(), input.platform, preferred);
  } catch {
    // A stored profile remains usable during a temporary Upload-Post status outage.
  }

  if (profile && profile !== storedProfile) {
    await supabase(`accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(input.accountId)}`, {
      method: "PATCH",
      body: JSON.stringify({ upload_post_profile: profile }),
    });
  }
  return profile;
}
