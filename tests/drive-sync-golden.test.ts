import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { before, after, describe, it } from "node:test";

// Characterization test for the Google Drive -> Supabase sync. Each scope runs
// against a stubbed Drive tree, the two taxonomy Sheets and a fixed Supabase
// snapshot; the set of backend writes and the returned sync report are pinned.
//
// Regenerate with: UPDATE_DRIVE_SYNC_GOLDEN=1 npm test -- --test-name-pattern="drive sync"

const SUPABASE = "http://drive-golden.test";
const GOLDEN_FILE = path.join(process.cwd(), "tests", "golden", "drive-sync.json");
const UPDATE = process.env.UPDATE_DRIVE_SYNC_GOLDEN === "1";
const FOLDER = "application/vnd.google-apps.folder";
const ROOTS = { personas: "ROOT_PERSONAS", stock: "ROOT_STOCK", refs: "ROOT_REFS", app: "ROOT_APP" };
const T0 = "2026-09-01T10:00:00.000Z";
const T1 = "2026-09-20T10:00:00.000Z";

type DriveNode = { id: string; name: string; mimeType: string; md5Checksum?: string; modifiedTime?: string; children?: DriveNode[] };
const folder = (id: string, name: string, children: DriveNode[]): DriveNode => ({ id, name, mimeType: FOLDER, children });
const image = (id: string, name: string, md5: string): DriveNode => ({ id, name, mimeType: "image/jpeg", md5Checksum: md5, modifiedTime: T1 });

const DRIVE: Record<string, DriveNode[]> = {
  [ROOTS.personas]: [
    folder("F_MAYA", "MAYA", [folder("F_MAYA_G", "02_GENERATED", [image("D_MAYA_G1", "MAYA_DESK_001.jpg", "md5_maya_g1")])]),
    folder("F_P01", "P01_AVA", [
      folder("F_P01_M", "00_MASTER", [image("D_P01_MASTER", "AVA_MASTER.jpg", "md5_p01_master")]),
      folder("F_P01_G", "02_GENERATED", [image("D_P01_G1", "AVA_HOME_001.jpg", "md5_p01_g1"), image("D_P01_G2", "AVA_HOME_002.jpg", "md5_p01_g2_new")]),
    ]),
    folder("F_P03", "P03_LILY", [folder("F_P03_G", "02_GENERATED", [image("D_P03_G1", "LILY_WALK_001.jpg", "md5_p03_g1")])]),
    folder("F_LEGACY", "ZZ_LEGACY_VISUAL_POOLS_2026-10-01", [image("D_LEGACY", "old.jpg", "md5_legacy")]),
  ],
  [ROOTS.stock]: [
    folder("F_STOCK_HOME", "home", [
      image("D_S1", "stock_tea.jpg", "md5_s1"),
      image("D_S2", "stock_desk.jpg", "md5_s2"),
      image("D_S3", "stock_desk_copy.jpg", "md5_s2"),
      { id: "D_S_NOTE", name: "readme.txt", mimeType: "text/plain" },
    ]),
    folder("F_STOCK_FOOD", "food", [image("D_S4", "stock_bowl.jpg", "md5_s4")]),
  ],
  [ROOTS.refs]: [
    folder("F_REF_HERO", "hero", [
      image("D_R1", "ref_new.jpg", "md5_r1"),
      image("D_R2", "ref_existing.jpg", "md5_r2"),
      image("D_R3", "ref_dup.jpg", "md5_r3"),
      image("D_R4", "ref_hash.jpg", "md5_r4"),
    ]),
  ],
  [ROOTS.app]: [
    image("D_A1", "CF_APP_SCREEN_01_breathing_timer_1.png", "md5_a1"),
    folder("F_APP_SUB", "onboarding", [image("D_A2", "CF_APP_SCREEN_02_mood_check_in.png", "md5_a2")]),
  ],
};
const DRIVE_FILES = new Map<string, DriveNode>();
(function index(nodes: DriveNode[]) {
  for (const node of nodes) {
    DRIVE_FILES.set(node.id, node);
    if (node.children) index(node.children);
  }
})(Object.values(DRIVE).flat());

