import { NextResponse } from "next/server";
import { isOperatorRequest } from "../../../lib/admin-auth";
import { approveCarousel } from "../../../lib/human-review";

export async function POST(request: Request) {
  if (!isOperatorRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { carouselId?: string; actor?: string };
    if (!body.carouselId) return NextResponse.json({ error: "carouselId is required" }, { status: 400 });
    return NextResponse.json(await approveCarousel(body.carouselId, body.actor ?? "admin"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
