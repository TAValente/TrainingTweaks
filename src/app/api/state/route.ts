import { NextResponse } from "next/server";
import { getData } from "@/lib/store";
import { buildActivitySummary } from "@/lib/summary";

export const runtime = "nodejs";

export async function GET() {
  const data = await getData();
  return NextResponse.json({
    connected: Boolean(data.strava),
    lastRefreshAt: data.lastRefreshAt,
    activities: data.activities.slice(0, 20),
    context: data.context,
    summary: buildActivitySummary(data.activities)
  });
}