const SHEETS: Record<string, unknown[][]> = {
  "08_STOCK_ASSETS": [
    ["stock_key", "drive_file_id", "filename", "category", "scene", "framing", "activity", "mood", "visual_description", "visible_objects", "visible_actions", "setting", "people_visibility", "body_parts_visible", "composition", "camera_angle", "lighting", "dominant_colors", "text_in_image", "specific_details", "visual_tagging_schema", "visual_review_status", "visual_reviewed_at", "tags", "good_for_pillars", "enabled", "review_status", "qa_flag", "sync_status", "use_count", "drive_md5"],
    ["SK1", "D_S1", "stock_tea.jpg", "food", "tea", "close", "drinking", "calm", "cup of tea on a table", "tea cup|table", "", "kitchen", "no_person", "", "centered", "top", "soft", "beige,brown", "none", "steam", "", "IMAGE_INSPECTED_V2", T0, "tea|calm", "sleep|stress", true, "", "", "READY", 2, "md5_s1"],
    ["SK2", "D_S2", "stock_desk.jpg", "work_study", "desk", "wide", "working", "focus", "phone beside laptop", "phone,laptop", "typing", "office", "no_person", "hands", "left", "eye", "daylight", "white", "none", "", "", "IMAGE_INSPECTED_V1", T0, "desk", "focus", true, "", "", "READY", 0, "md5_s2"],
    ["SK3", "D_S3", "stock_desk_copy.jpg", "work_study", "desk", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", true, "DUPLICATE", "", "", 0, "md5_s2"],
    ["SK4", "D_S4", "stock_bowl.jpg", "food", "breakfast", "", "", "", "yogurt bowl", "bowl", "", "kitchen", "no_person", "", "", "", "", "", "", "", "observable_v2", "IMAGE_INSPECTED_V2", T0, "breakfast", "", true, "", "", "", 0, "md5_s4"],
    ["SK5", "D_S5_MISSING", "stock_walk.jpg", "outdoors", "walk", "", "", "", "sidewalk", "", "", "street", "", "", "", "", "", "", "", "", "", "", "", "walk", "", true, "", "", "", 0, "md5_s5"],
    ["SK6", "D_S6_LEGACY", "legacy_vision.jpg", "home", "bedroom", "", "", "", "bed", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", true, "", "", "", 0, "md5_s6"],
  ],
  "08_VISUAL_REFS": [
    ["ref_id", "drive_file_id", "carousel_use", "category", "source_url", "source_platform", "pose_detail", "pose_group", "framing_group", "outfit_group", "decor_group", "lighting_group", "mood_palette", "orientation", "tags", "preferred_pillars", "review_status", "qa_flag", "file_hash"],
    ["VR_001", "D_R1", "hero", "hero", "https://pinterest.test/1", "pinterest", "sitting", "seated", "medium", "casual", "cozy", "warm", "warm|soft", "portrait", "cozy|home", "stress", "", "", "md5_r1"],
    ["VR_002", "D_R2", "hero", "hero", "", "", "standing", "", "full", "athleisure", "kitchen", "daylight", "fresh", "portrait", "kitchen|morning", "energy", "", "", "md5_r2"],
    ["VR_003", "D_R3", "hero", "hero", "", "", "", "", "", "", "", "", "", "", "", "", "DUPLICATE", "", "md5_r3"],
    ["VR_004", "D_R4", "hero", "hero", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "md5_r4"],
    ["VR_005", "D_R5_MISSING", "detail", "detail", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "md5_r5"],
  ],
};

const PUBLIC = `${SUPABASE}/storage/v1/object/public/cortifree-assets`;
const ASSET_ROWS = [
  { id: 101, workspace_id: "cortifree", drive_file_id: "D_S2", filename: "stock_desk.jpg", drive_md5: "md5_s2", public_url: `${PUBLIC}/s2.jpg`, source_type: "stock", category: "work_study", subcategory: "desk", scene: "desk", sync_status: "SYNCED", synced_at: T0, source_hash: "md5_s2", tags: ["desk"], metadata: { note: "keep" } },
  { id: 102, workspace_id: "cortifree", drive_file_id: "D_S6_LEGACY", filename: "legacy_vision.jpg", drive_md5: "md5_s6", public_url: `${PUBLIC}/s6.jpg`, source_type: "stock", category: "home", subcategory: "bedroom", visual_tagging_schema: "observable_v2", visual_review_status: "IMAGE_INSPECTED_V2", visual_reviewed_at: T0, sync_status: "PENDING", metadata: {} },
  { id: 103, workspace_id: "cortifree", drive_file_id: "D_S4", filename: "stock_bowl.jpg", drive_md5: "md5_s4", public_url: `${PUBLIC}/s4.jpg`, source_type: "stock", category: "food", subcategory: "breakfast", scene: "breakfast", sync_status: "SYNCED", synced_at: T0, source_hash: "md5_s4", metadata: {} },
  { id: 201, workspace_id: "cortifree", drive_file_id: "D_P01_G1", filename: "AVA_HOME_001.jpg", drive_md5: "md5_p01_g1", public_url: `${PUBLIC}/g1.jpg`, source_type: "persona_generated", persona_id: "P01", metadata: { drive_path: ["P01_AVA", "02_GENERATED"] } },
  { id: 202, workspace_id: "cortifree", drive_file_id: "D_P01_G2", filename: "AVA_HOME_002.jpg", drive_md5: "md5_p01_g2_old", public_url: `${PUBLIC}/g2.jpg`, source_type: "persona_generated", persona_id: "P01", metadata: {} },
  { id: 203, workspace_id: "cortifree", drive_file_id: "D_P01_MASTER", filename: "AVA_MASTER.jpg", drive_md5: "md5_p01_master", public_url: `${PUBLIC}/m.jpg`, source_type: "persona_master", persona_id: "P01", metadata: {} },
];
const MASTER_ROWS = [
  { id: 203, drive_file_id: "D_P01_MASTER", enabled: true, metadata: {} },
  { id: 204, drive_file_id: "D_P01_OLD_MASTER", enabled: true, metadata: { from: "old" } },
];
const APP_ROWS = [
  { id: 301, workspace_id: "cortifree", drive_file_id: "D_A2", filename: "CF_APP_SCREEN_02_mood_check_in.png", drive_md5: "md5_a2", public_url: `${PUBLIC}/a2.png`, source_type: "app_screenshot", metadata: { previous: true } },
];
const REF_ROWS = [
  { id: "VR_002", drive_file_id: "D_R2", thumbnail_url: `${PUBLIC}/r2.jpg`, file_hash: "md5_r2", category: "hero", pose: "standing", framing: "full", outfit: "old", environment: "kitchen", lighting: "daylight", tags: ["kitchen"], good_for: ["energy"], enabled: true, sync_status: "SYNCED", synced_at: T0, source_hash: "md5_r2", metadata: {} },
  { id: "VR_004", drive_file_id: null, thumbnail_url: null, file_hash: "md5_r4", category: "hero", enabled: true, metadata: {} },
  { id: "VR_OTHER", drive_file_id: "D_R_OTHER", thumbnail_url: `${PUBLIC}/ro.jpg`, file_hash: "md5_other", category: "detail", enabled: false, sync_status: "PENDING", metadata: { review_status: "REVIEW" } },
];

type Write = { method: string; target: string; body: unknown };
let writes: Write[] = [];
const realFetch = globalThis.fetch;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

async function stubFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  if (url.href === "https://oauth2.googleapis.com/token") return json({ access_token: "stub", expires_in: 3600 });
  if (url.hostname === "sheets.googleapis.com") {
    const a1 = decodeURIComponent(url.pathname.split("/values/")[1] ?? "");
    return json({ values: SHEETS[a1.split("!")[0]!] ?? [] });
  }
  if (url.hostname === "www.googleapis.com" && url.pathname === "/drive/v3/files") {
    const parent = url.searchParams.get("q")?.match(/^'([^']+)' in parents/)?.[1] ?? "";
    const children = DRIVE[parent] ?? DRIVE_FILES.get(parent)?.children ?? [];
    return json({ files: children.map(({ children: _children, ...file }) => file) });
  }
  if (url.hostname === "www.googleapis.com" && url.pathname.startsWith("/drive/v3/files/")) {
    const id = decodeURIComponent(url.pathname.slice("/drive/v3/files/".length));
    if (url.searchParams.get("alt") === "media") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    const node = DRIVE_FILES.get(id);
    if (!node) return new Response("not found", { status: 404 });
    const { children: _children, ...file } = node;
    return json(file);
  }
  if (url.origin !== SUPABASE) throw new Error(`drive golden stub: unexpected origin ${url.href}`);
  if (url.pathname.startsWith("/storage/v1/object/")) {
    writes.push({ method, target: "storage:upload", body: null });
    return json({});
  }
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (method === "GET") {
    const params = url.searchParams;
    if (table === "assets" && params.get("source_type") === "eq.app_screenshot") return json(APP_ROWS);
    if (table === "assets" && params.get("source_type") === "eq.persona_master") return json(MASTER_ROWS);
    if (table === "assets") return json(ASSET_ROWS);
    if (table === "visual_references" && params.get("file_hash")) return json([]);
    if (table === "visual_references") return json(REF_ROWS);
    return json([]);
  }
  const query = [...url.searchParams.entries()].filter(([key]) => key !== "workspace_id").map(([key, value]) => `${key}=${value}`).sort().join("&");
  writes.push({ method, target: `${table}?${query}`, body: init.body ? JSON.parse(String(init.body)) : null });
  return method === "PATCH" ? new Response(null, { status: 204 }) : json([]);
}

