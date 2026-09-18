const expected = "cortifree-auto-publisher.vercel.app";
const actual = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").toLowerCase();

if (!actual) {
  console.log("[isolation] VERCEL_PROJECT_PRODUCTION_URL unavailable; proceeding with build.");
  process.exit(1);
}

if (actual !== expected) {
  console.log(`[isolation] Ignoring deployment: this repository belongs to ${expected}, not ${actual}.`);
  process.exit(0);
}

console.log(`[isolation] Canonical Vercel project detected: ${actual}. Proceeding.`);
process.exit(1);
