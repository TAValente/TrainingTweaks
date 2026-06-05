import { NextResponse } from "next/server";
import { authCookieName, getRequestUser } from "@/lib/auth";
import {
  fetchDetailedRunActivities,
  fetchRecentStravaActivities,
  refreshTokensIfNeeded
} from "@/lib/strava";
import { getData, saveActivities, saveStravaTokens } from "@/lib/store";
import { buildActivitySummary } from "@/lib/summary";
import { computeRiskFindings } from "@/lib/risk";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const data = await getData(user.id);
  if (!data.strava) {
    return NextResponse.json(
      { error: "Strava is not connected yet. Use /api/strava/auth first." },
      { status: 401 }
    );
  }

  const tokens = await refreshTokensIfNeeded(data.strava);
  if (tokens.accessToken !== data.strava.accessToken || tokens.expiresAt !== data.strava.expiresAt) {
    await saveStravaTokens(user.id, tokens);
  }

  const newActivities = await fetchRecentStravaActivities(tokens.accessToken);
  let activities = await saveActivities(user.id, newActivities);
  const detailSync = await fetchDetailedRunActivities(tokens.accessToken, newActivities, data.activities);
  if (detailSync.activities.length) {
    activities = await saveActivities(user.id, detailSync.activities);
  }

  return NextResponse.json({
    refreshedAt: new Date().toISOString(),
    importedCount: newActivities.length,
    detailedRunCount: detailSync.syncedCount,
    detailedRunRemainingThisBatch: detailSync.remainingCount,
    totalCount: activities.length,
    activities: activities.slice(0, 20),
    summary: buildActivitySummary(activities),
    riskFindings: computeRiskFindings({ activities })
  });
}
