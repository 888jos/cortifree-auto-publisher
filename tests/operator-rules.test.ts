import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { syncVoiceReferences } from "../app/lib/sync/editorial.js";
import { loadRuntimeOperatorRules } from "../src/runtime/config.js";
import { carouselGeneratorInputSchema } from "../app/lib/ai/schemas.js";
import { buildGeneratorInput } from "../app/lib/ai/prompts.js";
import { ACTIVE_FORMAT_IDS } from "../src/content/formats.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

// Minimal RFC 4180 reader for the committed CSV (quoted fields, "" escapes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some(Boolean));
}

const csvRows = parseCsv(fs.readFileSync(path.join(process.cwd(), "docs/OPERATOR_RULES.csv"), "utf8"));

describe("docs/OPERATOR_RULES.csv", () => {
  it("is ready to paste in the 00_OPERATOR_RULES tab", () => {
    assert.deepEqual(csvRows[0], ["rule_id", "rule", "formats", "active"]);
    const body = csvRows.slice(1);
    assert.ok(body.length >= 15);
    assert.equal(new Set(body.map((row) => row[0])).size, body.length, "rule_id is unique");
    for (const [ruleId, rule, formats, active] of body) {
      assert.match(ruleId ?? "", /^OR_[A-Z0-9_]+$/);
      assert.ok((rule ?? "").length > 20, ruleId);
      assert.ok((formats ?? "").split("|").every((format) => format === "ALL" || (ACTIVE_FORMAT_IDS as readonly string[]).includes(format)), `${ruleId}:${formats}`);
      assert.equal(active, "TRUE");
    }
  });

  it("covers every operator rule", () => {
    const text = csvRows.slice(1).map((row) => `${row[1]} [${row[2]}]`).join("\n");
    for (const expected of [
      /hook natif tiktok.*jamais un titre/i, /textes simples/i, /jamais de « … ».*finir les phrases.*2 lignes/i, /that girl/i,
      /fond blanc.*pastel \(jaune, rose, vert ou bleu\)/i, /exactement ce que dit le texte/i, /même image deux fois/i,
      /regard.*peau/i, /pas de collage/i, /du pire au meilleur.*\[F07_RANKING\]/i, /même taille de police.*\[F05_INTERACTIVE_CHECKLIST\]/i,
      /pas de cadre blanc.*contour noir.*\[F08_2X2\]/i, /cortifree sur chaque format.*\[ALL\]/i, /aucun tiret/i, /minuscules/i, /métaphore/i,
    ]) assert.match(text, expected);
  });
});

describe("operator rules from the Sheet to the generator", () => {
  let fake: FakePostgrest;
  let operatorTab: string[][];
  const sheetReads: string[] = [];

  beforeEach(() => {
    fake = new FakePostgrest().install();
    fake.unique("editorial_records", ["kind", "key"]);
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com";
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    operatorTab = csvRows.map((row) => [...row]);
    sheetReads.length = 0;
    const tabs: Record<string, () => string[][]> = {
      "01_PERSONAS": () => [["persona_id", "name"], ["P01", "Emma"]],
      "06_HOOKS": () => [["hook_id", "formula"], ["REF_01", "things i stopped doing"]],
      "00_VISUAL_GROUPS": () => [["group_id", "label"]],
      "00_OPERATOR_RULES": () => operatorTab,
    };
    fake.external.push((url) => {
      if (url.origin === "https://oauth2.googleapis.com") return Response.json({ access_token: "token", expires_in: 3600 });
      if (url.origin === "https://sheets.googleapis.com") {
        const range = decodeURIComponent(url.pathname.split("/values/")[1] ?? "");
        const tab = range.split("!")[0]!;
        sheetReads.push(tab);
        return Response.json({ values: tabs[tab]?.() ?? [] });
      }
      return undefined;
    });
  });
  afterEach(() => fake.restore());

  it("syncs the tab, loads the rules of one format and keeps them through the generator input", async () => {
    const counts = await syncVoiceReferences();
    assert.ok(sheetReads.includes("00_OPERATOR_RULES"));
    assert.equal(counts.editorial_operator_rules, csvRows.length - 1);
    assert.equal(counts.editorial_visual_groups, 0, "an optional tab with only its header is skipped");

    const ranking = await loadRuntimeOperatorRules("F07_RANKING");
    assert.ok(ranking.some((rule) => /du pire au meilleur/.test(rule)));
    assert.ok(ranking.some((rule) => /cortifree sur chaque format/i.test(rule)));
    assert.ok(!ranking.some((rule) => /même taille de police/.test(rule)), "F05 rules stay on F05");

    // Autonomous generation parses its input: the rules must survive it.
    const input = carouselGeneratorInputSchema.parse({
      carouselType: "F07_RANKING", layout: "ranking", language: "en", market: "US", requestedSlideCount: 7,
      editorialContext: {
        search_query: "q", primary_keyword: "k", secondary_keywords: [], language_profile: "GENZ_GIRLY_US", language_version: "v1",
        trend_terms: [], persona_voice: "", golden_example_ids: [], operator_rules: ranking,
        topic_id: "T_1", hook_id: "DYNAMIC", format_id: "F07_RANKING", account_id: "CF_EN_01", persona_id: "P01",
        brand_integration: { required: true, mention: "cortifree", screenshot_required: false, placement: "one ranked item" },
      },
    });
    assert.deepEqual(input.editorialContext?.operator_rules, ranking);
    assert.equal(input.editorialContext?.brand_integration.placement, "one ranked item");
    assert.match(buildGeneratorInput(input), /du pire au meilleur/);
  });

  it("drops a rule set to FALSE, and deactivates (never deletes) a row removed from the tab", async () => {
    await syncVoiceReferences();
    operatorTab = operatorTab
      .map((row) => row[0] === "OR_TXT_04" ? [row[0], row[1]!, row[2]!, "FALSE"] : row)
      .filter((row) => row[0] !== "OR_VIS_07");
    await syncVoiceReferences();
    const rules = await loadRuntimeOperatorRules("F01_LIFESTYLE_GUIDE");
    assert.ok(!rules.some((rule) => /that girl/.test(rule)));
    assert.ok(!rules.some((rule) => /référence Pinterest/.test(rule)));
    assert.ok(rules.some((rule) => /fond blanc/.test(rule)));
    const removed = fake.table("editorial_records").find((row) => row.kind === "operator_rules" && row.key === "OR_VIS_07");
    assert.equal(removed?.active, false);
  });
});
