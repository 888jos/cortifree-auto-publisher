import { execSync } from "node:child_process";

const expectedProjectId = process.env.CORTIFREE_VERCEL_PROJECT_ID || "prj_VAzxY6ziL68xkWugWCdw6ympilER";
const actualProjectId = process.env.VERCEL_PROJECT_ID || "";
const gitRef = (process.env.VERCEL_GIT_COMMIT_REF || "").trim();
const previewsEnabled = process.env.CORTIFREE_VERCEL_PREVIEW_BUILDS === "true";

if (actualProjectId && actualProjectId !== expectedProjectId) {
  console.log(`[isolation] Ignoring non-CortiFree project ${actualProjectId}; expected ${expectedProjectId}.`);
  process.exit(0);
}

if (gitRef && gitRef !== "main" && !previewsEnabled) {
  console.log(`[isolation] Preview build skipped for ${gitRef}; main is the production branch.`);
  process.exit(0);
}

const workerOnlyPrefixes = ["src/worker/", "supabase/migrations/", ".github/"];
const workerOnlyFiles = new Set(["Dockerfile.worker"]);

try {
  const changed = execSync("git diff --name-only HEAD^ HEAD", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).split("\n").map((item) => item.trim()).filter(Boolean);

  const workerOnly = changed.length > 0 && changed.every((file) =>
    workerOnlyFiles.has(file) || workerOnlyPrefixes.some((prefix) => file.startsWith(prefix))
  );

  if (workerOnly) {
    console.log(`[isolation] Worker-only change; skipping Vercel build: ${changed.join(", ")}`);
    process.exit(0);
  }
} catch {
  // Building is safer than silently skipping when the previous commit is unavailable.
}

console.log(`[isolation] Building CortiFree web app for ${gitRef || "unknown ref"} on project ${actualProjectId || expectedProjectId}.`);
process.exit(1);
