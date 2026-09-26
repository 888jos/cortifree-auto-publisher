import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { parseConvexResource } from "../app/lib/data-backend.js";
import { learningMultiplier, strategyExponent } from "../src/autonomy/learning.js";
import { minimumPersonaAssets } from "../src/autonomy/preflight.js";
import { strategyForSlot, zonedToUtc } from "../src/autonomy/slots.js";

describe("business orchestration v1", () => {
  it("makes PROVEN, ADJACENT and EXPERIMENT materially different", () => {
    assert.equal(strategyExponent("PROVEN"), 1.35);
    assert.equal(strategyExponent("ADJACENT"), 0.65);
    assert.equal(strategyExponent("EXPERIMENT"), 0);
    assert.ok(learningMultiplier({ F01: 2 }, "F01", "PROVEN") > learningMultiplier({ F01: 2 }, "F01", "ADJACENT"));
    assert.equal(learningMultiplier({ F01: 2 }, "F01", "EXPERIMENT"), 1);
  });

  it("requires a real persona cache before paid copy generation", () => {
    assert.equal(minimumPersonaAssets("F01_LIFESTYLE_GUIDE", 7), 4);
    assert.equal(minimumPersonaAssets("F06_PERSONA_EXPLAINER", 7), 4);
    assert.equal(minimumPersonaAssets("F08_2X2", 7), 2);
  });

  it("keeps slot strategy deterministic and converts local NY time to UTC", () => {
    assert.equal(strategyForSlot("CAL_20260927_CF_EN_01_1"), strategyForSlot("CAL_20260927_CF_EN_01_1"));
    assert.ok(["PROVEN","ADJACENT","EXPERIMENT"].includes(strategyForSlot("CAL_20260927_CF_EN_01_1")));
    const utc = zonedToUtc("2026-09-27", "20:00", "America/New_York");
    assert.equal(utc.toISOString(), "2026-09-28T00:00:00.000Z");
  });

  it("does not silently drop common PostgREST filters", () => {
    const parsed = parseConvexResource("carousels?status=neq.ARCHIVED&scheduled_for=gte.2026-09-27T00%3A00%3A00Z&approved_at=not.is.null&rejected_at=is.null&limit=20");
    assert.ok(parsed.filters.some((filter) => filter.field === "status" && filter.op === "neq"));
    assert.ok(parsed.filters.some((filter) => filter.field === "scheduled_for" && filter.op === "gte"));
    assert.ok(parsed.filters.some((filter) => filter.field === "approved_at" && filter.op === "not_null"));
    assert.ok(parsed.filters.some((filter) => filter.field === "rejected_at" && filter.op === "is_null"));
  });

  it("keeps OpenAI behind asset preflight in autonomous processing", async () => {
    const processor = await fs.readFile(path.join(process.cwd(), "src/autonomy/processor.ts"), "utf8");
    const preflightAt = processor.indexOf("checkGenerationAssetReadiness");
    const generationAt = processor.indexOf("generateCarousel(input");
    assert.ok(preflightAt >= 0);
    assert.ok(generationAt > preflightAt);
    assert.match(processor, /status: 'NEEDS_ASSETS'/);
    assert.match(processor, /resumeAssetBlockedIdeas/);
    assert.match(processor, /SLOT_MISSED_BEFORE_GENERATION/);
    assert.match(processor, /status: 'EXPIRED_SLOT'/);
  });

  it("defines exact approval fingerprints and one canonical state trigger", async () => {
    const migration = await fs.readFile(path.join(process.cwd(), "supabase/migrations/20260926225205_business_logic_orchestration_v1.sql"), "utf8");
    assert.match(migration, /approved_hash text/);
    assert.match(migration, /content_hash text/);
    assert.match(migration, /create table if not exists public\.content_slots/);
    assert.match(migration, /drop trigger if exists carousels_render_review_integrity/);
    assert.match(migration, /drop trigger if exists cortifree_review_render_integrity/);
    assert.match(migration, /create trigger cortifree_carousel_state_integrity/);
    assert.match(migration, /APPROVAL_INVALIDATED_BY_CONTENT_CHANGE/);
  });

  it("stops the business workflow at PLANNED without claiming provider scheduling", async () => {
    const planning = await fs.readFile(path.join(process.cwd(), "app/lib/planning.ts"), "utf8");
    assert.match(planning, /status: "PLANNED"/);
    assert.match(planning, /eventType: "PLANNED"/);
    assert.doesNotMatch(planning, /last_review_action: "SCHEDULED"/);
  });

  it("ships sourced health guardrails from institutional sources", async () => {
    const migration = await fs.readFile(path.join(process.cwd(), "supabase/migrations/20260926225205_business_logic_orchestration_v1.sql"), "utf8");
    assert.match(migration, /SRC_NHLBI_SLEEP_IMPORTANCE/);
    assert.match(migration, /SRC_NIMH_STRESS/);
    assert.match(migration, /SRC_NCCIH_STRESS/);
    assert.match(migration, /SRC_CDC_ACTIVITY/);
    assert.match(migration, /SRC_FDA_CAFFEINE/);
    assert.match(migration, /CLAIM_NO_DIAGNOSIS/);
  });
});
