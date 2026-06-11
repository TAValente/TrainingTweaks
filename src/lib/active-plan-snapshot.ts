import type { Activity, StructuredTrainingPlan, TrainingPlanDayOfWeek, TrainingPlanWorkout } from "./types";
import { addIsoDateDays, isoDateOrdinal, localTodayIsoDate, planCalendarPosition } from "./plan-calendar.ts";

export type ActivePlanSnapshotStatus = "no_plan" | "before_plan" | "in_plan" | "after_plan" | "invalid_plan";
export type ActivePlanDeviationStatus = "on_track" | "ahead" | "behind" | "unknown";

export type ActivePlanSnapshot = {
  status: ActivePlanSnapshotStatus;
  planName?: string;
  planStartDate?: string;
  planWeekNumber?: number;
  planDurationWeeks?: number;
  dayOfWeek?: TrainingPlanDayOfWeek;
  plannedToday?: {
    dayOfWeek: TrainingPlanDayOfWeek;
    type: TrainingPlanWorkout["type"];
    label: string;
    targetMiles?: number;
    intensity: TrainingPlanWorkout["intensity"];
    purpose: string;
  };
  currentPlanWeek?: {
    weekNumber: number;
    focus: string;
    targetMiles?: number;
    longRunMiles: number;
    plannedMilesThroughToday: number;
  };
  observed?: {
    completedMilesThisPlanWeek: number;
    completedMilesLast7Days?: number;
    completedLongRunThisPlanWeek: number;
  };
  deviation: {
    status: ActivePlanDeviationStatus;
    message: string;
    ratio?: number;
    deltaMiles?: number;
  };
};

export type ActivePlanSnapshotOptions = {
  localDate?: string;
  completedMilesLast7Days?: number;
};

const activePlanSnapshotConfig = {
  onTrackToleranceRatio: 0.2
};

const dayOrder: TrainingPlanDayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const metersPerMile = 1609.344;

export function buildActivePlanSnapshot(
  plan: StructuredTrainingPlan | undefined,
  activities: Activity[],
  options: ActivePlanSnapshotOptions = {}
): ActivePlanSnapshot {
  if (!plan) {
    return {
      status: "no_plan",
      deviation: {
        status: "unknown",
        message: "No active structured plan is accepted."
      }
    };
  }

  const todayIso = options.localDate ?? localTodayIsoDate();
  const position = planCalendarPosition(plan.startDate, todayIso, plan.durationWeeks);
  if (!position || !plan.startDate || !plan.weeks.length) {
    return basePlanSnapshot(plan, "invalid_plan", "Active plan has an invalid start date or duration.");
  }

  if (position.status === "before_plan") {
    return basePlanSnapshot(plan, "before_plan", "Active plan has not started yet.", dayOrder[0]);
  }
  if (position.status === "after_plan") {
    return basePlanSnapshot(plan, "after_plan", "Active plan has ended.", dayOrder[6]);
  }

  const planWeekNumber = position.weekNumber;
  const dayOfWeek = position.dayOfWeek;
  const week = plan.weeks.find((candidate) => candidate.weekNumber === planWeekNumber);
  if (!week) {
    return basePlanSnapshot(plan, "invalid_plan", "Active plan is missing the current week.", dayOfWeek);
  }

  const plannedToday = workoutForDay(week, dayOfWeek);
  const weekStartIso = addIsoDateDays(plan.startDate, (planWeekNumber - 1) * 7);
  const weekStartOrdinal = isoDateOrdinal(weekStartIso);
  const todayOrdinal = isoDateOrdinal(todayIso);
  const weekRuns = activities
    .filter(isRun)
    .filter((activity) => {
      const activityOrdinal = isoDateOrdinal(activity.startDate.slice(0, 10));
      return (
        activityOrdinal !== undefined &&
        weekStartOrdinal !== undefined &&
        todayOrdinal !== undefined &&
        activityOrdinal >= weekStartOrdinal &&
        activityOrdinal <= todayOrdinal
      );
    });
  const completedMilesThisPlanWeek = round1(weekRuns.reduce((total, activity) => total + miles(activity.distanceMeters), 0));
  const completedLongRunThisPlanWeek = round1(Math.max(0, ...weekRuns.map((activity) => miles(activity.distanceMeters))));
  const plannedMilesThroughToday = plannedMilesThroughDay(week, dayOfWeek);

  return {
    status: "in_plan",
    planName: plan.name,
    planStartDate: plan.startDate,
    planWeekNumber,
    planDurationWeeks: plan.durationWeeks,
    dayOfWeek,
    plannedToday,
    currentPlanWeek: {
      weekNumber: week.weekNumber,
      focus: week.focus,
      targetMiles: week.targetMiles,
      longRunMiles: longRunMiles(week),
      plannedMilesThroughToday
    },
    observed: {
      completedMilesThisPlanWeek,
      completedMilesLast7Days: options.completedMilesLast7Days,
      completedLongRunThisPlanWeek
    },
    deviation: deviationForMileage(completedMilesThisPlanWeek, plannedMilesThroughToday)
  };
}

