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
  // Runtime references now use stable canonical IDs such as VR134 as well as
  // older names such as MORNING_HOME_001. Do not reject valid runtime rows
  // just because their naming taxonomy evolved.
  id: z.string().trim().min(2),
  category: z.string().trim().min(1),
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

/**
 * Sheet moderation is authoritative for automatic generation. Keep the
 * status fields in metadata so the existing table remains backwards
 * compatible, but centralise the rule so every selector applies it.
 */
export function isAutomaticVisualReference(reference: Pick<VisualReference, "enabled" | "metadata">) {
  if (reference.enabled === false) return false;
  const metadata = reference.metadata ?? {};
  const reviewStatus = String(metadata.review_status ?? "").trim().toUpperCase();
  const qaFlag = String(metadata.qa_flag ?? "").trim().toUpperCase();
  if (reviewStatus === "DUPLICATE" || reviewStatus === "REVIEW") return false;
  if (qaFlag === "MULTI_PERSON_AUTO_DISABLED") return false;
  return true;
}

const prefixes: Record<(typeof visualReferenceCategories)[number], string> = {
  mirror_selfie: "MIRROR", morning_home: "MORNING_HOME", bedroom: "BEDROOM", kitchen: "KITCHEN",
  coffee_cafe: "COFFEE", outdoors_walk: "OUTDOORS", fitness_pilates: "PILATES", self_care: "SKINCARE",
  work_study: "WORK", food_grocery: "GROCERY", night_cozy: "NIGHT", fall: "FALL", hero_misc: "HERO",
};

export function deterministicReferenceName(category: (typeof visualReferenceCategories)[number], existing: string[], extension = ".jpg") {
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

export type VisualReferenceSceneIntent = {
  category?: string;
  scene_description: string;
  recommended_reference_categories?: string[];
  recommended_framing?: string | null;
  recommended_outfit?: string | null;
};

const referenceStopWords = new Set(["the", "and", "with", "for", "from", "into", "this", "that", "scene", "woman", "girl", "person", "photo", "image", "lifestyle"]);

function referenceTerms(value: unknown) {
  const raw = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  return [...new Set(raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((term) => term.length > 2 && !referenceStopWords.has(term)))];
}

function referenceAliasTerms(value: string) {
  const aliases: Record<string, string[]> = {
    bedroom: ["bedroom", "bed", "home", "cozy"],
    morning_home: ["morning", "home", "bedroom", "kitchen", "window"],
    kitchen: ["kitchen", "cooking", "food", "meal"],
    coffee_cafe: ["coffee", "cafe", "drink", "cup"],
    outdoors_walk: ["outdoor", "outside", "walk", "street", "park", "commute"],
    fitness_pilates: ["fitness", "gym", "pilates", "workout", "movement", "exercise"],
    self_care: ["selfcare", "skincare", "bathroom", "beauty", "reset"],
    work_study: ["work", "study", "desk", "laptop", "journal", "meeting"],
    food_grocery: ["food", "grocery", "kitchen", "meal", "produce", "cooking"],
    night_cozy: ["night", "cozy", "bed", "bedroom", "sleep", "sofa"],
    fall: ["fall", "autumn", "outdoor", "walk"],
    home_reset: ["home", "reset", "room", "clean", "tidy", "sofa"],
    getting_ready: ["getting", "ready", "mirror", "outfit", "bathroom", "selfcare"],
    mirror_selfie: ["mirror", "selfie", "portrait"],
    bathroom: ["bathroom", "shower", "skincare", "selfcare"],
    hero_misc: ["portrait", "selfie", "lifestyle"],
  };
  return aliases[value] ?? referenceTerms(value);
}

export function scoreVisualReferenceForScene(reference: VisualReference, scene: VisualReferenceSceneIntent) {
  const wantedTerms = [
    ...referenceTerms(scene.scene_description),
    ...referenceTerms(scene.category),
    ...(scene.recommended_reference_categories ?? []).flatMap(referenceAliasTerms),
    ...referenceTerms(scene.recommended_framing),
    ...referenceTerms(scene.recommended_outfit),
  ];
  const wanted = new Set(wantedTerms);
  const metadataValues = Object.values(reference.metadata ?? {})
    .filter((value) => typeof value === "string" || Array.isArray(value));
  const corpus = [
    reference.category, reference.pose, reference.framing, reference.outfit,
    reference.environment, reference.lighting, ...reference.mood,
    ...reference.tags, ...reference.good_for, ...metadataValues,
  ].join(" ").toLowerCase();
  const available = new Set(referenceTerms(corpus));

  let baseMatches = 0;
  for (const term of wanted) if (available.has(term)) baseMatches += 1;
  let score = baseMatches * 5;

  const fieldScore = (value: unknown, weight: number) => {
    const actual = new Set(referenceTerms(value));
    let matches = 0;
    for (const term of wanted) if (actual.has(term)) matches += 1;
    return matches * weight;
  };

  score += fieldScore(reference.environment, 10);
  score += fieldScore(reference.pose, 9);
  score += fieldScore(reference.good_for, 7);
  score += fieldScore(reference.tags, 5);
  score += fieldScore(reference.framing, 4);
  score += fieldScore(reference.outfit, 3);
  score += fieldScore(reference.lighting, 3);
  score += fieldScore(reference.mood, 2);
  score += fieldScore(reference.category, 1);

  const sceneText = scene.scene_description.toLowerCase();
  if (/walk|walking|outside|outdoor|street|sidewalk|park|nature|commute/.test(sceneText) && !/outdoor|outside|walk|street|sidewalk|park|nature|commute/.test(corpus)) score -= 80;
  if (/gym|workout|strength|pilates|yoga|treadmill|exercise|fitness|run/.test(sceneText) && !/gym|fitness|pilates|yoga|treadmill|workout|exercise|movement|run/.test(corpus)) score -= 55;
  if (/bed|bedroom|sleep|night routine|wake|waking|cozy/.test(sceneText) && !/bed|bedroom|night|morning_home|cozy|home/.test(corpus)) score -= 45;
  if (/food|meal|breakfast|lunch|dinner|grocery|cook|cooking|kitchen/.test(sceneText) && !/food|grocery|kitchen|meal|coffee|cafe|produce|cook/.test(corpus)) score -= 45;
  if (/no_person|none|environment reference|empty room|food arrangement/.test(corpus)) score -= 100;

  if (/face|portrait|selfie|full body|partial body|person|mirror/.test(corpus)) score += 12;
  return score;
}

export function searchVisualReferences(records: VisualReference[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    const text = [record.id, record.category, record.pose, record.framing, record.outfit, record.environment, record.lighting, ...record.mood, ...record.tags, ...record.good_for].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
