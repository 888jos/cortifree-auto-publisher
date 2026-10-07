import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import sharp from "sharp";
import { autoScheduleApproved } from "../src/autonomy/publishing.js";
import { FakePostgrest } from "./helpers/fake-postgrest.js";

const CAROUSEL_ID = "CF_TEST_0001";
const ACCOUNT_ID = "CF_EN_01";
const PROFILE = "cortifree_en_01";
const slideCopy = [
  ["A softer everyday routine", "Simple ideas for a less rushed day."],
  ["Start with daylight", "Open the curtains for a few minutes."],
  ["Keep breakfast simple", "Choose a meal that feels satisfying."],
  ["Take a screen-free pause", "Give yourself one real break."],
  ["Try an easy walk", "Move without a performance goal."],
  ["Make evenings quieter", "Dim the lights as the day winds down."],
  ["Keep one idea", "Save this and start small."],
];
const readyGate = async () => ({ ready: true, blockers: [], warnings: [], checks: {} });
const originalEnv = { ...process.env };
let fake: FakePostgrest;
let uploads: number;
let uploadStatus: number;

async function slidePng() {
  return sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 240, g: 236, b: 228 } } }).png().toBuffer();
}

beforeEach(async () => {
  process.env.AUTONOMY_AUTO_PUBLISH = "true";
  process.env.DRY_RUN = "false";
  process.env.UPLOAD_POST_API_KEY = "upload-post-test";
  uploads = 0;
  uploadStatus = 200;
  const png = await slidePng();
  fake = new FakePostgrest().unique("publish_jobs", ["idempotency_key"]);
  fake.seed("content_accounts", [{
    account_id: ACCOUNT_ID, display_name: "CortiFree EN", persona_id: "P01", platforms: ["tiktok"],
    upload_post_profile: PROFILE, active: true, enabled: true, posting_enabled: true, warmup_status: "ACTIVE",
  }]);
  fake.seed("carousels", [{
    id: CAROUSEL_ID, account_id: ACCOUNT_ID, status: "SCHEDULED", review_status: "SCHEDULED", requires_human_approval: true,
    approved_at: "2026-10-01T10:00:00.000Z", scheduled_for: "2030-01-01T16:30:00.000Z",
    topic: slideCopy[0]![0], angle: "Realistic habits without medical promises.", language: "en", caption: "Save this for later.", cta_type: "save",
    spec: {
      title: slideCopy[0]![0], hook: slideCopy[0]![0],
      generated_slides: slideCopy.map(([headline, body], index) => ({
        position: index + 1, role: index === 0 ? "HOOK" : index === slideCopy.length - 1 ? "CTA" : "TIP",
        layout: "single-image", headline, body, visualIntent: "Calm everyday lifestyle scene with negative space", assetType: "stock", assetQuery: `wellness lifestyle ${index + 1}`,
      })),
    },
  }]);
  fake.seed("carousel_slides", slideCopy.map((_, index) => ({
    carousel_id: CAROUSEL_ID, position: index + 1, rendered_url: `https://cdn.test/${CAROUSEL_ID}/${index + 1}.png`, asset_id: null,
  })));
  fake.external.push((url, init) => {
    if (url.hostname === "cdn.test") return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
    if (url.href === "https://api.upload-post.com/api/uploadposts/users") {
      return Response.json({ profiles: [{ username: PROFILE, social_accounts: { tiktok: { username: "cortifree" } } }] });
    }
    if (url.href === "https://api.upload-post.com/api/upload_photos" && init.method === "POST") {
      uploads += 1;
      return uploadStatus === 200
        ? Response.json({ success: true, request_id: "req-1", job_id: "job-1" })
        : Response.json({ success: false, error: "Upload-Post exploded" }, { status: uploadStatus });
    }
    return undefined;
  });
  fake.install();
});

afterEach(() => {
  fake.restore();
  process.env = { ...originalEnv };
});

describe("autoScheduleApproved", () => {
  it("calls Upload-Post once when two runs race for the same carousel", async () => {
    // Both runs must pass the "already queued?" read before either claims the job.
    fake.barrier((request) => request.table === "publish_jobs" && request.method === "GET", 2);
    const [first, second] = await Promise.all([autoScheduleApproved({ gate: readyGate }), autoScheduleApproved({ gate: readyGate })]);
    const actions = [...first!, ...second!].map((entry) => entry.action).sort();

    assert.deepEqual(actions, ["ALREADY_QUEUED", "SCHEDULED"]);
    assert.equal(fake.requestsTo("publish_jobs", "POST").length, 2, "both runs tried to claim");
    assert.equal(uploads, 1);
    const jobs = fake.table("publish_jobs");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.status, "SCHEDULED");
    assert.equal(jobs[0]!.provider_request_id, "req-1");
    assert.equal(jobs[0]!.provider_job_id, "job-1");
    assert.equal(fake.table("carousels")[0]!.status, "SCHEDULED");
  });

  it("marks the job and the carousel FAILED when the upload fails", async () => {
    uploadStatus = 502;
    const report = await autoScheduleApproved({ gate: readyGate });

    assert.equal(report.length, 1);
    assert.equal(report[0]!.action, "ERROR");
    assert.match(String(report[0]!.error), /Upload-Post exploded/);
    assert.equal(uploads, 1);
    const [job] = fake.table("publish_jobs");
    assert.equal(job!.status, "FAILED");
    assert.match(String(job!.last_error), /Upload-Post exploded/);
    const [carousel] = fake.table("carousels");
    assert.equal(carousel!.status, "FAILED");
    assert.equal(carousel!.review_status, "FAILED");
  });

  it("re-claims a FAILED job once the carousel is rescheduled", async () => {
    uploadStatus = 502;
    await autoScheduleApproved({ gate: readyGate });
    Object.assign(fake.table("carousels")[0]!, { status: "SCHEDULED", review_status: "SCHEDULED" });
    uploadStatus = 200;

    const report = await autoScheduleApproved({ gate: readyGate });

    assert.equal(report[0]!.action, "SCHEDULED");
    assert.equal(uploads, 2);
    assert.equal(fake.table("publish_jobs").length, 1);
    assert.equal(fake.table("publish_jobs")[0]!.status, "SCHEDULED");
    assert.equal(fake.table("publish_jobs")[0]!.last_error, null);
  });

  it("does not publish while the production gate is closed", async () => {
    const report = await autoScheduleApproved({ gate: async () => ({ ready: false, blockers: ["ACCEPTANCE_GATE_NOT_PASSED"], warnings: [], checks: {} }) });
    assert.equal(report[0]!.action, "BLOCKED_PRODUCTION_GATE");
    assert.equal(uploads, 0);
    assert.equal(fake.requestsTo("publish_jobs").length, 0);
  });
});
