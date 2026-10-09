import { dataBackend } from "../../app/lib/data-backend";
import { refillPersonaCaches } from "./image-cache";
import { visualGroupMembers, visualPersonaIdFor } from "../../app/lib/asset-selector";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export type AssetPreflight = {
  ready: boolean;
  personaId: string;
  visualPersonaId: string;
  formatId: string;
  requiredPersonaAssets: number;
  personaAssets: number;
  reviewedStock: number;
  appScreens: number;
  reasons: string[];
};

export function minimumPersonaAssets(formatId: string, slideCount: number) {
  // New-generation formats need identity continuity on the hook/cover.
  // F08 additionally needs a second persona image for the diagonal pair when
  // no official app screenshot is selected. Other body assets may be stock or
  // repaired JIT, so preflight must not demand four cached persona images.
  if (formatId === "F06_PERSONA_EXPLAINER") return Math.min(Math.max(4, Math.ceil(slideCount / 2)), slideCount);
  if (formatId === "F08_2X2") return 2;
  return 1;
}

export async function checkGenerationAssetReadiness(input: {
  personaId: string;
  formatId: string;
  slideCount: number;
  requireAppScreen?: boolean;
}): Promise<AssetPreflight> {
  const requiredPersonaAssets = minimumPersonaAssets(input.formatId, input.slideCount);
  const visualPersonaId = visualPersonaIdFor(input.personaId) ?? input.personaId;
  const [persona, stock, appScreens] = await Promise.all([
    // Look-alike personas share one pool, so count the whole visual group.
    rows(`assets?workspace_id=eq.cortifree&persona_id=in.(${visualGroupMembers(input.personaId).map(encodeURIComponent).join(",") || encodeURIComponent(visualPersonaId)})&source_type=eq.persona_generated&enabled=eq.true&public_url=not.is.null&select=id&limit=300`),
    rows("assets?workspace_id=eq.cortifree&source_type=eq.stock&enabled=eq.true&public_url=not.is.null&select=id,visual_tagging_schema,visual_review_status,visual_reviewed_at&limit=1000"),
    rows("assets?workspace_id=eq.cortifree&source_type=eq.app_screenshot&enabled=eq.true&public_url=not.is.null&select=id&limit=100"),
  ]);
  const reviewedStock = stock.filter((row) => {
    const schema = String(row.visual_tagging_schema ?? "").toLowerCase();
    const review = String(row.visual_review_status ?? "").toUpperCase();
    return Boolean(row.visual_reviewed_at)
      && ((schema === "observable_v1" && review === "IMAGE_INSPECTED_V1")
        || (schema === "observable_v2" && review === "IMAGE_INSPECTED_V2"));
  }).length;
  const reasons: string[] = [];
  if (persona.length < requiredPersonaAssets) reasons.push(`PERSONA_CACHE:${persona.length}/${requiredPersonaAssets}`);
  if (reviewedStock < 12) reasons.push(`REVIEWED_STOCK:${reviewedStock}/12`);
  if (input.requireAppScreen && appScreens.length < 1) reasons.push("APP_SCREEN:0/1");
  return {
    ready: reasons.length === 0,
    personaId: input.personaId,
    visualPersonaId,
    formatId: input.formatId,
    requiredPersonaAssets,
    personaAssets: persona.length,
    reviewedStock,
    appScreens: appScreens.length,
    reasons,
  };
}

export async function requestPreflightRefill(preflight: AssetPreflight) {
  if (preflight.personaAssets >= preflight.requiredPersonaAssets) {
    return [{ persona_id: preflight.visualPersonaId, account_persona_id: preflight.personaId, action: "NO_PERSONA_REFILL_NEEDED" }];
  }
  return await refillPersonaCaches({ personaIds: [preflight.visualPersonaId] });
}
