import assert from "node:assert/strict";
import { test } from "node:test";
import { activePlanGuidanceForPrompt } from "./plan-aware-prompt.ts";
import type { ActivePlanSnapshot } from "./active-plan-snapshot.ts";

test("easy plannedToday guidance treats the planned workout as the default", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: snapshotFixture({
      plannedToday: plannedWorkout("easy", "Easy 5", 5),
      deviationStatus: "on_track"
    })
  });

  assert.match(guidance, /accepted active plan as the default anchor/i);
  assert.match(guidance, /Treat plannedToday as the starting point/i);
  assert.match(guidance, /on_track: preserve the planned workout/i);
});

test("rest plannedToday guidance treats rest as a real plan recommendation", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: snapshotFixture({
      plannedToday: plannedWorkout("rest", "Rest", undefined)
    })
  });

  assert.match(guidance, /rest is a real planned workout recommendation/i);
  assert.match(guidance, /not missing plan data/i);
});

test("ahead deviation guidance cautions against adding mileage or intensity", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: snapshotFixture({ deviationStatus: "ahead" })
  });

  assert.match(guidance, /ahead: be cautious about adding mileage or intensity/i);
});

test("behind deviation guidance cautions against aggressive catch-up mileage", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: snapshotFixture({ deviationStatus: "behind" })
  });

  assert.match(guidance, /behind: do not automatically prescribe catch-up mileage/i);
  assert.match(guidance, /preserve the plan structure/i);
});

test("prompt guidance explicitly rejects a rigid visible template", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: snapshotFixture()
  });

  assert.match(guidance, /conversational and direct/i);
  assert.match(guidance, /Do not use a rigid visible template/i);
  assert.match(guidance, /Planned workout \/ Current status \/ Recommendation \/ Why/);
});

function snapshotFixture(options: {
  plannedToday?: ActivePlanSnapshot["plannedToday"];
  deviationStatus?: ActivePlanSnapshot["deviation"]["status"];
} = {}): ActivePlanSnapshot {
  const deviationStatus = options.deviationStatus ?? "on_track";
  return {
    status: "in_plan",
    planName: "Plan-aware fixture",
    planStartDate: "2026-06-15",
    planWeekNumber: 2,
    planDurationWeeks: 12,
    dayOfWeek: "wednesday",
    plannedToday: options.plannedToday ?? plannedWorkout("easy", "Easy 5", 5),
    currentPlanWeek: {
      weekNumber: 2,
      focus: "Build",
      targetMiles: 30,
      longRunMiles: 10,
      plannedMilesThroughToday: 12
    },
    observed: {
      completedMilesThisPlanWeek: 12,
      completedMilesLast7Days: 28,
      completedLongRunThisPlanWeek: 8
    },
    deviation: {
      status: deviationStatus,
      message: `Fixture is ${deviationStatus}.`
    }
  };
}

function plannedWorkout(
  type: NonNullable<ActivePlanSnapshot["plannedToday"]>["type"],
  label: string,
  targetMiles: number | undefined
): NonNullable<ActivePlanSnapshot["plannedToday"]> {
  return {
    dayOfWeek: "wednesday",
    type,
    label,
    targetMiles,
    intensity: type === "rest" ? "off" : "easy",
    purpose: type === "rest" ? "Recovery" : "Aerobic support"
  };
}
