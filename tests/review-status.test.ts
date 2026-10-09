import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanReason } from "../app/lib/review-status.js";

describe("blocked draft reasons", () => {
  it("explains pipeline errors in plain French", () => {
    assert.equal(humanReason("MODELARK_PROVIDER_BLOCKED:overdue_balance:slide_3"), "image à générer, ModelArk bloqué");
    assert.equal(humanReason("LOW_CONFIDENCE_ASSET:slide_6:score_25.5:required_38"), "aucune image assez proche dans la banque");
    assert.equal(humanReason("GENERATION_BLOCKED:429 You have no credits remaining"), "crédit OpenAI épuisé");
    assert.equal(humanReason(""), "raison inconnue");
  });
});
