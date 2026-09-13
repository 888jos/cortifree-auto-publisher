import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { resolveDriveLayout } from "../config/paths";

export const visualReferenceCategories = [
  "mirror_selfie", "morning_home", "bedroom", "kitchen", "coffee_cafe", "outdoors_walk",
  "fitness_pilates", "self_care", "work_study", "food_grocery", "night_cozy", "fall", "hero_misc",
] as const;

export const visualReferenceSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]+_\d{3}$/),
  category: z.enum(visualReferenceCategories),
  source_url: z.string().url().nullable().default(null),
  source_platform: z.enum(["pinterest", "tiktok", "manual", "local"]).default("local"),
  storage_path: z.string().nullable().default(null),
  thumbnail_url: z.string().url().nullable().default(null),
  pose: z.string().default(""), framing: z.string().default(""), outfit: z.string().default(""),
  environment: z.string().default(""), lighting: z.string().default(""),
  mood: z.array(z.string()).default([]), orientation: z.enum(["portrait", "landscape", "square"]).default("portrait"),
  tags: z.array(z.string()).default([]), good_for: z.array(z.string()).default([]), enabled: z.boolean().default(true),
  file_hash: z.string().nullable().optional(), width: z.number().int().positive().nullable().optional(), height: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type VisualReference = z.infer<typeof visualReferenceSchema>;

const prefixes: Record<(typeof visualReferenceCategories)[number], string> = {
  mirror_selfie: "MIRROR", morning_home: "MORNING_HOME", bedroom: "BEDROOM", kitchen: "KITCHEN",
  coffee_cafe: "COFFEE", outdoors_walk: "OUTDOORS", fitness_pilates: "PILATES", self_care: "SKINCARE",
  work_study: "WORK", food_grocery: "GROCERY", night_cozy: "NIGHT", fall: "FALL", hero_misc: "HERO",
};

export function deterministicReferenceName(category: VisualReference["category"], existing: string[], extension = ".jpg") {
  const prefix = prefixes[category];
  const used = new Set(existing.map((name) => name.toUpperCase()));
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${prefix}_${String(index).padStart(3, "0")}${extension.toLowerCase().replace(".jpeg", ".jpg")}`;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
  throw new Error(`No available name for ${category}`);
}

async function sha256(file: string) {
  return crypto.createHash("sha256").update(await fsp.readFile(file)).digest("hex");
}

export async function scanVisualReferences(driveRoot: string) {
  const referenceRoot = resolveDriveLayout(driveRoot)["09_VISUAL_REFERENCES"];
  if (!referenceRoot) throw new Error("Missing Drive directory 09_VISUAL_REFERENCES");
  const manifestPath = path.join(referenceRoot, "visual_references.json");
  const manifest = fs.existsSync(manifestPath)
    ? z.array(visualReferenceSchema).parse(JSON.parse(await fsp.readFile(manifestPath, "utf8")))
    : [];
  const records = new Map(manifest.map((record) => [record.id, record]));
  const hashes = new Set(manifest.flatMap((record) => record.file_hash ? [record.file_hash] : []));

  for (const category of visualReferenceCategories) {
    const directory = path.join(referenceRoot, category);
    if (!fs.existsSync(directory)) continue;
    for (const filename of (await fsp.readdir(directory)).sort()) {
      if (!/\.(jpe?g|png|webp|avif)$/i.test(filename)) continue;
      const file = path.join(directory, filename);
      const fileHash = await sha256(file);
      if (hashes.has(fileHash)) continue;
      const metadata = await sharp(file).metadata();
      if (!metadata.width || !metadata.height) continue;
      const stem = path.basename(filename, path.extname(filename)).toUpperCase();
      const matching = records.get(stem);
      if (matching) {
        records.set(stem, visualReferenceSchema.parse({
          ...matching, storage_path: path.relative(driveRoot, file), file_hash: fileHash,
          width: metadata.width, height: metadata.height,
          orientation: metadata.width === metadata.height ? "square" : metadata.height > metadata.width ? "portrait" : "landscape",
          metadata: { ...matching.metadata, imported_filename: filename },
        }));
        hashes.add(fileHash);
        continue;
      }
      const existingNames = [...records.values()].filter((item) => item.category === category).map((item) => `${item.id}.jpg`);
      const generatedName = deterministicReferenceName(category, existingNames, path.extname(filename));
      const id = path.basename(generatedName, path.extname(generatedName));
      records.set(id, visualReferenceSchema.parse({
        id, category, source_platform: "local", storage_path: path.relative(driveRoot, file), file_hash: fileHash,
        width: metadata.width, height: metadata.height,
        orientation: metadata.width === metadata.height ? "square" : metadata.height > metadata.width ? "portrait" : "landscape",
        tags: [category], metadata: { original_filename: filename },
      }));
      hashes.add(fileHash);
    }
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function searchVisualReferences(records: VisualReference[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    const text = [record.id, record.category, record.pose, record.framing, record.outfit, record.environment, record.lighting, ...record.mood, ...record.tags, ...record.good_for].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
