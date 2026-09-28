import { dataBackend } from "../../app/lib/data-backend";
import { refillPersonaCaches } from "./image-cache";

type Row = Record<string, unknown>;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}

export type AssetPreflight = {
  ready: boolean;
  personaId: string;
  formatId: string;
  requiredPersonaAssets: number;
  personaAssets: number;
  reviewedStock: number;
  appScreens: number;
  requiresAppScreen: boolean;
  reasons: string[];
};

export function minimumPersonaAssets(formatId: string, slideCount: number) {
  if (formatId === "F06_PERSONA_EXPLAINER") return Math.min(Math.max(4, Math.ceil(slideCount / 2)), slideCount);
  if (formatId === "F08_2X2") return 2;
  return Math.min(4, Math.max(1, slideCount));
}

export function appScreenBlockReason(requiresAppScreen: boolean, appScreens: number) {
  return requiresAppScreen && appScreens < 1 ? "APP_SCREEN:0/1" : null;
}

export async function checkGenerationAssetReadiness(input: {
  personaId: string;
  formatId: string;
  slideCount: number;
  requiresAppScreen?: boolean;
}): Promise<AssetPreflight> {
  const requiredPersonaAssets = minimumPersonaAssets(input.formatId, input.slideCount);
  const requiresAppScreen = input.requiresAppScreen === true;
  const [persona, stock, appScreens] = await Promise.all([
    rows(`assets?workspace_id=eq.cortifree&persona_id=eq.${encodeURIComponent(input.personaId)}&source_type=eq.persona_generated&enabled=eq.true&public_url=not.is.null&select=id&limit=100`),
    rows("assets?workspace_id=eq.cortifree&source_type=eq.stock&enabled=eq.true&public_url=not.is.null&select=id,visual_tagging_schema,visual_review_status,visual_reviewed_at&limit=1000"),
    requiresAppScreen
      ? rows("assets?workspace_id=eq.cortifree&source_type=eq.app_screenshot&enabled=eq.true&public_url=not.is.null&select=id&limit=100")
      : Promise.resolve([]),
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
  const appScreenReason = appScreenBlockReason(requiresAppScreen, appScreens.length);
  if (appScreenReason) reasons.push(appScreenReason);
  return {
    ready: reasons.length === 0,
    personaId: input.personaId,
    formatId: input.formatId,
    requiredPersonaAssets,
    personaAssets: persona.length,
    reviewedStock,
    appScreens: appScreens.length,
    requiresAppScreen,
    reasons,
  };
}

export async function requestPreflightRefill(preflight: AssetPreflight) {
  if (preflight.personaAssets >= preflight.requiredPersonaAssets) {
    return [{ persona_id: preflight.personaId, action: "NO_PERSONA_REFILL_NEEDED" }];
  }
  return await refillPersonaCaches({ personaIds: [preflight.personaId] });
}
