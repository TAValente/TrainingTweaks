import { NextResponse } from "next/server";
import {
  fetchRecentStravaActivities,
  refreshTokensIfNeeded
} from "@/lib/strava";
import { getData, saveActivities, saveStravaTokens } from "@/lib/store";
import { buildActivitySummary } from "@/lib/summary";

export const runtime = "nodejs";

export async function POST() {
  const data = await getData();
  if (!data.strava) {
    return NextResponse.json(
      { error: "Strava is not connected yet. Use /api/strava/auth first." },
      { status: 401 }
    );
  }

  const tokens = await refreshTokensIfNeeded(data.strava);
  if (tokens.accessToken !== data.strava.accessToken || tokens.expiresAt !== data.strava.expiresAt) {
    await saveStravaTokens(tokens);
  }

  const newActivities = await fetchRecentStravaActivities(tokens.accessToken);
  const activities = await saveActivities(newActivities);

  return NextResponse.json({
    refreshedAt: new Date().toISOString(),
    importedCount: newActivities.length,
    totalCount: activities.length,
    activities: activities.slice(0, 20),
    summary: buildActivitySummary(activities)
  });
}
