import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/config/env.js";
import { resolveDriveLayout } from "../src/config/paths.js";
import { visualReferenceSchema } from "../src/visual-references/index.js";

const env = loadEnv();
const root = resolveDriveLayout(env.DRIVE_ROOT)["09_VISUAL_REFERENCES"];
if (!root) throw new Error("Run refs:bootstrap first");
const manifestPath = path.join(root, "visual_references.json");
const manifest = visualReferenceSchema.array().parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
let imported = 0;
let skipped = 0;

for (let index = 0; index < manifest.length; index += 1) {
  const record = manifest[index];
  if (record.source_platform !== "pinterest" || !record.source_url) continue;
  const directory = path.join(root, record.category);
  const existing = fs.readdirSync(directory).find((name) => path.basename(name, path.extname(name)).toUpperCase() === record.id);
  if (existing) { skipped += 1; continue; }
  const page = await fetch(record.source_url, { headers: { "User-Agent": "Mozilla/5.0 CortiFreeReferenceImporter/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!page.ok) { skipped += 1; continue; }
  const html = await page.text();
  const match = html.match(/<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)|content=["']([^"']+)["'][^>]+property=["']og:image["'])/i);
  const imageUrl = (match?.[1] || match?.[2])?.replaceAll("&amp;", "&");
  if (!imageUrl) { skipped += 1; continue; }
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "i.pinimg.com") { skipped += 1; continue; }
  const image = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  const type = image.headers.get("content-type") ?? "";
  const length = Number(image.headers.get("content-length") ?? 0);
  if (!image.ok || !type.startsWith("image/") || length > 20_971_520) { skipped += 1; continue; }
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length > 20_971_520 || bytes.length < 1_000) { skipped += 1; continue; }
  const extension = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : ".jpg";
  fs.writeFileSync(path.join(directory, record.id + extension), bytes, { flag: "wx" });
  manifest[index] = visualReferenceSchema.parse({ ...record, thumbnail_url: imageUrl });
  imported += 1;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ imported, skipped, total: manifest.length }, null, 2));
