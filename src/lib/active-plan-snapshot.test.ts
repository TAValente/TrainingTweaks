import assert from "node:assert/strict";
import { test } from "node:test";
import { buildActivePlanSnapshot } from "./active-plan-snapshot.ts";
import { previewGeneratedPlan, activePlanForContext } from "./plan-preview.ts";
import { contextForPrompt } from "./summary.ts";
import type { Activity, StructuredTrainingPlan } from "./types.ts";

const metersPerMile = 1609.344;

test("no active plan returns no_plan", () => {
  const snapshot = buildActivePlanSnapshot(undefined, [], { localDate: "2026-06-16" });

  assert.equal(snapshot.status, "no_plan");
  assert.equal(snapshot.deviation.status, "unknown");
});

test("date before plan start returns before_plan", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [], { localDate: "2026-06-14" });

  assert.equal(snapshot.status, "before_plan");
  assert.equal(snapshot.planName, "Snapshot fixture");
});

test("date inside plan returns correct week and exact plannedToday", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [], { localDate: "2026-06-24" });

  assert.equal(snapshot.status, "in_plan");
  assert.equal(snapshot.planWeekNumber, 2);
  assert.equal(snapshot.dayOfWeek, "wednesday");
  assert.equal(snapshot.plannedToday?.type, "workout");
  assert.equal(snapshot.plannedToday?.label, "Tempo");
  assert.equal(snapshot.plannedToday?.targetMiles, 6);
  assert.equal(snapshot.currentPlanWeek?.plannedMilesThroughToday, 10);
});

test("rest day appears explicitly as plannedToday", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [], { localDate: "2026-06-23" });

  assert.equal(snapshot.status, "in_plan");
  assert.equal(snapshot.dayOfWeek, "tuesday");
  assert.equal(snapshot.plannedToday?.type, "rest");
  assert.equal(snapshot.plannedToday?.label, "Rest");
});

test("completed mileage roughly equal to planned-to-date returns on_track", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [run("2026-06-22", 4), run("2026-06-24", 6)], {
    localDate: "2026-06-24"
  });

  assert.equal(snapshot.deviation.status, "on_track");
  assert.equal(snapshot.observed?.completedMilesThisPlanWeek, 10);
});

test("meaningfully over planned-to-date returns ahead", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [run("2026-06-22", 8), run("2026-06-24", 8)], {
    localDate: "2026-06-24"
  });

  assert.equal(snapshot.deviation.status, "ahead");
  assert.equal(snapshot.deviation.deltaMiles, 6);
});

test("meaningfully under planned-to-date returns behind", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [run("2026-06-22", 4)], {
    localDate: "2026-06-24"
  });

  assert.equal(snapshot.deviation.status, "behind");
  assert.equal(snapshot.deviation.deltaMiles, -6);
});

test("after plan returns after_plan", () => {
  const snapshot = buildActivePlanSnapshot(planFixture(), [], { localDate: "2026-07-07" });

  assert.equal(snapshot.status, "after_plan");
});

test("invalid dates return invalid_plan", () => {
  const plan = { ...planFixture(), startDate: "bad-date" };
  const snapshot = buildActivePlanSnapshot(plan, [], { localDate: "2026-06-16" });

  assert.equal(snapshot.status, "invalid_plan");
});

test("snapshot uses accepted active plan only and ignores preview plan", () => {
  const active = planFixture("active-plan", "Active plan", "2026-06-15");
  const preview = planFixture("preview-plan", "Preview plan", "2026-07-20");
  const state = previewGeneratedPlan({ activeStructuredPlan: active }, preview);

  const snapshot = buildActivePlanSnapshot(activePlanForContext(state), [], { localDate: "2026-06-24" });

  assert.equal(snapshot.planName, "Active plan");
  assert.equal(snapshot.planStartDate, "2026-06-15");
  assert.equal(snapshot.planWeekNumber, 2);
});

test("chat context payload includes snapshot from accepted structuredPlan", () => {
  const runningContext = contextForPrompt([run("2026-06-22", 4), run("2026-06-24", 6)], {
    structuredPlan: planFixture(),
    goalsContext: "Race healthy"
  }, "What should I run today?", new Date("2026-06-24T12:00:00Z"));

  assert.equal(runningContext.activePlanSnapshot.status, "in_plan");
  assert.equal(runningContext.activePlanSnapshot.plannedToday?.label, "Tempo");
  assert.equal(runningContext.activePlanSnapshot.deviation.status, "on_track");
});

test("snapshot does not mutate the plan", () => {
  const plan = planFixture();
  const before = JSON.stringify(plan);

  buildActivePlanSnapshot(plan, [run("2026-06-22", 4)], { localDate: "2026-06-24" });

  assert.equal(JSON.stringify(plan), before);
});

function planFixture(id = "snapshot-fixture", name = "Snapshot fixture", startDate = "2026-06-15"): StructuredTrainingPlan {
  return {
    schemaVersion: "1",
    id,
    name,
    source: "trainingtweaks_generic",
    raceDistance: "half_marathon",
    startDate,
    durationWeeks: 3,
    weeks: [
      {
        weekNumber: 1,
        focus: "Base",
        targetMiles: 20,
        days: [
          plannedDay("monday", "easy", "Easy run", 4),
          plannedDay("wednesday", "workout", "Controlled quality", 5),
          plannedDay("sunday", "long_run", "Long run", 8)
        ]
      },
      {
        weekNumber: 2,
        focus: "Build",
        targetMiles: 24,
        days: [
          plannedDay("monday", "easy", "Easy run", 4),
          plannedDay("tuesday", "rest", "Rest"),
          plannedDay("wednesday", "workout", "Tempo", 6),
          plannedDay("friday", "easy", "Easy run", 4),
          plannedDay("sunday", "long_run", "Long run", 10)
        ]
      },
      {
        weekNumber: 3,
        focus: "Build",
        targetMiles: 26,
        days: [
          plannedDay("monday", "easy", "Easy run", 5),
          plannedDay("wednesday", "workout", "Tempo", 6),
          plannedDay("sunday", "long_run", "Long run", 11)
        ]
      }
    ]
  };
}

function plannedDay(
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "friday" | "sunday",
  type: "easy" | "workout" | "long_run" | "rest",
  label: string,
  targetMiles?: number
): StructuredTrainingPlan["weeks"][number]["days"][number] {
  return {
    dayOfWeek,
    workout: {
      type,
      label,
      targetMiles,
      intensity: type === "rest" ? "off" : type === "workout" ? "moderate" : "easy",
      purpose: type === "rest" ? "Absorb training" : "Training"
    }
  };
}

function run(date: string, miles: number): Activity {
  return {
    provider: "strava",
    providerActivityId: `${date}-${miles}`,
    sportType: "Run",
    startDate: `${date}T12:00:00Z`,
    distanceMeters: miles * metersPerMile,
    movingTimeSeconds: miles * 9 * 60
  };
}
