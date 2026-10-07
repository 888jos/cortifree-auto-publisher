import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { dataBackend } from "../app/lib/data-backend.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

function envTemplate() {
  return new Map(fs.readFileSync(".env.example", "utf8").split("\n")
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const));
}

it("CortiFree env template targets the CortiFree project only", () => {
  const env = envTemplate();
  assert.equal(env.get("CORTIFREE_CANONICAL_HOST"), "cortifree-auto-publisher.vercel.app");
  assert.equal(env.get("SUPABASE_PROJECT_REF"), "adwyqshphctqbdfckvno");
  assert.equal(env.get("ALLOW_RUNTIME_JSON_FALLBACK"), "false");
  assert.equal(env.has("NEXT_PUBLIC_COCORISE_URL"), false);
});

describe("dataBackend", () => {
  const originalEnv = { ...process.env };
  let fake: FakePostgrest;
  beforeEach(() => { fake = new FakePostgrest().install(); });
  afterEach(() => { fake.restore(); process.env = { ...originalEnv }; });

  it("talks to Supabase with the service role and forces the CortiFree workspace", async () => {
    fake.seed("carousels", [{ id: "CF_A" }, { id: "CF_B", workspace_id: "other" }]);

    const response = await dataBackend("carousels?workspace_id=eq.other&select=id");

    assert.deepEqual(await response.json(), [{ id: "CF_A" }]);
    const [request] = fake.requests;
    assert.equal(request!.url.searchParams.get("workspace_id"), "eq.cortifree");
    assert.equal(response.headers.get("X-CortiFree-Backend"), "supabase");
  });

  it("does not add a workspace filter to shared editorial tables", async () => {
    fake.seed("content_accounts", [{ account_id: "CF_EN_01", workspace_id: undefined }]);
    const response = await dataBackend("accounts?select=account_id");
    assert.deepEqual(await response.json(), [{ account_id: "CF_EN_01" }]);
    assert.equal(fake.requests[0]!.table, "content_accounts");
    assert.equal(fake.requests[0]!.url.searchParams.has("workspace_id"), false);
  });

  it("fails closed when Supabase is not configured", async () => {
    delete process.env.SUPABASE_URL;
    const response = await dataBackend("carousels?select=id");
    assert.equal(response.status, 500);
    assert.match(JSON.stringify(await response.json()), /Supabase is not configured/);
    assert.equal(fake.requests.length, 0);
  });
});
