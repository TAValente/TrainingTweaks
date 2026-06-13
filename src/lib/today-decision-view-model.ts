import type { ActivePlanSnapshot } from "./active-plan-snapshot.ts";
import type {
  ActivitySummary,
  RecommendationFulfillmentTrace,
  RiskConfidence,
  RiskFinding,
  RiskSeverity,
  StructuredTrainingPlan,
  TrainingPlanDayOfWeek,
  TrainingPlanWorkout
} from "./types.ts";

export type TodayDecisionViewModel = {
  headline: string;
  subheadline?: string;
  assignment: {
    title: string;
    distance?: string;
    intensity?: string;
    source: "plan" | "recommendation" | "fallback";
  };
  receipt: {
    primary: string;
    items: Array<{
      label: string;
      value: string;
      tone?: "neutral" | "good" | "caution" | "risk";
    }>;
  };
  rationale: string[];
  weekPath: Array<{
    date: string;
    label: string;
    status: "done" | "today" | "planned" | "unknown";
  }>;
  freshness: string;
  confidence?: "low" | "medium" | "high";
};

export type TodayDecisionViewModelInput = {
  activePlanSnapshot?: ActivePlanSnapshot;
  structuredPlan?: StructuredTrainingPlan;
  summary: ActivitySummary;
  riskFindings?: RiskFinding[];
  latestRecommendation?: RecommendationFulfillmentTrace;
  lastRefreshAt?: string;
  localDate?: string;
};

const dayOrder: TrainingPlanDayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const severityRank: Record<RiskSeverity, number> = {
  info: 0,
  green: 1,
  yellow: 2,
  red: 3
};

export function buildTodayDecisionViewModel(input: TodayDecisionViewModelInput): TodayDecisionViewModel {
  const localDate = input.localDate ?? localTodayIsoDate();
  const plannedToday = input.activePlanSnapshot?.status === "in_plan" ? input.activePlanSnapshot.plannedToday : undefined;
  const recommendation = recommendationAssignment(input.latestRecommendation);
  const assignment = plannedToday ? planAssignment(plannedToday) : recommendation ?? fallbackAssignment(input.activePlanSnapshot);
  const highestRisk = strongestRiskFinding(input.riskFindings ?? []);
  const planStatus = input.activePlanSnapshot?.status ?? "no_plan";
  const confidence = confidenceFromRisk(highestRisk?.confidence);
  const riskTone = toneFromRisk(highestRisk?.severity);
  const buildSummary = buildContextSummary(input.activePlanSnapshot, input.summary);
  const riskSummary = riskContextSummary(highestRisk);
  const primary = receiptPrimary(input.activePlanSnapshot, highestRisk);

  return {
    headline: assignment.title,
    subheadline: subheadlineFor(assignment, input.activePlanSnapshot, highestRisk),
    assignment,
    receipt: {
      primary,
      items: [
        {
          label: "Build",
          value: buildSummary,
          tone: buildSummary.includes("incomplete") ? "caution" : "neutral"
        },
        {
          label: "Risk",
          value: riskSummary,
          tone: riskTone
        },
        {
          label: "Plan",
          value: planContextSummary(input.activePlanSnapshot),
          tone: planStatus === "in_plan" ? "good" : planStatus === "no_plan" ? "caution" : "neutral"
        }
      ]
    },
    rationale: rationaleFor(input.activePlanSnapshot, input.summary, highestRisk, assignment.source),
    weekPath: weekPathFor(input.structuredPlan, input.activePlanSnapshot, localDate),
    freshness: freshnessLabel(input.lastRefreshAt),
    confidence
  };
}

function planAssignment(plannedToday: NonNullable<ActivePlanSnapshot["plannedToday"]>): TodayDecisionViewModel["assignment"] {
  return {
    title: plannedToday.targetMiles ? `${formatMiles(plannedToday.targetMiles)} ${workoutTitle(plannedToday)}` : plannedToday.label,
    distance: plannedToday.targetMiles ? formatMiles(plannedToday.targetMiles) : undefined,
    intensity: plannedToday.intensity,
    source: "plan"
  };
}

