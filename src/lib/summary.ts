import type { Activity, ActivitySummary, TrainingContext } from "./types";

const metersPerMile = 1609.344;

export function isRun(activity: Activity) {
  const sport = activity.sportType.toLowerCase();
  return sport.includes("run");
}

export function miles(meters?: number) {
  return meters ? meters / metersPerMile : 0;
}

export function buildActivitySummary(activities: Activity[], now = new Date()): ActivitySummary {
  const runs = activities
    .filter(isRun)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const lastRun = runs[0];
  const windowRuns = (days: number) =>
    runs.filter((activity) => daysBetween(new Date(activity.startDate), now) <= days);

  const runs7 = windowRuns(7);
  const runs14 = windowRuns(14);
  const runs28 = windowRuns(28);

  return {
    lastActivityDate: activities[0]?.startDate,
    daysSinceLastRun: lastRun ? Math.floor(daysBetween(new Date(lastRun.startDate), now)) : undefined,
    mileageLast7Days: round1(sumMiles(runs7)),
    mileageLast14Days: round1(sumMiles(runs14)),
    mileageLast28Days: round1(sumMiles(runs28)),
    longestRunLast14DaysMiles: round1(longestRunMiles(runs14)),
    longestRunLast28DaysMiles: round1(longestRunMiles(runs28)),
    recentIntensityIndicators: recentIntensityIndicators(runs14),
    recentMissedDays: estimateRecentMissedDays(runs14, now),
    runCountLast14Days: runs14.length,
    runCountLast28Days: runs28.length
  };
}

export function contextForPrompt(
  activities: Activity[],
  context: TrainingContext,
  question: string
) {
  const summary = buildActivitySummary(activities);
  const recentRuns = activities
    .filter(isRun)
    .slice(0, 12)
    .map((activity) => ({
      date: activity.startDate.slice(0, 10),
      name: activity.name,
      sportType: activity.sportType,
      miles: round1(miles(activity.distanceMeters)),
      movingTimeMinutes: activity.movingTimeSeconds
        ? Math.round(activity.movingTimeSeconds / 60)
        : undefined,
      avgPaceMinPerMile: activity.averagePaceSecondsPerKm
        ? pacePerMile(activity.averagePaceSecondsPerKm)
        : undefined,
      averageHeartRate: activity.averageHeartRate,
      perceivedEffort: activity.perceivedEffort
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary,
    planContext: context.planContext || "Not provided",
    goalsContext: context.goalsContext || "Not provided",
    subjectiveContext: context.subjectiveContext || "Not provided",
    currentQuestion: question,
    recentRuns
  };
}

export function summaryText(summary: ActivitySummary) {
  return [
    `Last activity: ${summary.lastActivityDate ? summary.lastActivityDate.slice(0, 10) : "none"}`,
    `Days since last run: ${summary.daysSinceLastRun ?? "unknown"}`,
    `Mileage: ${summary.mileageLast7Days} mi / 7d, ${summary.mileageLast14Days} mi / 14d, ${summary.mileageLast28Days} mi / 28d`,
    `Longest run: ${summary.longestRunLast14DaysMiles} mi / 14d, ${summary.longestRunLast28DaysMiles} mi / 28d`,
    `Run count: ${summary.runCountLast14Days} / 14d, ${summary.runCountLast28Days} / 28d`,
    `Recent intensity: ${
      summary.recentIntensityIndicators.length
        ? summary.recentIntensityIndicators.join("; ")
        : "No obvious intensity signals in recent Strava data"
    }`
  ].join("\n");
}

function sumMiles(activities: Activity[]) {
  return activities.reduce((total, activity) => total + miles(activity.distanceMeters), 0);
}

function longestRunMiles(activities: Activity[]) {
  return Math.max(0, ...activities.map((activity) => miles(activity.distanceMeters)));
}

function recentIntensityIndicators(activities: Activity[]) {
  const indicators: string[] = [];
  for (const activity of activities.slice(0, 8)) {
    const name = activity.name?.toLowerCase() ?? "";
    const hardName =
      name.includes("tempo") ||
      name.includes("threshold") ||
      name.includes("interval") ||
      name.includes("workout") ||
      name.includes("race");
    const hardEffort = activity.perceivedEffort !== undefined && activity.perceivedEffort >= 7;
    const highHr = activity.averageHeartRate !== undefined && activity.averageHeartRate >= 155;

    if (hardName || hardEffort || highHr) {
      indicators.push(
        `${activity.startDate.slice(0, 10)} ${activity.name ?? activity.sportType}${
          activity.averageHeartRate ? `, avg HR ${Math.round(activity.averageHeartRate)}` : ""
        }${activity.perceivedEffort ? `, effort ${activity.perceivedEffort}/10` : ""}`
      );
    }
  }
  return indicators;
}

function estimateRecentMissedDays(runs14: Activity[], now: Date) {
  const daysWithRuns = new Set(runs14.map((activity) => activity.startDate.slice(0, 10)));
  let missed = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    if (!daysWithRuns.has(date.toISOString().slice(0, 10))) missed += 1;
  }
  return missed;
}

function daysBetween(then: Date, now: Date) {
  return Math.max(0, (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function pacePerMile(secondsPerKm: number) {
  const secondsPerMile = secondsPerKm * 1.609344;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}
