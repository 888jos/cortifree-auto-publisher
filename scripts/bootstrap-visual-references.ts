import fs from "node:fs";
import path from "node:path";
import seed from "../config/visual-references.seed.json" with { type: "json" };
import { loadEnv } from "../src/config/env.js";
import { resolveDriveLayout } from "../src/config/paths.js";
import { visualReferenceCategories, visualReferenceSchema } from "../src/visual-references/index.js";

const env = loadEnv();
const layout = resolveDriveLayout(env.DRIVE_ROOT);
const root = layout["09_VISUAL_REFERENCES"] ?? path.join(env.DRIVE_ROOT, "09_VISUAL_REFERENCES");
fs.mkdirSync(root, { recursive: true });
for (const category of visualReferenceCategories) fs.mkdirSync(path.join(root, category), { recursive: true });
const manifestPath = path.join(root, "visual_references.json");
const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown[] : [];
const merged = new Map(existing.map((entry) => {
  const parsed = visualReferenceSchema.parse(entry);
  return [parsed.id, parsed] as const;
}));
for (const entry of seed) {
  const parsed = visualReferenceSchema.parse(entry);
  if (!merged.has(parsed.id)) merged.set(parsed.id, parsed);
}
fs.writeFileSync(manifestPath, `${JSON.stringify([...merged.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`);
console.log(`Visual reference manifest contains ${merged.size} records in ${manifestPath}`);
