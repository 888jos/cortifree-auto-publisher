/** Runtime release identity. These values are supplied by Vercel for Git-backed
 * deployments; direct/manual deploys remain deliberately identifiable as such
 * instead of pretending to be a reproducible commit. */
export function releaseIdentity() {
  const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || process.env.CORTIFREE_RELEASE_SHA?.trim() || null;
  return {
    git_commit_sha: gitCommit,
    git_commit_ref: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID?.trim() || null,
    traceable: Boolean(gitCommit),
  };
}
