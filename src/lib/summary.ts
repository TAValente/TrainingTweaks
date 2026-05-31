import type { Activity, ActivitySummary, FastestEffortSummary, TrainingContext } from "./types";

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
  const runs42 = windowRuns(42);
  const runs84 = windowRuns(84);
  const runs182 = windowRuns(182);
  const runs730 = windowRuns(730);
  const runs1825 = windowRuns(1825);

  return {
    lastActivityDate: activities[0]?.startDate,
    daysSinceLastRun: lastRun ? Math.floor(daysBetween(new Date(lastRun.startDate), now)) : undefined,
    mileageLast7Days: round1(sumMiles(runs7)),
    mileageLast14Days: round1(sumMiles(runs14)),
    mileageLast28Days: round1(sumMiles(runs28)),
    mileageLast42Days: round1(sumMiles(runs42)),
    mileageLast84Days: round1(sumMiles(runs84)),
    mileageLast182Days: round1(sumMiles(runs182)),
    mileageLast730Days: round1(sumMiles(runs730)),
    mileageLast1825Days: round1(sumMiles(runs1825)),
    longestRunLast14DaysMiles: round1(longestRunMiles(runs14)),
    longestRunLast28DaysMiles: round1(longestRunMiles(runs28)),
    longestRunLast182DaysMiles: round1(longestRunMiles(runs182)),
    longestRunLast730DaysMiles: round1(longestRunMiles(runs730)),
    longestRunLast1825DaysMiles: round1(longestRunMiles(runs1825)),
    recentIntensityIndicators: recentIntensityIndicators(runs14),
    recentMissedDays: estimateRecentMissedDays(runs14, now),
    runCountLast14Days: runs14.length,
    runCountLast28Days: runs28.length,
    runCountLast182Days: runs182.length,
    runCountLast730Days: runs730.length,
    runCountLast1825Days: runs1825.length,
    averageCadenceLast28Days: averageDefined(runs28.map((activity) => activity.averageCadence)),
    averageHeartRateLast28Days: averageDefined(runs28.map((activity) => activity.averageHeartRate)),
    relativeEffortLast28Days: sumDefined(runs28.map((activity) => activity.relativeEffort)),
    fastestEfforts: fastestEfforts(runs, now)
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
      averageCadence: activity.averageCadence,
      relativeEffort: activity.relativeEffort
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
    const highRelativeEffort = activity.relativeEffort !== undefined && activity.relativeEffort >= 80;
    const highHr = activity.averageHeartRate !== undefined && activity.averageHeartRate >= 155;

    if (hardName || hardEffort || highRelativeEffort || highHr) {
      indicators.push(
        `${activity.startDate.slice(0, 10)} ${activity.name ?? activity.sportType}${
          activity.averageHeartRate ? `, avg HR ${Math.round(activity.averageHeartRate)}` : ""
        }${activity.averageCadence ? `, cadence ${Math.round(activity.averageCadence)}` : ""}${
          activity.relativeEffort ? `, relative effort ${activity.relativeEffort}` : ""
        }`
      );
    }
  }
  return indicators;
}

const bestEffortTargets = [
  { label: "400m / quarter mile", meters: 402.336 },
  { label: "800m / half mile", meters: 804.672 },
  { label: "1K", meters: 1000 },
  { label: "1 mile", meters: 1609.344 },
  { label: "2 mile", meters: 3218.688 },
  { label: "5K", meters: 5000 },
  { label: "10K", meters: 10000 },
  { label: "10 mile", meters: 16093.44 },
  { label: "Half marathon", meters: 21097.5 },
  { label: "Marathon", meters: 42195 }
];

const bestEffortPeriods = [
  { label: "6 months" as const, days: 182 },
  { label: "2 years" as const, days: 730 },
  { label: "5 years" as const, days: 1825 }
];

function fastestEfforts(runs: Activity[], now: Date): FastestEffortSummary[] {
  const summaries: FastestEffortSummary[] = [];

  for (const period of bestEffortPeriods) {
    const periodRuns = runs.filter((activity) => daysBetween(new Date(activity.startDate), now) <= period.days);
    for (const target of bestEffortTargets) {
      const best = periodRuns
        .flatMap((activity) =>
          (activity.bestEfforts ?? [])
            .filter((effort) => Math.abs(effort.distanceMeters - target.meters) / target.meters <= 0.08)
            .map((effort) => ({ activity, effort }))
        )
        .filter(({ effort }) => effort.elapsedTimeSeconds || effort.movingTimeSeconds)
        .sort(
          (a, b) =>
            (a.effort.elapsedTimeSeconds ?? a.effort.movingTimeSeconds ?? Infinity) -
            (b.effort.elapsedTimeSeconds ?? b.effort.movingTimeSeconds ?? Infinity)
        )[0];

      if (best) {
        const seconds = best.effort.elapsedTimeSeconds ?? best.effort.movingTimeSeconds ?? 0;
        summaries.push({
          period: period.label,
          distance: target.label,
          seconds,
          paceSecondsPerMile: seconds / (target.meters / metersPerMile),
          activityName: best.activity.name,
          activityDate: best.activity.startDate.slice(0, 10)
        });
      }
    }
  }

  return summaries;
}

function averageDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined);
  if (!defined.length) return undefined;
  return round1(defined.reduce((total, value) => total + value, 0) / defined.length);
}

function sumDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined);
  if (!defined.length) return undefined;
  return round1(defined.reduce((total, value) => total + value, 0));
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
