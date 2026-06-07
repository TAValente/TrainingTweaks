import type { StructuredTrainingPlan, TrainingPlanDayOfWeek } from "./types";

export function structuredPlanSnapshot(plan?: StructuredTrainingPlan) {
  if (!plan) return undefined;
  const calendarPosition = calendarPlanPosition(plan);
  const currentWeek = clampWeek(calendarPosition?.weekNumber ?? plan.currentWeek ?? 1, plan.durationWeeks);
  const currentDay = calendarPosition?.dayOfWeek ?? plan.currentDay ?? "monday";
  const week = plan.weeks.find((candidate) => candidate.weekNumber === currentWeek);
  const today = week?.days.find((day) => day.dayOfWeek === currentDay);
  const upcoming = upcomingDays(plan, currentWeek, currentDay, 7);

  return {
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

function calendarPlanPosition(plan: StructuredTrainingPlan) {
  if (!plan.startDate) return undefined;
  const start = parseIsoDate(plan.startDate);
  if (!start) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deltaDays = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (deltaDays < 0) return { weekNumber: 1, dayOfWeek: "monday" as TrainingPlanDayOfWeek };
  return {
    weekNumber: clampWeek(Math.floor(deltaDays / 7) + 1, plan.durationWeeks),
    dayOfWeek: dayOfWeekFromIndex(deltaDays % 7)
  };
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayOfWeekFromIndex(index: number): TrainingPlanDayOfWeek {
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][index] as TrainingPlanDayOfWeek;
}
