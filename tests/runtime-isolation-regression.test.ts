import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware.js";
import { loadEditorialSnapshot } from "../src/editorial/snapshot.js";
import { loadRuntimeAccounts, normalizeBackendDatetime } from "../src/runtime/config.js";

function filesBelow(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return filesBelow(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

// Repository-wide guard (not a pin on one file's contents): no Cocorise wiring may leak in.
test("CortiFree runtime surface has no cross-product coupling", () => {
  const violations = [...filesBelow("app"), ...filesBelow("src/autonomy")].flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    const found: string[] = [];
    if (/NEXT_PUBLIC_COCORISE_URL|COCORISE_BACKEND_SECRET|cocorise-auto-publisher/i.test(source)) found.push(`${file}: cross-product Cocorise reference`);
    if (/config\/personas\.json|config\/accounts\.json/i.test(source)) found.push(`${file}: local JSON runtime dependency`);
    return found;
  });
  assert.deepEqual(violations, []);
});

test("CortiFree production build stays separated from Convex deploy", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["vercel-build"], "next build");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.equal(vercel.buildCommand, "npm run vercel-build");
  assert.equal(vercel.ignoreCommand, "node scripts/vercel-ignore.mjs");
});

test("the Vercel ignore step only builds the CortiFree project on main", () => {
  const script = path.resolve("scripts/vercel-ignore.mjs");
  // Outside a git checkout the diff fails, which must fall through to "build".
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-ignore-"));
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], {
    cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env },
  }).status;
  const SKIP = 0;
  const BUILD = 1;
  assert.equal(run({ VERCEL_PROJECT_ID: "prj_someone_else", VERCEL_GIT_COMMIT_REF: "main" }), SKIP);
  assert.equal(run({ VERCEL_PROJECT_ID: "prj_VAzxY6ziL68xkWugWCdw6ympilER", VERCEL_GIT_COMMIT_REF: "feature/x" }), SKIP);
  assert.equal(run({ VERCEL_PROJECT_ID: "prj_VAzxY6ziL68xkWugWCdw6ympilER", VERCEL_GIT_COMMIT_REF: "feature/x", CORTIFREE_VERCEL_PREVIEW_BUILDS: "true" }), BUILD);
  assert.equal(run({ VERCEL_PROJECT_ID: "prj_VAzxY6ziL68xkWugWCdw6ympilER", VERCEL_GIT_COMMIT_REF: "main" }), BUILD);
});

test("JSON fallback stays opt-in", async () => {
  const saved = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ALLOW_RUNTIME_JSON_FALLBACK;
  try {
    await assert.rejects(loadRuntimeAccounts(), /JSON fallback is disabled/);
  } finally {
    process.env = saved;
  }
});

test("Supabase timestamp offsets are normalized before strict runtime validation", () => {
  assert.equal(normalizeBackendDatetime("2026-09-26T15:11:02.040+00:00"), "2026-09-26T15:11:02.040Z");
  assert.equal(normalizeBackendDatetime("2026-09-26 15:11:02.04+00"), "2026-09-26T15:11:02.040Z");
  assert.equal(normalizeBackendDatetime(null), undefined);
});

test("the editorial snapshot rejects legacy topics without V2 territories", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-"));
  const write = (topics: Array<Record<string, unknown>>) => {
    const file = path.join(dir, `${topics.length}-${Math.random()}.json`);
    fs.writeFileSync(file, JSON.stringify({
      version: "test", generated_at: "2026-10-01T00:00:00.000Z", workspace_id: "cortifree",
      tables: { content_ctas: [{ id: "CTA_1" }], content_topics: topics, content_hooks: [{ id: "H_LEGACY" }] },
    }));
    return file;
  };
  assert.throws(() => loadEditorialSnapshot(write([{ topic_id: "LEGACY_1" }])), /V2 content territories are missing/);
  assert.throws(() => loadEditorialSnapshot(write([{ topic_id: "T_SLEEP", active: false }])), /V2 content territories are missing/);
  assert.equal(loadEditorialSnapshot(write([{ topic_id: "T_SLEEP" }])).workspace_id, "cortifree");
});

test("login and Telegram webhooks bypass the session middleware; other routes do not", async () => {
  const saved = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try {
    for (const pathname of ["/login", "/api/auth/login", "/api/telegram/webhook", "/api/integrations/telegram/webhook"]) {
      const response = await middleware(new NextRequest(`https://cortifree.test${pathname}`));
      assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
    }
    // Without Supabase Auth, a protected route is refused rather than passed through.
    const protectedResponse = await middleware(new NextRequest("https://cortifree.test/api/carousels"));
    assert.equal(protectedResponse.status, 503);
    assert.equal(protectedResponse.headers.get("x-middleware-next"), null);
  } finally {
    process.env = saved;
  }
});
