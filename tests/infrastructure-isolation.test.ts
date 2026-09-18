import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("CortiFree env template has no Cocorise runtime coupling", () => {
  const env = fs.readFileSync(".env.example", "utf8");
  assert.match(env, /CORTIFREE_CANONICAL_HOST=cortifree-auto-publisher\.vercel\.app/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_COCORISE_URL/);
  assert.match(env, /LEGACY_SUPABASE_PROJECT_REF=adwyqshphctqbdfckvno/);
});

test("CortiFree runtime stays Convex-first", () => {
  const backend = fs.readFileSync("app/lib/data-backend.ts", "utf8");
  assert.match(backend, /CORTIFREE_BACKEND_SECRET/);
  assert.match(backend, /workspace_id/);
  assert.doesNotMatch(backend, /createClient\(.+supabase/i);
});
