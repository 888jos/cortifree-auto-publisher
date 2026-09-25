import { filterUploadPostProfiles, listUploadPostProfiles, pickAssignedUploadPostProfile } from "./upload-post";
import { dataBackend } from "./data-backend";
import { assertCortiFreeAccountId } from "./workspace";

function configuredCortiFreeProfiles() {
  return (process.env.CORTIFREE_UPLOAD_POST_PROFILES ?? "")
    .split(",")
    .map((username) => username.trim())
    .filter(Boolean);
}

type StoredAccount = {
  account_id: string;
  upload_post_profile?: string | null;
  active?: boolean;
  enabled?: boolean;
  posting_enabled?: boolean;
  warmup_status?: string | null;
};

export async function resolvePublishingProfile(input: {
  accountId: string;
  platform: "tiktok" | "instagram";
  requestedProfile?: string;
}) {
  assertCortiFreeAccountId(input.accountId);
  const response = await dataBackend(
    `accounts?account_id=eq.${encodeURIComponent(input.accountId)}&select=account_id,upload_post_profile,active,enabled,posting_enabled,warmup_status&limit=1`,
  );
  if (!response.ok) throw new Error(`Cannot read CortiFree account mapping: HTTP ${response.status}`);
  const stored = ((await response.json()) as StoredAccount[])[0];
  if (!stored?.active || !stored?.enabled || !stored?.posting_enabled || stored?.warmup_status !== "ACTIVE") return undefined;

  const storedProfile = stored.upload_post_profile?.trim() || undefined;
  if (input.requestedProfile && input.requestedProfile !== storedProfile) {
    throw new Error("Requested Upload-Post profile is not assigned to this CortiFree account");
  }
  if (!storedProfile || !configuredCortiFreeProfiles().includes(storedProfile)) return undefined;

  let profile: string | undefined = storedProfile;
  try {
    profile = pickAssignedUploadPostProfile(await listUploadPostProfiles(), input.platform, storedProfile);
  } catch {
    // Keep the stored mapping usable during a temporary Upload-Post status outage.
  }
  return profile;
}

export async function listCortiFreePublishingProfiles() {
  const response = await dataBackend(
    "accounts?account_id=like.CF_*&select=account_id,upload_post_profile,active,enabled,posting_enabled,warmup_status&limit=200",
  );
  if (!response.ok) throw new Error(`Cannot read CortiFree account mappings: HTTP ${response.status}`);
  const accounts = (await response.json()) as StoredAccount[];
  const configuredProfiles = configuredCortiFreeProfiles();
  const assignedUsernames = accounts.flatMap((account) =>
    account.active && account.enabled && account.posting_enabled && account.warmup_status === "ACTIVE"
      && account.upload_post_profile && configuredProfiles.includes(account.upload_post_profile)
      ? [account.upload_post_profile]
      : [],
  );
  if (!assignedUsernames.length) return { accounts, profiles: [] };
  const profiles = filterUploadPostProfiles(await listUploadPostProfiles(), assignedUsernames);
  return { accounts, profiles };
}
