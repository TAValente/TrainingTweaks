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

test("before_plan guidance says plan has not started and does not use plannedToday as the starting point", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: nonInPlanSnapshot("before_plan", "Active plan has not started yet.")
  });

  assert.match(guidance, /has not started yet/i);
  assert.match(guidance, /future context/i);
  assert.match(guidance, /Do not treat plannedToday as today's recommendation/i);
  assert.doesNotMatch(guidance, /Treat plannedToday as the starting point/i);
  assert.match(guidance, /Do not use a rigid visible template/i);
});

test("after_plan guidance says plan has ended and does not anchor recommendation to it", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: nonInPlanSnapshot("after_plan", "Active plan has ended.")
  });

  assert.match(guidance, /has ended/i);
  assert.match(guidance, /Do not anchor today's recommendation to the ended plan/i);
  assert.doesNotMatch(guidance, /Treat plannedToday as the starting point/i);
  assert.match(guidance, /Do not use a rigid visible template/i);
});

test("invalid_plan guidance says plan is unusable and does not anchor recommendation to it", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: nonInPlanSnapshot("invalid_plan", "Active plan has an invalid start date or duration.")
  });

  assert.match(guidance, /unusable/i);
  assert.match(guidance, /invalid/i);
  assert.match(guidance, /Do not anchor today's recommendation to the invalid plan/i);
  assert.doesNotMatch(guidance, /Treat plannedToday as the starting point/i);
  assert.match(guidance, /Do not use a rigid visible template/i);
});

test("no_plan guidance remains explicit without planned mileage", () => {
  const guidance = activePlanGuidanceForPrompt({
    activePlanSnapshot: {
      status: "no_plan",
      deviation: {
        status: "unknown",
        message: "No active structured plan is accepted."
      }
    }
  });

  assert.match(guidance, /No accepted active plan is available/i);
  assert.match(guidance, /Do not invent planned mileage/i);
  assert.doesNotMatch(guidance, /Treat plannedToday as the starting point/i);
  assert.match(guidance, /Do not use a rigid visible template/i);
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

function nonInPlanSnapshot(
  status: Exclude<ActivePlanSnapshot["status"], "in_plan" | "no_plan">,
  message: string
): ActivePlanSnapshot {
  return {
    status,
    planName: "Plan-aware fixture",
    planStartDate: "2026-06-15",
    planDurationWeeks: 12,
    deviation: {
      status: "unknown",
      message
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
