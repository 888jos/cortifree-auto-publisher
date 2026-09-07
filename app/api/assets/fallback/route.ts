import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export async function GET(request: Request) {
  try {
    const seed = new URL(request.url).searchParams.get("seed") || "cortifree-reference";
    const response = await supabase("assets?select=public_url&enabled=eq.true&public_url=not.is.null&order=filename.asc&limit=1000");
    if (!response.ok) throw new Error(await response.text());
    const assets = await response.json() as Array<{ public_url: string }>;
    if (!assets.length) return Response.json({ error: "No fallback asset available" }, { status: 404 });
    return Response.redirect(assets[hash(seed) % assets.length]!.public_url, 307);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Fallback unavailable" }, { status: 500 });
  }
}
