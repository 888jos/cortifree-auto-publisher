import { dataBackend } from "../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const audit = requestUrl.searchParams.get("audit") === "1";
    const response = await dataBackend(`assets?workspace_id=eq.${CORTIFREE_WORKSPACE_ID}&select=id,category,subcategory,scene,good_for,filename,orientation,framing,activity,mood,colors,public_url,use_count,source_type,persona_id,last_used_at,visual_description,visible_objects,visible_actions,setting,people_visibility,body_parts_visible,composition,camera_angle,lighting,dominant_colors,text_in_image,specific_details,visual_tagging_schema,visual_review_status,visual_reviewed_at,metadata&enabled=eq.true&order=category.asc,filename.asc&limit=1000`);
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
      const observableTagged = stock.filter((asset) => {
        const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
        return String(asset.visual_tagging_schema || metadata.visual_tagging_schema || "").toLowerCase() === "observable_v2"
          && String(asset.visual_review_status || metadata.visual_review_status || "").toUpperCase() === "IMAGE_INSPECTED_V2";
      }).length;
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
          stock_observable_tagged: observableTagged,
          stock_observable_tagging_schema: "observable_v2",
        },
        audit: rows.map(({ id, category, subcategory, scene, good_for, filename, orientation, framing, activity, mood, colors, use_count, source_type, persona_id, visual_description, visible_objects, visible_actions, setting, people_visibility, body_parts_visible, composition, camera_angle, lighting, dominant_colors, text_in_image, specific_details, visual_tagging_schema, visual_review_status, visual_reviewed_at, metadata }) => ({ id, category, subcategory, scene, good_for, filename, orientation, framing, activity, mood, colors, use_count, source_type, persona_id, visual_description, visible_objects, visible_actions, setting, people_visibility, body_parts_visible, composition, camera_angle, lighting, dominant_colors, text_in_image, specific_details, visual_tagging_schema, visual_review_status, visual_reviewed_at, metadata })),
      });
    }
    return Response.json({ assets: grouped, previews, total: rows.length, source: "supabase" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error), assets: [], previews: [], total: 0, source: "unavailable" }, { status: 503 });
  }
}