function recommendationAssignment(trace: RecommendationFulfillmentTrace | undefined): TodayDecisionViewModel["assignment"] | undefined {
  if (!trace?.recommendedActionSummary?.trim()) return undefined;
  return {
    title: trace.recommendedActionSummary.trim(),
    distance: trace.expectedExposure?.targetMiles ? formatMiles(trace.expectedExposure.targetMiles) : undefined,
    intensity: trace.expectedExposure?.intensity,
    source: "recommendation"
  };
}

function fallbackAssignment(snapshot: ActivePlanSnapshot | undefined): TodayDecisionViewModel["assignment"] {
  if (snapshot?.status === "before_plan") {
    return {
      title: "Plan has not started yet",
      source: "fallback"
    };
  }
  if (snapshot?.status === "after_plan") {
    return {
      title: "Plan has ended",
      source: "fallback"
    };
  }
  if (snapshot?.status === "invalid_plan") {
    return {
      title: "Plan needs review",
      source: "fallback"
    };
  }
  return {
    title: "No active plan today",
    source: "fallback"
  };
}

function subheadlineFor(
  assignment: TodayDecisionViewModel["assignment"],
  snapshot: ActivePlanSnapshot | undefined,
  strongestRisk: RiskFinding | undefined
) {
  if (assignment.source === "plan") {
    if (strongestRisk?.severity === "red") return "Plan says this, but risk context has a high-priority watch item.";
    if (strongestRisk?.severity === "yellow") return "Plan says this; current signals ask for care.";
    return "Plan says this. Current signals do not strongly argue against it.";
  }
  if (assignment.source === "recommendation") return "Using the latest recorded recommendation context.";
  return snapshot?.deviation.message ?? "Add or accept a plan to make today's assignment more specific.";
}

function receiptPrimary(snapshot: ActivePlanSnapshot | undefined, strongestRisk: RiskFinding | undefined) {
  const build = snapshot?.deviation.status === "on_track" ? "steady" : snapshot?.deviation.status ?? "unclear";
  const risk = strongestRisk?.severity === "red" ? "high" : strongestRisk?.severity === "yellow" ? "watch" : strongestRisk ? "readable" : "incomplete";
  return `Build: ${build} / Risk: ${risk}`;
}

function buildContextSummary(snapshot: ActivePlanSnapshot | undefined, summary: ActivitySummary) {
  if (snapshot?.currentPlanWeek) {
    const completed = snapshot.observed?.completedMilesThisPlanWeek ?? 0;
    return `${formatMiles(completed)} / ${formatMiles(snapshot.currentPlanWeek.plannedMilesThroughToday)} through today`;
  }
  if (summary.mileageLast7Days > 0) return `${formatMiles(summary.mileageLast7Days)} in the last 7 days`;
  return "build context incomplete";
}

function riskContextSummary(finding: RiskFinding | undefined) {
  if (!finding) return "Risk context is incomplete";
  if (finding.severity === "red") return `${finding.title}: high watch`;
  if (finding.severity === "yellow") return `${finding.title}: watch`;
  if (finding.severity === "green") return "Recent load looks manageable";
  return finding.title;
}

function planContextSummary(snapshot: ActivePlanSnapshot | undefined) {
  if (!snapshot) return "No plan snapshot";
  if (snapshot.status === "in_plan" && snapshot.currentPlanWeek) {
    return `Week ${snapshot.currentPlanWeek.weekNumber}${snapshot.planDurationWeeks ? `/${snapshot.planDurationWeeks}` : ""}`;
  }
  return snapshot.deviation.message;
}

function rationaleFor(
  snapshot: ActivePlanSnapshot | undefined,
  summary: ActivitySummary,
  strongestRisk: RiskFinding | undefined,
  assignmentSource: TodayDecisionViewModel["assignment"]["source"]
) {
  const rationale: string[] = [];
  if (assignmentSource === "plan" && snapshot?.plannedToday) {
    rationale.push(`Plan says ${snapshot.plannedToday.targetMiles ? formatMiles(snapshot.plannedToday.targetMiles) : snapshot.plannedToday.label}.`);
    rationale.push(snapshot.plannedToday.purpose);
  } else if (assignmentSource === "recommendation") {
    rationale.push("This comes from the latest recorded recommendation rather than a new model call.");
  } else {
    rationale.push(snapshot?.deviation.message ?? "No accepted active plan is available.");
  }

  if (snapshot?.deviation.message) rationale.push(snapshot.deviation.message);
  if (strongestRisk) {
    rationale.push(safeRiskMessage(strongestRisk));
  } else {
    rationale.push("Risk context is incomplete, so the view avoids stronger certainty.");
  }
  if (summary.daysSinceLastRun !== undefined) rationale.push(`Last run context: ${summary.daysSinceLastRun} day${summary.daysSinceLastRun === 1 ? "" : "s"} since a run.`);
  return unique(rationale).slice(0, 4);
}