function basePlanSnapshot(
  plan: StructuredTrainingPlan,
  status: Exclude<ActivePlanSnapshotStatus, "no_plan" | "in_plan">,
  message: string,
  dayOfWeek?: TrainingPlanDayOfWeek
): ActivePlanSnapshot {
  return {
    status,
    planName: plan.name,
    planStartDate: plan.startDate,
    planDurationWeeks: plan.durationWeeks,
    dayOfWeek,
    deviation: {
      status: "unknown",
      message
    }
  };
}

function workoutForDay(week: StructuredTrainingPlan["weeks"][number], dayOfWeek: TrainingPlanDayOfWeek) {
  const workout = week.days.find((day) => day.dayOfWeek === dayOfWeek)?.workout ?? {
    type: "rest" as const,
    label: "Rest",
    intensity: "off" as const,
    purpose: "No run scheduled"
  };
  return {
    dayOfWeek,
    type: workout.type,
    label: workout.label,
    targetMiles: workout.targetMiles,
    intensity: workout.intensity,
    purpose: workout.purpose
  };
}

function plannedMilesThroughDay(week: StructuredTrainingPlan["weeks"][number], dayOfWeek: TrainingPlanDayOfWeek) {
  const dayIndex = dayOrder.indexOf(dayOfWeek);
  return round1(
    week.days
      .filter((day) => dayOrder.indexOf(day.dayOfWeek) <= dayIndex)
      .reduce((total, day) => total + (day.workout.targetMiles ?? 0), 0)
  );
}

function longRunMiles(week: StructuredTrainingPlan["weeks"][number]) {
  return round1(Math.max(0, ...week.days.filter((day) => day.workout.type === "long_run").map((day) => day.workout.targetMiles ?? 0)));
}

function deviationForMileage(completedMiles: number, plannedMiles: number): ActivePlanSnapshot["deviation"] {
  if (plannedMiles <= 0) {
    return {
      status: "unknown",
      message: "No planned mileage through today.",
      deltaMiles: round1(completedMiles)
    };
  }

  const deltaMiles = round1(completedMiles - plannedMiles);
  const ratio = round2(completedMiles / plannedMiles);
  const tolerance = activePlanSnapshotConfig.onTrackToleranceRatio;
  if (ratio > 1 + tolerance) {
    return {
      status: "ahead",
      message: `${formatMiles(Math.abs(deltaMiles))} ahead of planned mileage through today.`,
      ratio,
      deltaMiles
    };
  }
  if (ratio < 1 - tolerance) {
    return {
      status: "behind",
      message: `${formatMiles(Math.abs(deltaMiles))} behind planned mileage through today.`,
      ratio,
      deltaMiles
    };
  }
  return {
    status: "on_track",
    message: "Completed mileage is close to planned mileage through today.",
    ratio,
    deltaMiles
  };
}

function isRun(activity: Activity) {
  return activity.sportType.toLowerCase().includes("run");
}

function miles(meters?: number) {
  return meters ? meters / metersPerMile : 0;
}

function formatMiles(value: number) {
  return `${round1(value)} mi`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
