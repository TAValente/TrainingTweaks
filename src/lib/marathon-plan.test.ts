import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStarterMarathonPlan } from "./marathon-plan.ts";

test("builds a deterministic generic marathon plan from mileage inputs", () => {
  const plan = buildStarterMarathonPlan({
    currentMilesPerWeek: 20,
    targetMilesPerWeek: 45,
    durationWeeks: 16,
    riskTolerance: "regular"
  });

  assert.equal(plan.schemaVersion, "1");
  assert.equal(plan.source, "trainingtweaks_generic");
  assert.equal(plan.raceDistance, "marathon");
  assert.equal(plan.durationWeeks, 16);
  assert.equal(plan.weeks.length, 16);
  assert.equal(plan.weeks.at(-1)?.focus, "Race week");
  assert.equal(plan.weeks.at(-1)?.days.at(-1)?.workout.label, "Marathon day");
  assert.equal(plan.generator?.riskBudget.tolerance, "regular");
  assert.equal(plan.generator?.riskCounts.red, 0);
});

test("uses only recovery, workout placeholder, and long-run categories", () => {
  const plan = buildStarterMarathonPlan({
    currentMilesPerWeek: 30,
    targetMilesPerWeek: 50,
    durationWeeks: 18,
    riskTolerance: "high"
  });
  const labels = new Set(plan.weeks.flatMap((week) => week.days.map((day) => day.workout.label)));
  const types = new Set(plan.weeks.flatMap((week) => week.days.map((day) => day.workout.type)));

  assert.deepEqual([...types].sort(), ["long_run", "recovery", "workout"]);
  assert.equal(labels.has("Workout placeholder"), true);
});

test("risk tolerance changes peak mileage and long-run ceiling", () => {
  const low = buildStarterMarathonPlan({
    currentMilesPerWeek: 20,
    targetMilesPerWeek: 55,
    durationWeeks: 16,
    riskTolerance: "low"
  });
  const high = buildStarterMarathonPlan({
    currentMilesPerWeek: 20,
    targetMilesPerWeek: 55,
    durationWeeks: 16,
    riskTolerance: "high"
  });
  const lowPeak = Math.max(...low.weeks.map((week) => week.targetMiles ?? 0));
  const highPeak = Math.max(...high.weeks.map((week) => week.targetMiles ?? 0));
  const lowLongest = Math.max(...low.weeks.flatMap((week) => week.days.map((day) => day.workout.targetMiles ?? 0)));
  const highLongest = Math.max(...high.weeks.flatMap((week) => week.days.map((day) => day.workout.targetMiles ?? 0)));

  assert.ok(highPeak > lowPeak);
  assert.ok(highLongest >= lowLongest);
});

test("low risk schedules only green budgeted planned-risk assessments", () => {
  const plan = buildStarterMarathonPlan({
    currentMilesPerWeek: 20,
    targetMilesPerWeek: 60,
    durationWeeks: 16,
    riskTolerance: "low"
  });

  assert.equal(plan.generator?.riskBudget.allowedYellow, 0);
  assert.equal(plan.generator?.riskBudget.allowedRed, 0);
  assert.equal(plan.generator?.riskCounts.yellow, 0);
  assert.equal(plan.generator?.riskCounts.red, 0);
});

test("regular and high risk keep scheduled findings inside parameterized budgets", () => {
  for (const riskTolerance of ["regular", "high"] as const) {
    const plan = buildStarterMarathonPlan({
      currentMilesPerWeek: 18,
      targetMilesPerWeek: 65,
      durationWeeks: 18,
      riskTolerance
    });

    assert.ok(plan.generator);
    assert.ok(plan.generator.riskCounts.yellow <= plan.generator.riskBudget.allowedYellow);
    assert.ok(plan.generator.riskCounts.red <= plan.generator.riskBudget.allowedRed);
  }
});
