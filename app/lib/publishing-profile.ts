import { filterUploadPostProfiles, listUploadPostProfiles, pickAssignedUploadPostProfile } from "./upload-post";
import { dataBackend } from "./data-backend";
import { assertCortiFreeAccountId, CORTIFREE_WORKSPACE_ID } from "./workspace";

function configuredCortiFreeProfiles() {
  return (process.env.CORTIFREE_UPLOAD_POST_PROFILES ?? "")
    .split(",")
    .map((username) => username.trim())
    .filter(Boolean);
}

type RuntimeAccount = {
  id: string;
  posting_enabled?: boolean;
};

type ContentAccount = {
  account_id: string;
  upload_post_profile?: string | null;
  active?: boolean;
};

async function loadPublishingMapping(accountId: string) {
  const [runtimeResponse, contentResponse] = await Promise.all([
    dataBackend(`accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=eq.${encodeURIComponent(accountId)}&select=id,posting_enabled&limit=1`),
    dataBackend(`content_accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&account_id=eq.${encodeURIComponent(accountId)}&select=account_id,upload_post_profile,active&limit=1`),
  ]);
  if (!runtimeResponse.ok) throw new Error(`Cannot read runtime account ${accountId}: HTTP ${runtimeResponse.status}`);
  if (!contentResponse.ok) throw new Error(`Cannot read content account ${accountId}: HTTP ${contentResponse.status}`);
  const runtime = ((await runtimeResponse.json()) as RuntimeAccount[])[0];
  const content = ((await contentResponse.json()) as ContentAccount[])[0];
  return { runtime, content };
}

export async function resolvePublishingProfile(input: {
  accountId: string;
  platform: "tiktok" | "instagram";
  requestedProfile?: string;
}) {
  assertCortiFreeAccountId(input.accountId);
  const { runtime, content } = await loadPublishingMapping(input.accountId);
  if (!runtime?.posting_enabled || content?.active === false) return undefined;

  const storedProfile = content?.upload_post_profile?.trim() || undefined;
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
  const [runtimeResponse, contentResponse] = await Promise.all([
    dataBackend(`accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&id=like.CF_*&select=id,posting_enabled`),
    dataBackend(`content_accounts?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&account_id=like.CF_*&select=account_id,upload_post_profile,active`),
  ]);
  if (!runtimeResponse.ok) throw new Error(`Cannot read CortiFree runtime accounts: HTTP ${runtimeResponse.status}`);
  if (!contentResponse.ok) throw new Error(`Cannot read CortiFree account mappings: HTTP ${contentResponse.status}`);

  const runtimeAccounts = await runtimeResponse.json() as RuntimeAccount[];
  const contentAccounts = await contentResponse.json() as ContentAccount[];
  const contentById = new Map(contentAccounts.map((account) => [account.account_id, account]));
  const configuredProfiles = configuredCortiFreeProfiles();

  const accounts = runtimeAccounts.map((runtime) => {
    const content = contentById.get(runtime.id);
    return {
      id: runtime.id,
      posting_enabled: runtime.posting_enabled === true,
      active: content?.active !== false,
      upload_post_profile: content?.upload_post_profile ?? null,
    };
  });

  const assignedUsernames = accounts.flatMap((account) =>
    account.posting_enabled && account.active && account.upload_post_profile && configuredProfiles.includes(account.upload_post_profile)
      ? [account.upload_post_profile]
      : [],
  );
  if (!assignedUsernames.length) return { accounts, profiles: [] };
  const profiles = filterUploadPostProfiles(await listUploadPostProfiles(), assignedUsernames);
  return { accounts, profiles };
}
