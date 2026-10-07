import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("CortiFree env template has no Cocorise runtime coupling", () => {
  const env = fs.readFileSync(".env.example", "utf8");
  assert.match(env, /CORTIFREE_CANONICAL_HOST=cortifree-auto-publisher\.vercel\.app/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_COCORISE_URL/);
  assert.match(env, /SUPABASE_PROJECT_REF=adwyqshphctqbdfckvno/);
});

test("CortiFree runtime is Supabase-only and workspace-scoped", () => {
  const backend = fs.readFileSync("app/lib/data-backend.ts", "utf8");
  assert.match(backend, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(backend, /workspace_id/);
  assert.doesNotMatch(backend, /convex/i);
});
