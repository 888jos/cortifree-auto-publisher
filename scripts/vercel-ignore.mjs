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

console.log(`[isolation] Canonical CortiFree Vercel project detected: ${actual} (${actualProjectId || expectedProjectId}). Proceeding.`);
process.exit(1);
