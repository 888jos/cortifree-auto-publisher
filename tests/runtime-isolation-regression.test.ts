import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function filesBelow(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return filesBelow(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

test("CortiFree runtime surface has no cross-product coupling", () => {
  const files = [
    ...filesBelow("app"),
    ...filesBelow("src/autonomy"),
  ];
  const violations: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (/NEXT_PUBLIC_COCORISE_URL|COCORISE_BACKEND_SECRET|cocorise-auto-publisher/i.test(source)) {
      violations.push(`${file}: cross-product Cocorise reference`);
    }
    if (/config\/personas\.json|config\/accounts\.json/i.test(source) && !file.endsWith(path.join("src","runtime","config.ts"))) {
      violations.push(`${file}: local JSON runtime dependency`);
    }
  }
  assert.deepEqual(violations, []);
});

test("CortiFree production build stays separated from Convex deploy", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["vercel-build"], "next build");
  assert.doesNotMatch(packageJson.scripts["vercel-build"], /convex\s+deploy/);

  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.equal(vercel.buildCommand, "npm run vercel-build");
  assert.equal(vercel.ignoreCommand, "node scripts/vercel-ignore.mjs");
});

test("JSON fallback remains opt-in", () => {
  const env = fs.readFileSync(".env.example", "utf8");
  assert.match(env, /^ALLOW_RUNTIME_JSON_FALLBACK=false$/m);
  assert.match(env, /^CORTIFREE_CANONICAL_HOST=cortifree-auto-publisher\.vercel\.app$/m);
});