function weekPathFor(
  plan: StructuredTrainingPlan | undefined,
  snapshot: ActivePlanSnapshot | undefined,
  localDate: string
): TodayDecisionViewModel["weekPath"] {
  if (!plan?.startDate || !plan.weeks.length || snapshot?.status !== "in_plan" || !snapshot.planWeekNumber || !snapshot.dayOfWeek) {
    return fallbackWeekPath(localDate);
  }

  const week = plan.weeks.find((candidate) => candidate.weekNumber === snapshot.planWeekNumber);
  if (!week) return fallbackWeekPath(localDate);

  const todayIndex = dayOrder.indexOf(snapshot.dayOfWeek);
  const weekStart = addIsoDays(plan.startDate, (snapshot.planWeekNumber - 1) * 7);
  if (!weekStart) return fallbackWeekPath(localDate);

  return dayOrder.map((dayOfWeek, index) => {
    const workout = week.days.find((day) => day.dayOfWeek === dayOfWeek)?.workout;
    return {
      date: addIsoDays(weekStart, index) ?? localDate,
      label: weekPathLabel(workout),
      status: index < todayIndex ? "done" : index === todayIndex ? "today" : "planned"
    };
  });
}

function fallbackWeekPath(localDate: string): TodayDecisionViewModel["weekPath"] {
  return [
    {
      date: localDate,
      label: "Today",
      status: "today"
    }
  ];
}

function weekPathLabel(workout: TrainingPlanWorkout | undefined) {
  if (!workout) return "Rest";
  if (workout.targetMiles) return `${formatCompactMiles(workout.targetMiles)} ${shortWorkoutType(workout.type)}`;
  return workout.label;
}

function shortWorkoutType(type: TrainingPlanWorkout["type"]) {
  if (type === "long_run") return "long";
  if (type === "cross_training") return "cross";
  return type.replace("_", " ");
}

function workoutTitle(workout: NonNullable<ActivePlanSnapshot["plannedToday"]>) {
  if (workout.type === "easy") return "easy miles";
  if (workout.type === "recovery") return "recovery miles";
  if (workout.type === "long_run") return "long run";
  if (workout.type === "rest") return "rest";
  return workout.label;
}

function strongestRiskFinding(findings: RiskFinding[]) {
  return findings
    .filter((finding) => finding.category !== "data_quality")
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];
}

function safeRiskMessage(finding: RiskFinding) {
  if (finding.severity === "red") return `${finding.message} Treat this as a risk signal, not a full diagnosis.`;
  if (finding.severity === "yellow") return finding.message;
  if (finding.severity === "green") return "Recent load looks manageable.";
  return finding.message;
}

function toneFromRisk(severity: RiskSeverity | undefined): "neutral" | "good" | "caution" | "risk" {
  if (severity === "red") return "risk";
  if (severity === "yellow") return "caution";
  if (severity === "green") return "good";
  return "caution";
}

function confidenceFromRisk(confidence: RiskConfidence | undefined): TodayDecisionViewModel["confidence"] {
  if (confidence === "high" || confidence === "medium" || confidence === "low") return confidence;
  return undefined;
}

function freshnessLabel(lastRefreshAt: string | undefined) {
  if (!lastRefreshAt) return "No refresh yet";
  const date = new Date(lastRefreshAt);
  if (Number.isNaN(date.getTime())) return "Refresh time unavailable";
  return `Fresh ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function formatMiles(value: number) {
  return `${round1(value)} mi`;
}

function formatCompactMiles(value: number) {
  return `${round1(value)}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function localTodayIsoDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addIsoDays(value: string, days: number) {
  const date = parseIsoDate(value);
  if (!date) return undefined;
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function parseIsoDate(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
