import seed from "../../../config/visual-references.seed.json" with { type: "json" };
import { visualReferenceSchema } from "../../../src/visual-references";
import { dataBackend } from "../../lib/data-backend";
import { CORTIFREE_WORKSPACE_ID } from "../../lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  try {
    const categoryFilter = category && category !== "all" ? "&category=eq." + encodeURIComponent(category) : "";
    const response = await dataBackend("visual_references?workspace_id=eq." + CORTIFREE_WORKSPACE_ID + "&enabled=eq.true" + categoryFilter + "&select=*&order=id.asc&limit=500");
    if (!response.ok) throw new Error(await response.text());
    let references = await response.json() as typeof seed;
    if (query) references = references.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
    return Response.json({ references, source: "convex" });
  } catch {
    let references = seed.filter((item) => !category || category === "all" || item.category === category);
    if (query) references = references.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
    return Response.json({ references, source: "seed" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entries = Array.isArray(body) ? body : body.references;
    const references = visualReferenceSchema.array().max(200).parse(entries);
    const response = await dataBackend("visual_references?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(references.map((reference) => ({ ...reference, workspace_id: CORTIFREE_WORKSPACE_ID, updated_at: new Date().toISOString() }))),
    });
    if (!response.ok) throw new Error(await response.text());
    return Response.json({ references: await response.json() }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
