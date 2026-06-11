import type { PlannedWorkoutExposure, StructuredTrainingPlan, TrainingPlanDayOfWeek } from "./types";
import { localTodayIsoDate, planCalendarPosition, type PlanCalendarPositionStatus } from "./plan-calendar.ts";

type StructuredPlanSnapshotStatus = PlanCalendarPositionStatus | "invalid_plan";

export type StructuredPlanSnapshotOptions = {
  localDate?: string;
};

export function structuredPlanSnapshot(plan?: StructuredTrainingPlan, options: StructuredPlanSnapshotOptions = {}) {
  if (!plan) return undefined;
  const calendarPosition = calendarPlanPosition(plan, options);
  const status: StructuredPlanSnapshotStatus = calendarPosition?.status ?? "invalid_plan";
  const currentWeek = clampWeek(calendarPosition?.weekNumber ?? plan.currentWeek ?? 1, plan.durationWeeks);
  const currentDay = calendarPosition?.dayOfWeek ?? plan.currentDay ?? "monday";
  const week = plan.weeks.find((candidate) => candidate.weekNumber === currentWeek);
  const today = status === "in_plan" ? week?.days.find((day) => day.dayOfWeek === currentDay) : undefined;
  const upcoming = upcomingDays(plan, currentWeek, currentDay, 7);

  return {
    status,
    name: plan.name,
    source: plan.source,
    raceDistance: plan.raceDistance,
    startDate: plan.startDate,
    durationWeeks: plan.durationWeeks,
    currentWeek,
    currentDay,
    weekFocus: week?.focus,
    weekTargetMiles: week?.targetMiles,
    plannedToday: today?.workout,
    upcoming7Days: upcoming.map((day) => ({
      weekNumber: day.weekNumber,
      dayOfWeek: day.dayOfWeek,
      workout: day.workout
    })),
    generator: plan.generator
      ? {
          id: plan.generator.id,
          version: plan.generator.version,
          plannedPeakMilesPerWeek: plan.generator.plannedPeakMilesPerWeek,
          inputs: plan.generator.inputs,
          riskBudget: plan.generator.riskBudget,
          riskCounts: plan.generator.riskCounts
        }
      : undefined,
    sourceNotes: plan.sourceNotes
  };
}

export function structuredPlanSummary(plan?: StructuredTrainingPlan) {
  const snapshot = structuredPlanSnapshot(plan);
  if (!snapshot) return "No structured plan imported yet.";
  const plannedToday = snapshot.plannedToday
    ? `${snapshot.plannedToday.label}${snapshot.plannedToday.targetMiles ? `, ${snapshot.plannedToday.targetMiles} mi` : ""}`
    : "No workout found";
  return `${snapshot.name}: week ${snapshot.currentWeek}/${snapshot.durationWeeks}, ${snapshot.currentDay}, today ${plannedToday}.`;
}

export function plannedWorkoutExposureFromSnapshot(
  snapshot?: ReturnType<typeof structuredPlanSnapshot>
): PlannedWorkoutExposure | undefined {
  if (snapshot?.status !== "in_plan") return undefined;
  const workout = snapshot?.plannedToday;
  if (!workout) return undefined;
  return {
    source: plannedExposureSource(snapshot?.source),
    type: workout.type,
    targetMiles: workout.targetMiles,
    durationMinutes: workout.durationMinutes,
    intensity: workout.intensity,
    purpose: workout.purpose,
    confidence: workout.type === "rest" ? "high" : "medium"
  };
}

function upcomingDays(
  plan: StructuredTrainingPlan,
  currentWeek: number,
  currentDay: TrainingPlanDayOfWeek,
  count: number
) {
  const flattened = plan.weeks.flatMap((week) => week.days.map((day) => ({ ...day, weekNumber: week.weekNumber })));
  const start = flattened.findIndex((day) => day.weekNumber === currentWeek && day.dayOfWeek === currentDay);
  if (start < 0) return flattened.slice(0, count);
  return flattened.slice(start, start + count);
}

function clampWeek(value: number, durationWeeks: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(durationWeeks, Math.max(1, Math.round(value)));
}

function calendarPlanPosition(plan: StructuredTrainingPlan, options: StructuredPlanSnapshotOptions) {
  const position = planCalendarPosition(plan.startDate, options.localDate ?? localTodayIsoDate(), plan.durationWeeks);
  if (!position) return undefined;
  return {
    status: position.status,
    weekNumber: clampWeek(position.weekNumber, plan.durationWeeks),
    dayOfWeek: position.dayOfWeek
  };
}

function plannedExposureSource(source: StructuredTrainingPlan["source"] | undefined): PlannedWorkoutExposure["source"] {
  if (source === "trainingtweaks_generic") return "trainingtweaks_generated_plan";
  if (source === "user_import") return "imported_plan";
  if (source === "manual") return "manual_plan";
  return "unknown";
}
