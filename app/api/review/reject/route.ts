import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-auth";
import { rejectCarousel } from "../../../lib/human-review";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { carouselId?: string; reason?: string; actor?: string };
    if (!body.carouselId) return NextResponse.json({ error: "carouselId is required" }, { status: 400 });
    if (!body.reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });
    return NextResponse.json(await rejectCarousel(body.carouselId, body.reason.trim(), body.actor ?? "admin"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
