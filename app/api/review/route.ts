import { NextResponse } from "next/server";
import { isAdminRequest } from "../../lib/admin-auth";
import { dataBackend } from "../../lib/data-backend";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "AWAITING_REVIEW";
    const response = await dataBackend(
      `carousels?workspace_id=eq.cortifree&review_status=eq.${encodeURIComponent(status)}&select=id,account_id,persona_id,topic,angle,status,review_status,review_notes,current_version,revision_count,scheduled_for,spec,created_at&order=created_at.asc&limit=100`
    );
    if (!response.ok) throw new Error(await response.text());
    return NextResponse.json({ carousels: await response.json() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
