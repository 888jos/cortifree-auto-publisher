import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dataBackend, convexConfigured } from "../src/lib/data-backend.js";
import { uploadConvexFile } from "../app/lib/convex-storage.js";

const DRIVE_FOLDER_ID = "1I7OJ8juCsXINUMNJZ5IO5qhIrjYJlqi_";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  }));
  return nested.flat();
}

function tokensFor(filename: string) {
  return path.basename(filename, path.extname(filename)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/__/g, " ").replace(/[_-]+/g, " ").replace(/\b\d+\b/g, " ").replace(/[^a-zA-Z0-9 ]/g, " ")
    .toLowerCase().split(/\s+/).filter((token) => token.length > 1);
}

function inferSubcategory(category: string, terms: string[]) {
  const text = terms.join(" ");
  const rules: Record<string, Array<[RegExp, string]>> = {
    fitness: [[/pilates|yoga|mat/, "pilates_yoga"], [/walk|run|trail/, "walking_running"], [/gym|dumbbell|weight|strength/, "strength"], [/shoe|outfit|activewear/, "activewear"]],
    food: [[/breakfast|egg|oat|granola|toast|pancake/, "breakfast"], [/coffee|matcha|tea|water|juice|smoothie/, "drinks"], [/salad|bowl|pasta|rice|meal|plate/, "meals"], [/fruit|berry|vegetable|avocado/, "ingredients"], [/snack|cookie|chocolate/, "snacks"]],
    morning: [[/bed|alarm|wake|window|curtain/, "wake_up"], [/coffee|matcha|tea|water/, "morning_drinks"], [/breakfast|egg|oat|granola|toast/, "breakfast"], [/journal|notebook|book|laptop|study/, "planning"], [/skincare|serum|gua sha|toiletries/, "skincare"], [/exercise|mat|dumbbell/, "movement"]],
    night: [[/bed|bedroom|pillow|duvet/, "sleep_space"], [/candle|lamp|light/, "wind_down"], [/shower|bath|skincare/, "night_care"], [/book|journal|tea/, "quiet_routine"]],
    self_care: [[/skincare|serum|cream|gua sha/, "skincare"], [/bath|shower|towel/, "body_care"], [/nail|hair|makeup|perfume/, "beauty"], [/journal|book|candle|tea/, "slow_moments"]],
    work_study: [[/laptop|computer|desk|keyboard/, "desk_work"], [/study|notes|notebook|calculator|book/, "study"], [/coffee|matcha|tea/, "study_break"], [/bag|tote|commute/, "commute"]],
    outdoors: [[/walk|trail|path|street/, "walking"], [/forest|tree|nature|lake|mountain/, "nature"], [/city|building|cafe/, "city"], [/sunset|beach|sea/, "golden_hour"]],
    stress_reset: [[/phone|scroll|screen/, "digital_reset"], [/journal|book|write/, "journaling"], [/tea|coffee|water/, "slow_drink"], [/walk|outside|nature/, "movement"], [/bed|sofa|blanket/, "rest"]],
  };
  return rules[category]?.find(([pattern]) => pattern.test(text))?.[1] ?? "general";
}

function inferFraming(category: string, terms: string[], width: number, height: number) {
  const text = terms.join(" ");
  if (/closeup|close up|hand|cup|bowl|plate|serum|detail/.test(text)) return "close_up";
  if (/room|bedroom|street|trail|city|forest|landscape/.test(text) || width > height) return "wide";
  if (/woman|girl|person|portrait|outfit/.test(text)) return "portrait";
  return category === "food" ? "close_up" : "medium";
}

function inferMood(category: string, terms: string[]) {
  const text = terms.join(" ");
  if (/sun|warm|candle|cozy|bed|tea|journal|slow/.test(text)) return "calm_warm";
  if (/gym|run|exercise|dumbbell|workout/.test(text)) return "energizing";
  if (/forest|nature|trail|sea|beach/.test(text)) return "fresh_grounded";
  if (category === "work_study") return "focused_clean";
  if (category === "food") return "fresh_nourishing";
  return "soft_lifestyle";
}

function mimeType(file: string) {
  const extension = path.extname(file).toLowerCase();
  return extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : extension === ".avif" ? "image/avif" : "image/jpeg";
}

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: sync-drive-assets <extracted asset directory>");
  if (!convexConfigured()) throw new Error("Convex server credentials are required");

  const files = await walk(root);
  let completed = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const file of files) {
    const bytes = await readFile(file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const relative = path.relative(root, file);
    const [rawCategory = "uncategorized"] = relative.split(path.sep);
    const category = rawCategory.trim().toLowerCase().replace(/\s+/g, "_");
    const filename = path.basename(file).normalize("NFC");
    const safeExtension = path.extname(filename).toLowerCase().replace(".jpeg", ".jpg");
    const storagePath = `stock/${category}/${hash}${safeExtension}`;
    const image = sharp(bytes);
    const [metadata, stats] = await Promise.all([image.metadata(), image.clone().resize({ width: 64, height: 64, fit: "inside" }).stats()]);
    if (!metadata.width || !metadata.height) continue;
    const recordPath = `convex://${storagePath}`;
    const existingResponse = await dataBackend(`assets?path=eq.${encodeURIComponent(recordPath)}&select=public_url&limit=1`);
    if (!existingResponse.ok) throw new Error(await existingResponse.text());
    const [existing] = await existingResponse.json() as Array<{ public_url?: string }>;
    const upload = existing?.public_url ? null : await uploadConvexFile(new Uint8Array(bytes), mimeType(file));

    const terms = tokensFor(filename).filter((term) => term !== category);
    const dominant = stats.dominant;
    const dominantHex = `#${[dominant.r, dominant.g, dominant.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    const publicUrl = existing?.public_url ?? upload?.publicUrl;
    if (!publicUrl) throw new Error(`No Convex file URL for ${filename}`);
    rows.push({
      workspace_id: "cortifree", path: recordPath, filename, relative_path: relative, category,
      subcategory: inferSubcategory(category, terms), persona_id: null, source_type: "stock",
      width: metadata.width, height: metadata.height, orientation: metadata.height > metadata.width ? "portrait" : metadata.width > metadata.height ? "landscape" : "square",
      framing: inferFraming(category, terms, metadata.width, metadata.height), activity: terms.slice(0, 10).join(" ") || "lifestyle",
      mood: inferMood(category, terms), colors: [dominantHex], tags: [...new Set([category, ...terms])].slice(0, 24), hash,
      storage_bucket: "convex", storage_path: storagePath, public_url: publicUrl, indexed_at: new Date().toISOString(), enabled: true,
      metadata: { source: "google_drive", drive_folder_id: DRIVE_FOLDER_ID, convex_storage_id: upload?.storageId, aspect_ratio: Number((metadata.width / metadata.height).toFixed(4)), dominant_rgb: dominant },
    });
    completed += 1;
    if (completed % 25 === 0 || completed === files.length) console.log(`Prepared ${completed}/${files.length}`);
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.path, row])).values()];
  for (let offset = 0; offset < uniqueRows.length; offset += 50) {
    const batch = uniqueRows.slice(offset, offset + 50);
    const response = await dataBackend("assets?on_conflict=path", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
    if (!response.ok) throw new Error(`Asset upsert failed: ${await response.text()}`);
  }

  console.log(`Synced ${uniqueRows.length} unique assets to Convex`);
}

await main();
