import assert from "node:assert/strict";
import test from "node:test";
import { isAssetBlockedRenderError, isGenerationConfigBlockedMessage, isRetryableGenerationFailure } from "../src/autonomy/processor";
import { withImageRetry } from "../src/image-generation/core";

test("budget blocks pause ideas instead of failing them for good", () => {
  assert.equal(isGenerationConfigBlockedMessage("Monthly OpenAI safety cap reached ($15.0100 / $15.00)"), true);
  assert.equal(isGenerationConfigBlockedMessage("Cannot verify monthly OpenAI usage; generation is blocked until it can be read"), true);
  assert.equal(isGenerationConfigBlockedMessage("GENERATION_BLOCKED:Unsafe health claim: cure"), false);
});

test("interrupted generations are retryable", () => {
  assert.equal(isRetryableGenerationFailure("GENERATION_INTERRUPTED"), true);
});

test("only asset errors route a render failure to NEEDS_ASSETS", () => {
  assert.equal(isAssetBlockedRenderError("PERSONA_ASSETS_REQUIRED:P01:need_7:found_3"), true);
  assert.equal(isAssetBlockedRenderError("CORTIFREE_APP_SCREEN_REQUIRED:slide_4"), true);
  assert.equal(isAssetBlockedRenderError("MODELARK_REFERENCE_LOW_CONFIDENCE:slide_2:score_3:required_5:candidates_9"), true);
  assert.equal(isAssetBlockedRenderError("Upload-Post request_id or job_id is required"), false);
  assert.equal(isAssetBlockedRenderError("RENDER_INCOMPLETE: expected 7 final PNGs, received 6"), false);
});

test("ModelArk retries match the status code, not any 5xx-looking number", async () => {
  let attempts = 0;
  await assert.rejects(() => withImageRetry(async () => {
    attempts += 1;
    throw new Error("ModelArk 400: prompt 512 characters too long");
  }, { sleep: async () => undefined }), /ModelArk 400/);
  assert.equal(attempts, 1);

  attempts = 0;
  await assert.rejects(() => withImageRetry(async () => {
    attempts += 1;
    throw new Error("ModelArk 503: upstream busy");
  }, { sleep: async () => undefined }), /ModelArk 503/);
  assert.equal(attempts, 3);
});
