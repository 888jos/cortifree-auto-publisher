import { filterUploadPostProfiles, listUploadPostProfiles, pickAssignedUploadPostProfile } from "./upload-post";
import { supabase } from "./supabase";
import { assertCortiFreeAccountId, CORTIFREE_WORKSPACE_ID } from "./workspace";

function configuredCortiFreeProfiles() {
  return (process.env.CORTIFREE_UPLOAD_POST_PROFILES ?? "")
    .split(",")
    .map((username) => username.trim())
    .filter(Boolean);
}

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

  if (input.requestedProfile && input.requestedProfile !== storedProfile) {
    throw new Error("Requested Upload-Post profile is not assigned to this CortiFree account");
  }
  if (!storedProfile || !configuredCortiFreeProfiles().includes(storedProfile)) return undefined;

  let profile: string | undefined = storedProfile;
  try {
    profile = pickAssignedUploadPostProfile(await listUploadPostProfiles(), input.platform, storedProfile);
  } catch {
    // A stored profile remains usable during a temporary Upload-Post status outage.
  }
  return profile;
}

export async function listCortiFreePublishingProfiles() {
  const response = await supabase(`accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=like.CF_*&select=id,upload_post_profile&enabled=eq.true`);
  if (!response.ok) throw new Error(`Cannot read CortiFree account mappings: HTTP ${response.status}`);
  const accounts = (await response.json()) as Array<{ id: string; upload_post_profile?: string | null }>;
  const configuredProfiles = configuredCortiFreeProfiles();
  const assignedUsernames = accounts.flatMap((account) =>
    account.upload_post_profile && configuredProfiles.includes(account.upload_post_profile)
      ? [account.upload_post_profile]
      : [],
  );
  if (!assignedUsernames.length) return { accounts, profiles: [] };
  const profiles = filterUploadPostProfiles(await listUploadPostProfiles(), assignedUsernames);
  return { accounts, profiles };
}