// Timestamps, Date.now() ids and random storage paths vary per run.
function normalize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)
    .replace(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/g, (match) => match === `"${T0}"` || match === `"${T1}"` ? match : '"<now>"')
    .replace(/SYNC_(DRIVE|APP_SCREENS)_\d+/g, "SYNC_$1_<id>")
    .replace(/generated\/\d+-[a-z0-9]+\.jpg/g, "generated/<upload>.jpg"));
}

const RUNS: Array<{ key: string; options: Record<string, unknown> }> = [
  { key: "all", options: { scope: "all", limit: 250 } },
  { key: "all_limit_2", options: { scope: "all", limit: 2 } },
  { key: "assets", options: { scope: "assets", limit: 250 } },
  { key: "stock", options: { scope: "stock", limit: 250 } },
  { key: "stock_missing", options: { scope: "stock_missing", limit: 250 } },
  { key: "visual_refs", options: { scope: "visual_refs", limit: 250 } },
  { key: "visual_refs_missing", options: { scope: "visual_refs_missing", limit: 250 } },
  { key: "app_screens", options: { scope: "app_screens", limit: 100 } },
  { key: "persona_P03_unprefixed_folder", options: { scope: "assets", personaId: "p03", limit: 250 } },
  // Pins current behaviour: a persona-filtered run throws on prefixed folder
  // names (P01_AVA) that personaIdFromFolder does not know.
  { key: "persona_P06_prefixed_folder", options: { scope: "assets", personaId: "P06", limit: 250 } },
];

