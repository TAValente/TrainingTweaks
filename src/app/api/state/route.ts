import { NextResponse } from "next/server";
import { activitiesForClient } from "@/lib/activity-serialization";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { defaultTimeZone, localDateParts } from "@/lib/calendar";
import { getData } from "@/lib/store";
import { buildActivitySummary } from "@/lib/summary";
import { computeRiskFindings } from "@/lib/risk";
import { buildActivePlanSnapshot } from "@/lib/active-plan-snapshot";
import { computeRunnerTensionSnapshot } from "@/lib/runner-tension";
import { plannedWorkoutExposureFromSnapshot, structuredPlanSnapshot } from "@/lib/structured-plans";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
    if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const data = await getData(user.id);
    const today = localDateParts(new Date(), defaultTimeZone);
    const summary = buildActivitySummary(data.activities);
    const plannedWorkout = plannedWorkoutExposureFromSnapshot(
      structuredPlanSnapshot(data.context?.structuredPlan, { localDate: today.date })
    );
    const activePlanSnapshot = buildActivePlanSnapshot(data.context?.structuredPlan, data.activities, {
      localDate: today.date,
      completedMilesLast7Days: summary.mileageLast7Days
    });
    return NextResponse.json({
      user,
      connected: Boolean(data.strava),
      lastRefreshAt: data.lastRefreshAt,
      activities: activitiesForClient(data.activities.slice(0, 20)),
      context: data.context,
      summary,
      activePlanSnapshot,
      runnerTensionSnapshot: computeRunnerTensionSnapshot(data.runnerTensionModel),
      riskFindings: computeRiskFindings({ activities: data.activities, plannedWorkout })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load app state.";
    return NextResponse.json(
      { error: deploymentSafeError(message) },
      { status: 500 }
    );
  }
}

function deploymentSafeError(message: string) {
  if (message.includes("DATABASE_URL")) return "DATABASE_URL is missing or invalid.";
  if (message.toLowerCase().includes("password")) return "Database authentication failed. Check DATABASE_URL password.";
  if (message.toLowerCase().includes("enotfound")) return "Database host could not be reached. Check DATABASE_URL host.";
  if (message.toLowerCase().includes("timeout")) return "Database connection timed out. Use the Supabase session pooler URL.";
  if (message.toLowerCase().includes("network")) return "Database network connection failed. Use the Supabase session pooler URL.";
  return "Could not connect to the configured database.";
}
