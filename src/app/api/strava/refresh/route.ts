import { NextResponse } from "next/server";
import { activitiesForClient } from "@/lib/activity-serialization";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { defaultTimeZone, localDateParts } from "@/lib/calendar";
import {
  fetchDetailedRunActivities,
  fetchRecentStravaActivities,
  fetchRunActivityStreams,
  refreshTokensIfNeeded
} from "@/lib/strava";
import { stravaRefreshConfig, stravaRefreshWindow } from "@/lib/strava-refresh";
import { getData, saveActivities, saveStravaTokens } from "@/lib/store";
import { buildActivePlanSnapshot } from "@/lib/active-plan-snapshot";
import { buildActivitySummary } from "@/lib/summary";
import { computeRiskFindings } from "@/lib/risk";
import { plannedWorkoutExposureFromSnapshot, structuredPlanSnapshot } from "@/lib/structured-plans";
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

  const refreshConfig = stravaRefreshConfig();
  const refreshWindow = stravaRefreshWindow({
    lastRefreshAt: data.lastRefreshAt,
    config: refreshConfig
  });
  const fetchOptions = { timeoutMs: refreshConfig.fetchTimeoutMs };
  try {
    const tokens = await refreshTokensIfNeeded(data.strava, fetchOptions);
    if (tokens.accessToken !== data.strava.accessToken || tokens.expiresAt !== data.strava.expiresAt) {
      await saveStravaTokens(user.id, tokens);
    }

    const activityFetch = await fetchRecentStravaActivities(tokens.accessToken, {
      after: refreshWindow.after,
      pageLimit: refreshConfig.pageLimit,
      timeoutMs: refreshConfig.fetchTimeoutMs
    });
    const fetchedActivities = activityFetch.activities;
    const existingActivityIds = new Set(data.activities.map((activity) => `${activity.provider}:${activity.providerActivityId}`));
    const importedCount = fetchedActivities.filter((activity) => !existingActivityIds.has(`${activity.provider}:${activity.providerActivityId}`)).length;
    let activities = await saveActivities(user.id, fetchedActivities);
    const detailSync = await fetchDetailedRunActivities(tokens.accessToken, fetchedActivities, data.activities, fetchOptions);
    if (detailSync.activities.length) {
      activities = await saveActivities(user.id, detailSync.activities);
    }
    const streamSync = await fetchRunActivityStreams(tokens.accessToken, activities, fetchOptions);
    const { activities: streamActivities, ...streamSyncSummary } = streamSync;
    if (streamActivities.length) {
      activities = await saveActivities(user.id, streamActivities);
    }
    const today = localDateParts(new Date(), defaultTimeZone);
    const summary = buildActivitySummary(activities);
    const plannedWorkout = plannedWorkoutExposureFromSnapshot(
      structuredPlanSnapshot(data.context?.structuredPlan, { localDate: today.date })
    );
    const activePlanSnapshot = buildActivePlanSnapshot(data.context?.structuredPlan, activities, {
      localDate: today.date,
      completedMilesLast7Days: summary.mileageLast7Days
    });

    return NextResponse.json({
      refreshedAt: new Date().toISOString(),
      importedCount,
      fetchedCount: fetchedActivities.length,
      activityFetch: {
        after: activityFetch.after,
        afterIso: refreshWindow.afterIso,
        mode: refreshWindow.mode,
        overlapDays: refreshWindow.overlapDays,
        initialSyncDays: refreshWindow.initialSyncDays,
        pageLimit: activityFetch.pageLimit,
        pageCount: activityFetch.pageCount,
        perPage: activityFetch.perPage
      },
      detailSync: {
        attemptedCount: detailSync.attemptedCount,
        syncedCount: detailSync.syncedCount,
        failedCount: detailSync.failedCount,
        remainingCount: detailSync.remainingCount
      },
      streamSync: streamSyncSummary,
      totalCount: activities.length,
      activities: activitiesForClient(activities.slice(0, 20)),
      summary,
      activePlanSnapshot,
      riskFindings: computeRiskFindings({ activities, plannedWorkout })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strava refresh failed.";
    return NextResponse.json(
      {
        error: message,
        activityFetch: {
          after: refreshWindow.after,
          afterIso: refreshWindow.afterIso,
          mode: refreshWindow.mode,
          overlapDays: refreshWindow.overlapDays,
          initialSyncDays: refreshWindow.initialSyncDays,
          pageLimit: refreshConfig.pageLimit
        }
      },
      { status: 502 }
    );
  }
}
