import { dataBackend } from "../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const audit = requestUrl.searchParams.get("audit") === "1";
    const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,category,subcategory,scene,good_for,filename,orientation,framing,activity,mood,colors,public_url,use_count,source_type,persona_id,last_used_at&enabled=eq.true&order=category.asc,filename.asc&limit=1000`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<Record<string, unknown> & { category: string; public_url?: string }>;
    const grouped = Object.entries(rows.reduce<Record<string, number>>((accumulator, asset) => {
      accumulator[asset.category] = (accumulator[asset.category] || 0) + 1;
      return accumulator;
    }, {})).map(([category, count]) => ({ category, count }));
    const previews = rows.filter((asset) => asset.public_url).slice(0, 200);
    if (audit) {
      const stock = rows.filter((asset) => asset.source_type === "stock");
      const visualMetadataMissing = stock.filter((asset) => !String(asset.scene ?? "").trim() || !Array.isArray(asset.good_for) || asset.good_for.length === 0).length;
      return Response.json({
        assets: grouped,
        total: rows.length,
        source: "supabase",
        audit_summary: {
          by_source_type: Object.fromEntries(Object.entries(rows.reduce<Record<string, number>>((accumulator, asset) => {
            const sourceType = String(asset.source_type ?? "unknown");
            accumulator[sourceType] = (accumulator[sourceType] || 0) + 1;
            return accumulator;
          }, {}))),
          stock_metadata_missing_scene_or_good_for: visualMetadataMissing,
        },
        audit: rows.map(({ id, category, subcategory, scene, good_for, filename, orientation, framing, activity, mood, colors, use_count, source_type, persona_id }) => ({ id, category, subcategory, scene, good_for, filename, orientation, framing, activity, mood, colors, use_count, source_type, persona_id })),
      });
    }
    return Response.json({ assets: grouped, previews, total: rows.length, source: "supabase" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error), assets: [], previews: [], total: 0, source: "unavailable" }, { status: 503 });
  }
}