type RunGolden = { writesSha256: string; writeCount: number; result: unknown } | { error: string };

describe("drive sync characterization", () => {
  const results = new Map<string, RunGolden>();
  const savedEnv = { ...process.env };

  before(async () => {
    Object.assign(process.env, {
      SUPABASE_URL: SUPABASE,
      SUPABASE_SERVICE_ROLE_KEY: "stub",
      GOOGLE_OAUTH_CLIENT_ID: "stub",
      GOOGLE_OAUTH_CLIENT_SECRET: "stub",
      GOOGLE_OAUTH_REFRESH_TOKEN: "stub",
      GOOGLE_DRIVE_PERSONAS_FOLDER_ID: ROOTS.personas,
      GOOGLE_DRIVE_STOCK_FOLDER_ID: ROOTS.stock,
      GOOGLE_DRIVE_VISUAL_REFS_FOLDER_ID: ROOTS.refs,
      GOOGLE_DRIVE_APP_SCREENS_FOLDER_ID: ROOTS.app,
    });
    globalThis.fetch = stubFetch as typeof fetch;
    const { syncGoogleDriveToBackend } = await import("../app/lib/sync/drive.js");
    for (const run of RUNS) {
      writes = [];
      try {
        const result = await syncGoogleDriveToBackend(run.options);
        const canonicalWrites = writes.map((write) => JSON.stringify(normalize(write))).sort();
        results.set(run.key, {
          writesSha256: createHash("sha256").update(canonicalWrites.join("\n")).digest("hex"),
          writeCount: canonicalWrites.length,
          result: normalize(result),
        });
      } catch (error) {
        results.set(run.key, { error: error instanceof Error ? error.message : String(error) });
      }
    }
    globalThis.fetch = realFetch;
    if (UPDATE) {
      mkdirSync(path.dirname(GOLDEN_FILE), { recursive: true });
      writeFileSync(GOLDEN_FILE, `${JSON.stringify(Object.fromEntries(results), null, 2)}\n`);
    }
  });

  after(() => {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  for (const run of RUNS) {
    it(`syncs scope ${run.key} unchanged`, () => {
      assert.ok(existsSync(GOLDEN_FILE), "drive sync golden is missing");
      const golden = JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as Record<string, RunGolden>;
      assert.deepEqual(results.get(run.key), golden[run.key]);
    });
  }
});
