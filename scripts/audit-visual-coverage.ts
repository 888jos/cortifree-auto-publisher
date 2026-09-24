import { chooseAssets, deriveVisualIntent, loadSelectableAssets } from "../app/lib/asset-selector";
import { dataBackend } from "../app/lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../app/lib/workspace";

type Row = Record<string, unknown>;
type Slide = {
  position: number;
  role?: string;
  headline: string;
  body: string;
  assetQuery: string;
  visualIntent: string;
  assetType?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function generatedSlides(spec: unknown): Slide[] {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return [];
  const value = (spec as Row).generated_slides;
  if (!Array.isArray(value)) return [];
  return value.filter((slide): slide is Slide => Boolean(
    slide && typeof slide === "object" && Number.isFinite(Number((slide as Row).position)),
  ));
}

function classifyFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("LOW_CONFIDENCE_ASSET:")) return { status: "MISSING_COVERAGE", reason: message };
  if (message.startsWith("ASSET_DIVERSITY_EXHAUSTED:")) return { status: "MISSING_COVERAGE", reason: message };
  if (message.startsWith("PERSONA_ASSET_REQUIRED:")) return { status: "MODELARK_REQUIRED", reason: message };
  if (message.startsWith("PERSONA_ASSETS_REQUIRED:")) return { status: "MODELARK_REQUIRED", reason: message };
  return { status: "ERROR", reason: message };
}

async function main() {
  const [assets, carouselResponse] = await Promise.all([
    loadSelectableAssets(),
    dataBackend(`carousels?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&status=neq.ARCHIVED&select=id,content_type,persona_id,status,spec,created_at&order=created_at.desc&limit=500`),
  ]);
  if (!carouselResponse.ok) throw new Error(await carouselResponse.text());
  const carousels = (await carouselResponse.json() as Row[])
    .filter((row) => text(row.content_type).startsWith("F"));

  const rows: Row[] = [];
  for (const carousel of carousels) {
    const slides = generatedSlides(carousel.spec);
    for (const slide of slides) {
      const base = {
        carousel_id: carousel.id,
        format: carousel.content_type,
        persona_id: carousel.persona_id,
        slide_position: slide.position,
        role: slide.role ?? "",
        asset_type: slide.assetType ?? "",
        scene: slide.assetQuery || slide.visualIntent || slide.headline,
        intent: deriveVisualIntent(slide),
      };

      if (slide.assetType === "text_only") {
        rows.push({ ...base, status: "NOT_APPLICABLE", reason: "TEXT_ONLY" });
        continue;
      }
      if (slide.assetType === "generated" && /cortifree|screenshot|app ui/i.test(`${slide.assetQuery} ${slide.visualIntent}`)) {
        rows.push({ ...base, status: "SPECIAL_ASSET", reason: "APP_SCREENSHOT_OR_BRAND_ASSET" });
        continue;
      }

      try {
        const matches = chooseAssets({
          assets,
          carouselType: text(carousel.content_type),
          personaId: text(carousel.persona_id) || undefined,
          slides: [slide],
        });
        const match = matches[0];
        rows.push({
          ...base,
          status: "COVERED",
          selected_asset_id: match?.asset.id ?? null,
          selected_filename: match?.asset.filename ?? null,
          score: match?.score ?? null,
        });
      } catch (error) {
        rows.push({ ...base, ...classifyFailure(error) });
      }
    }
  }

  const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
    const key = text(row.status) || "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const missing = rows.filter((row) => row.status === "MISSING_COVERAGE");
  const byFormat = rows.reduce<Record<string, Record<string, number>>>((acc, row) => {
    const format = text(row.format) || "UNKNOWN";
    const status = text(row.status) || "UNKNOWN";
    acc[format] ??= {};
    acc[format]![status] = (acc[format]![status] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    generated_at: new Date().toISOString(),
    assets_loaded: assets.length,
    current_carousels: carousels.length,
    slides_audited: rows.length,
    by_status: byStatus,
    by_format: byFormat,
    missing_coverage: missing,
    rows,
  };

  console.log(JSON.stringify(report, null, 2));
  if (missing.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
