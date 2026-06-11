import type { StructuredTrainingPlan } from "./types";

export type PlanPreviewState = {
  activeStructuredPlan?: StructuredTrainingPlan;
  previewStructuredPlan?: StructuredTrainingPlan;
};

export function previewGeneratedPlan(state: PlanPreviewState, previewStructuredPlan: StructuredTrainingPlan): PlanPreviewState {
  return {
    ...state,
    previewStructuredPlan
  };
}

export function acceptPreviewPlan(state: PlanPreviewState): PlanPreviewState {
  if (!state.previewStructuredPlan) return state;
  return {
    activeStructuredPlan: state.previewStructuredPlan
  };
}

export function discardPreviewPlan(state: PlanPreviewState): PlanPreviewState {
  return {
    ...state,
    previewStructuredPlan: undefined
  };
}

export function activePlanForContext(state: PlanPreviewState) {
  return state.activeStructuredPlan;
}

export function peakLongRunMiles(plan: StructuredTrainingPlan) {
  return Math.max(0, ...plan.weeks.map((week) => Math.max(0, ...week.days.map((day) => day.workout.targetMiles ?? 0))));
}

export function weeklyPreviewRows(plan: StructuredTrainingPlan) {
  return plan.weeks.map((week) => {
    const longRunMiles = Math.max(
      0,
      ...week.days.filter((day) => day.workout.type === "long_run").map((day) => day.workout.targetMiles ?? 0)
    );
    const workout = week.days.find((day) => day.workout.type === "workout" || day.workout.type === "easy");
    const assessmentSeverities = (plan.generator?.riskAssessments ?? [])
      .filter((assessment) => assessment.weekNumber === week.weekNumber)
      .map((assessment) => assessment.severity);
    return {
      weekNumber: week.weekNumber,
      focus: week.focus,
      targetMiles: week.targetMiles ?? 0,
      longRunMiles,
      workoutLabel: workout?.workout.label,
      severity: strongestSeverity(assessmentSeverities)
    };
  });
}

function strongestSeverity(severities: Array<"green" | "yellow" | "red">) {
  if (severities.includes("red")) return "red";
  if (severities.includes("yellow")) return "yellow";
  if (severities.includes("green")) return "green";
  return "green";
}
