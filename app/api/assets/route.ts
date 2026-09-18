import { dataBackend } from "../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

export async function GET() {
  try {
    const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,category,subcategory,filename,orientation,framing,activity,mood,colors,public_url,use_count,source_type,persona_id,last_used_at&enabled=eq.true&order=category.asc,filename.asc&limit=1000`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<Record<string, unknown> & { category: string; public_url?: string }>;
    const grouped = Object.entries(rows.reduce<Record<string, number>>((accumulator, asset) => {
      accumulator[asset.category] = (accumulator[asset.category] || 0) + 1;
      return accumulator;
    }, {})).map(([category, count]) => ({ category, count }));
    const previews = rows.filter((asset) => asset.public_url).slice(0, 200);
    return Response.json({ assets: grouped, previews, total: rows.length, source: "convex" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error), assets: [], previews: [], total: 0, source: "unavailable" }, { status: 503 });
  }
}
