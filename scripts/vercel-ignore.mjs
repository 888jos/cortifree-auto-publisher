import { execSync } from "node:child_process";
const expected = "cortifree-auto-publisher.vercel.app";
const expectedProjectId = process.env.CORTIFREE_VERCEL_PROJECT_ID || "prj_VAzxY6ziL68xkWugWCdw6ympilER";
const actual = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").toLowerCase();
const actualProjectId = process.env.VERCEL_PROJECT_ID || "";

if (!actual) {
  console.log("[isolation] VERCEL_PROJECT_PRODUCTION_URL unavailable; proceeding with build.");
  process.exit(1);
}

if (actual !== expected || (actualProjectId && actualProjectId !== expectedProjectId)) {
  console.log(`[isolation] Ignoring deployment: expected ${expected} (${expectedProjectId}), received ${actual || "unknown host"} (${actualProjectId || "unknown project"}).`);
  process.exit(0);
}

const workerOnlyPrefixes = ["src/worker/", "supabase/migrations/", ".github/"];
const workerOnlyFiles = new Set(["Dockerfile.worker"]);
try {
  const changed = execSync("git diff --name-only HEAD^ HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n").map((item) => item.trim()).filter(Boolean);
  const workerOnly = changed.length > 0 && changed.every((file) =>
    workerOnlyFiles.has(file) || workerOnlyPrefixes.some((prefix) => file.startsWith(prefix))
  );
  if (workerOnly) {
    console.log(`[isolation] Worker-only change; skipping Vercel build: ${changed.join(", ")}`);
    process.exit(0);
  }
} catch {
  // Shallow/first commits may not have HEAD^. In that case building is safer.
}

console.log(`[isolation] Canonical CortiFree Vercel project detected: ${actual} (${actualProjectId || expectedProjectId}). Proceeding.`);
process.exit(1);
