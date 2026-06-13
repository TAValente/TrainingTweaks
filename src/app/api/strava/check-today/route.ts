import { NextResponse } from "next/server";
import { activitiesForClient } from "@/lib/activity-serialization";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { defaultTimeZone, localDateParts } from "@/lib/calendar";
import { computeRiskFindings } from "@/lib/risk";
import { buildActivePlanSnapshot } from "@/lib/active-plan-snapshot";
import { buildActivitySummary } from "@/lib/summary";
import { fetchRecentStravaActivities, refreshTokensIfNeeded } from "@/lib/strava";
import { stravaTodayCheckConfig, stravaTodayCheckContract, stravaTodayCheckWindow, todayCheckStatusCopy } from "@/lib/strava-refresh";
import { getData, saveActivities, saveStravaTokens } from "@/lib/store";
import { plannedWorkoutExposureFromSnapshot, structuredPlanSnapshot } from "@/lib/structured-plans";
import type { AppData, Activity } from "@/lib/types";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const data = await getData(user.id);
  if (!data.strava) {
    return NextResponse.json(
      {
        ...statePayload(data, "error", "Strava is not connected yet. Use /api/strava/auth first."),
        error: "Strava is not connected yet. Use /api/strava/auth first."
      },
      { status: 401 }
    );
  }

  const today = localDateParts(new Date(), defaultTimeZone);
  const config = stravaTodayCheckConfig();
  const contract = stravaTodayCheckContract();
  const window = stravaTodayCheckWindow({
    localDate: today.date,
    lastRefreshAt: data.lastRefreshAt,
    config
  });

  try {
    const tokens = await refreshTokensIfNeeded(data.strava, { timeoutMs: config.fetchTimeoutMs });
    if (tokens.accessToken !== data.strava.accessToken || tokens.expiresAt !== data.strava.expiresAt) {
      await saveStravaTokens(user.id, tokens);
    }

    const activityFetch = await fetchRecentStravaActivities(tokens.accessToken, {
      after: window.after,
      pageLimit: contract.activityFetch.pageLimit,
      perPage: contract.activityFetch.perPage,
      timeoutMs: contract.activityFetch.timeoutMs
    });
    const newActivities = newActivitiesOnly(data.activities, activityFetch.activities);
    if (!newActivities.length) {
      return NextResponse.json({
        ...statePayload(data, "no_new_activity", todayCheckStatusCopy("no_new_activity")),
        importedCount: 0,
        fetchedCount: activityFetch.activities.length,
        activityFetch: {
          after: activityFetch.after,
          afterIso: window.afterIso,
          overlapDays: window.overlapDays,
          pageLimit: activityFetch.pageLimit,
          pageCount: activityFetch.pageCount,
          perPage: activityFetch.perPage
        }
      });
    }

    const activities = await saveActivities(user.id, activityFetch.activities);
    const refreshedData = {
      ...data,
      activities,
      lastRefreshAt: new Date().toISOString()
    };
    return NextResponse.json({
      ...statePayload(refreshedData, "updated", todayCheckStatusCopy("updated", newActivities.length)),
      importedCount: newActivities.length,
      fetchedCount: activityFetch.activities.length,
      activityFetch: {
        after: activityFetch.after,
        afterIso: window.afterIso,
        overlapDays: window.overlapDays,
        pageLimit: activityFetch.pageLimit,
        pageCount: activityFetch.pageCount,
        perPage: activityFetch.perPage
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strava today check failed.";
    return NextResponse.json({
      ...statePayload(data, "using_last_sync", todayCheckStatusCopy("using_last_sync")),
      error: message,
      importedCount: 0,
      activityFetch: {
        after: window.after,
        afterIso: window.afterIso,
        overlapDays: window.overlapDays,
        pageLimit: config.pageLimit,
        perPage: config.perPage
      }
    });
  }
}

function statePayload(data: AppData, result: "updated" | "no_new_activity" | "using_last_sync" | "error", status: string) {
  const today = localDateParts(new Date(), defaultTimeZone);
  const summary = buildActivitySummary(data.activities);
  const plannedWorkout = plannedWorkoutExposureFromSnapshot(
    structuredPlanSnapshot(data.context?.structuredPlan, { localDate: today.date })
  );
  const activePlanSnapshot = buildActivePlanSnapshot(data.context?.structuredPlan, data.activities, {
    localDate: today.date,
    completedMilesLast7Days: summary.mileageLast7Days
  });

  return {
    result,
    status,
    connected: Boolean(data.strava),
    lastRefreshAt: data.lastRefreshAt,
    activities: activitiesForClient(data.activities.slice(0, 20)),
    context: data.context,
    summary,
    activePlanSnapshot,
    riskFindings: computeRiskFindings({ activities: data.activities, plannedWorkout })
  };
}

function newActivitiesOnly(existingActivities: Activity[], fetchedActivities: Activity[]) {
  const existingIds = new Set(existingActivities.map((activity) => `${activity.provider}:${activity.providerActivityId}`));
  return fetchedActivities.filter((activity) => !existingIds.has(`${activity.provider}:${activity.providerActivityId}`));
}
