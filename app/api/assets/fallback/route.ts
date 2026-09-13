import { dataBackend } from "../../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../../lib/workspace";

export const runtime = "nodejs";

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const seed = params.get("seed") || "cortifree-reference";
    const preferredCategory = params.get("category")?.trim().toLowerCase().replaceAll("_", " ");
    const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=category,public_url&enabled=eq.true&public_url=not.is.null&order=filename.asc&limit=1000`);
    if (!response.ok) throw new Error(await response.text());
    const allAssets = await response.json() as Array<{ category: string; public_url: string }>;
    const normalized = (value: string) => value.trim().toLowerCase().replaceAll("_", " ").replaceAll(/\s+/g, " ");
    const matching = preferredCategory ? allAssets.filter((asset) => normalized(asset.category) === normalized(preferredCategory)) : [];
    const assets = matching.length ? matching : allAssets;
    if (!assets.length) return Response.json({ error: "No fallback asset available" }, { status: 404 });
    return Response.redirect(assets[hash(seed) % assets.length]!.public_url, 307);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Fallback unavailable" }, { status: 500 });
  }
}
