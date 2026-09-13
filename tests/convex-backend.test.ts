import assert from "node:assert/strict";
import test from "node:test";
import { parseConvexResource } from "../app/lib/data-backend";

test("Convex route adapter always scopes reads to CortiFree", () => {
  const parsed = parseConvexResource("carousels?account_id=like.CF_*&status=in.(DRAFT,READY)&limit=200");
  assert.equal(parsed.table, "carousels");
  assert.equal(parsed.limit, 200);
  assert.deepEqual(parsed.filters, [
    { field: "account_id", op: "like", value: "CF_*" },
    { field: "status", op: "in", value: ["DRAFT", "READY"] },
    { field: "workspace_id", op: "eq", value: "cortifree" },
  ]);
});

test("Convex route adapter cannot be redirected to the Cocorise workspace", () => {
  const parsed = parseConvexResource("assets?workspace_id=eq.cocorise&enabled=eq.true");
  assert.deepEqual(parsed.filters.filter((filter) => filter.field === "workspace_id"), [
    { field: "workspace_id", op: "eq", value: "cortifree" },
  ]);
});
