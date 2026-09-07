import { supabase } from "../../lib/supabase.js";
const fallback = ["fitness","food","morning","self care","work / study"].map((category,i)=>({ category, count:[47,50,50,45,34][i], filename:`${category.replaceAll(" ","_")}__library` }));
export async function GET() {
  try {
    const r = await supabase("assets?select=id,category,subcategory,filename,orientation,framing,activity,mood,colors,public_url,use_count&enabled=eq.true&order=category.asc,filename.asc&limit=1000");
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json() as Array<Record<string, unknown> & { category: string; public_url?: string }>;
    const grouped = Object.entries(rows.reduce<Record<string, number>>((accumulator, asset) => {
      accumulator[asset.category] = (accumulator[asset.category] || 0) + 1;
      return accumulator;
    }, {})).map(([category, count]) => ({ category, count }));
    const previews = rows.filter((asset) => asset.public_url).slice(0, 32);
    return Response.json({ assets: grouped.length ? grouped : fallback, previews, total: rows.length, source: grouped.length ? "supabase" : "drive-index" });
  } catch {
    return Response.json({ assets: fallback, previews: [], total: fallback.reduce((sum, item) => sum + item.count, 0), source: "drive-index" });
  }
}
