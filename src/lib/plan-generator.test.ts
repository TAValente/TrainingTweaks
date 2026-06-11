import assert from "node:assert/strict";
import { test } from "node:test";
import { derivePlanBaseline, generateTrainingPlan } from "./plan-generator.ts";
import type { Activity, StructuredTrainingPlan } from "./types.ts";

const asOfDate = new Date("2026-06-10T12:00:00Z");
const metersPerMile = 1609.344;

test("base builder creates a sane build and cutback pattern", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18, 18, 18, 18, 18, 18]),
    goalType: "base_builder",
    startDate: "2026-06-15",
    horizonWeeks: 8,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 30,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  const plan = result.plan;
  assert.equal(plan.raceDistance, undefined);
  assert.equal(plan.generator?.status, "compromised");
  assert.match(result.warnings.join(" "), /8 week timeline is shorter than the 9 weeks/i);
  assert.deepEqual(plan.weeks.slice(0, 5).map((week) => week.targetMiles), [18, 20, 22, 17, 24]);
  assert.equal(plan.weeks[0].days.length, 4);
  assert.ok(longRuns(plan).every((longRun) => longRun >= 5));
});

test("half marathon reaches a credible peak long run", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([20, 20, 20, 20, 20, 20], 7),
    goalType: "half_marathon",
    startDate: "2026-06-15",
    horizonWeeks: 14,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 32,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.raceDistance, "half_marathon");
  assert.ok(preRacePeakLongRun(result.plan) >= 9);
  assert.equal(result.plan.generator?.status, "feasible");
});

test("marathon from 30 MPW to 40 MPW is feasible with enough timeline", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([30, 30, 30, 30, 30, 30], 10),
    goalType: "marathon",
    startDate: "2026-06-15",
    horizonWeeks: 24,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 40,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.raceDistance, "marathon");
  assert.equal(result.plan.generator?.status, "feasible");
  assert.ok((result.plan.generator?.plannedPeakMilesPerWeek ?? 0) >= 40);
  assert.ok(preRacePeakLongRun(result.plan) >= 16);
});

test("math-driven duration accounts for inserted cutback weeks", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18, 18, 18, 18, 18, 18], 6),
    goalType: "base_builder",
    startDate: "2026-06-15",
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 34,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.generator?.status, "feasible");
  assert.equal(result.plan.generator?.inputs.requestedHorizonWeeks, undefined);
  assert.ok((result.plan.generator?.inputs.actualHorizonWeeks ?? 0) > 8);
  assert.ok((result.plan.generator?.plannedPeakMilesPerWeek ?? 0) >= 34);
  assert.ok(result.plan.weeks.some((week) => week.focus === "Cutback and consolidate"));
});

test("marathon with enough timeline reaches preferred long-run target when feasible", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([30, 30, 30, 30, 30, 30], 10),
    goalType: "marathon",
    startDate: "2026-06-15",
    horizonWeeks: 24,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 40,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.ok(preRacePeakLongRun(result.plan) >= 18);
});

test("short marathon timeline generates reachable lower peak and warns", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([0, 0, 12, 12, 12, 12], 5),
    goalType: "marathon",
    startDate: "2026-06-15",
    horizonWeeks: 10,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 40,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.generator?.status, "not_recommended");
  assert.ok((result.plan.generator?.plannedPeakMilesPerWeek ?? 40) < 40);
  assert.match(result.warnings.join(" "), /asked to peak at 40 MPW/i);
});

test("reachable weekly mileage but missed marathon long-run minimum is compromised", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([34, 34, 34, 34, 34, 34], 4),
    goalType: "marathon",
    startDate: "2026-06-15",
    horizonWeeks: 11,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 40,
    aggression: "conservative",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.generator?.status, "compromised");
  assert.ok((result.plan.generator?.plannedPeakMilesPerWeek ?? 0) >= 40);
  assert.ok(preRacePeakLongRun(result.plan) < 16);
  assert.match(result.warnings.join(" "), /below the normal 16 mile minimum/i);
});

test("low-mileage plans keep long runs distinct from easy runs", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([12, 12, 12, 12], 4),
    goalType: "base_builder",
    startDate: "2026-06-15",
    horizonWeeks: 6,
    daysPerWeek: 3,
    targetPeakMilesPerWeek: 18,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  for (const week of result.plan.weeks) {
    const longRun = longestRun(week);
    const easyRuns = week.days
      .filter((day) => day.workout.type === "recovery" || day.workout.type === "easy")
      .map((day) => day.workout.targetMiles ?? 0);
    assert.ok(easyRuns.every((run) => longRun > run));
  }
});

test("easy runs are even when possible without erasing anchors", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([30, 30, 30, 30, 30, 30], 9),
    goalType: "half_marathon",
    startDate: "2026-06-15",
    horizonWeeks: 10,
    daysPerWeek: 5,
    targetPeakMilesPerWeek: 32,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  const firstWeek = result.plan.weeks[0];
  const easyRuns = firstWeek.days
    .filter((day) => day.workout.type === "recovery")
    .map((day) => day.workout.targetMiles ?? 0);
  assert.ok(Math.max(...easyRuns) - Math.min(...easyRuns) <= 1);
  assert.ok(longestRun(firstWeek) > Math.max(...easyRuns));
});

test("five and six day Sunday long-run schedules preserve Monday rest", () => {
  for (const daysPerWeek of [5, 6]) {
    const result = generateTrainingPlan({
      activities: runsFromWeeklyMileage([30, 30, 30, 30, 30, 30], 9),
      goalType: "half_marathon",
      startDate: "2026-06-15",
      horizonWeeks: 12,
      daysPerWeek,
      targetPeakMilesPerWeek: 36,
      aggression: "balanced",
      asOfDate,
      preferredLongRunDay: "sunday"
    });

    assert.equal(result.ok, true);
    const runDays = new Set(result.plan.weeks[0].days.map((day) => day.dayOfWeek));
    assert.equal(runDays.has("sunday"), true);
    assert.equal(runDays.has("monday"), false);
    assert.equal(result.plan.weeks[0].days.length, daysPerWeek);
  }
});

test("40 MPW plans use the configured 6 mile easy-run floor when feasible", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([40, 40, 40, 40, 40, 40], 12),
    goalType: "half_marathon",
    startDate: "2026-06-15",
    horizonWeeks: 10,
    daysPerWeek: 5,
    targetPeakMilesPerWeek: 40,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  const firstWeekEasyRuns = result.plan.weeks[0].days
    .filter((day) => day.workout.type === "recovery")
    .map((day) => day.workout.targetMiles ?? 0);
  assert.ok(firstWeekEasyRuns.length > 0);
  assert.ok(firstWeekEasyRuns.every((miles) => miles >= 6));
});

test("cutback does not reset future growth from the pre-cutback peak", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18, 18, 18, 18, 18, 18]),
    goalType: "base_builder",
    startDate: "2026-06-15",
    horizonWeeks: 8,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 34,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  const weekly = result.plan.weeks.map((week) => week.targetMiles ?? 0);
  assert.ok(weekly[3] < weekly[2]);
  assert.ok(weekly[4] > weekly[2]);
});

test("only cutback and taper weeks regress mileage", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([30, 30, 30, 30, 30, 30], 10),
    goalType: "marathon",
    startDate: "2026-06-15",
    horizonWeeks: 18,
    daysPerWeek: 5,
    targetPeakMilesPerWeek: 45,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  const regressions = result.plan.weeks
    .slice(1)
    .map((week, index) => ({ week, previous: result.plan.weeks[index] }))
    .filter(({ week, previous }) => (week.targetMiles ?? 0) < (previous.targetMiles ?? 0));
  assert.ok(regressions.every(({ week }) => week.focus === "Cutback and consolidate" || week.focus === "Taper and absorb"));
});

test("no usable Strava history fails gracefully", () => {
  const result = generateTrainingPlan({
    activities: [],
    goalType: "half_marathon",
    startDate: "2026-06-15",
    horizonWeeks: 12,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 30,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "not_recommended");
  assert.match(result.reason, /No usable Strava/i);
});

test("baseline uses 4 weeks when leading zeros would pollute a 6 week window", () => {
  const baseline = derivePlanBaseline(runsFromWeeklyMileage([0, 0, 16, 18, 18, 20]), asOfDate);

  assert.equal(baseline?.selectedWindowWeeks, 4);
  assert.equal(baseline?.startingMilesPerWeek, 18);
});

test("small decimal baseline and target changes normalize to the same plan shape", () => {
  const left = generateTrainingPlan({
    activities: runsFromWeeklyMileage([17.8, 18.1, 18.2, 17.9, 18.1, 18.2], 5.9),
    goalType: "base_builder",
    startDate: "2026-06-15",
    horizonWeeks: 8.2,
    daysPerWeek: 4.1,
    targetPeakMilesPerWeek: 30.2,
    aggression: "balanced",
    asOfDate
  });
  const right = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18.2, 17.9, 18.1, 18.2, 17.8, 18.1], 6.1),
    goalType: "base_builder",
    startDate: "2026-06-15",
    horizonWeeks: 8.4,
    daysPerWeek: 4.2,
    targetPeakMilesPerWeek: 30.4,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.equal(left.baseline.startingMilesPerWeek, 18);
  assert.equal(right.baseline.startingMilesPerWeek, 18);
  assert.equal(left.baseline.recentLongRunMiles, 6);
  assert.equal(right.baseline.recentLongRunMiles, 6);
  assert.deepEqual(planShape(left.plan), planShape(right.plan));
  assert.equal(left.plan.generator?.inputs.requestedTargetMilesPerWeek, 30);
  assert.equal(right.plan.generator?.inputs.requestedTargetMilesPerWeek, 30);
});

test("unsupported goal and aggression fail gracefully", () => {
  const unsupportedGoal = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18, 18, 18, 18]),
    goalType: "ultra" as unknown as "marathon",
    startDate: "2026-06-15",
    horizonWeeks: 12,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 30,
    aggression: "balanced",
    asOfDate
  });
  const unsupportedAggression = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18, 18, 18, 18]),
    goalType: "half_marathon",
    startDate: "2026-06-15",
    horizonWeeks: 12,
    daysPerWeek: 4,
    targetPeakMilesPerWeek: 30,
    aggression: "reckless" as unknown as "balanced",
    asOfDate
  });

  assert.equal(unsupportedGoal.ok, false);
  assert.match(unsupportedGoal.reason, /Unsupported plan goal/i);
  assert.equal(unsupportedAggression.ok, false);
  assert.match(unsupportedAggression.reason, /Unsupported plan aggression/i);
});

test("unsupported continuous days and excessive horizon normalize intentionally", () => {
  const result = generateTrainingPlan({
    activities: runsFromWeeklyMileage([18, 18, 18, 18, 18, 18]),
    goalType: "base_builder",
    startDate: "2026-06-15",
    horizonWeeks: 100,
    daysPerWeek: 2.2,
    targetPeakMilesPerWeek: 30.7,
    aggression: "balanced",
    asOfDate
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.durationWeeks, 32);
  assert.equal(result.plan.generator?.inputs.daysPerWeek, 3);
  assert.equal(result.plan.generator?.inputs.requestedTargetMilesPerWeek, 31);
  assert.ok(result.plan.weeks.every((week) => week.days.length === 3));
});

function runsFromWeeklyMileage(weeklyMileage: number[], longRunMiles?: number): Activity[] {
  const start = new Date("2026-04-29T12:00:00Z");
  return weeklyMileage.flatMap((mileage, weekIndex) => {
    if (mileage <= 0) return [];
    const longRun = Math.min(longRunMiles ?? Math.max(4, Math.round(mileage * 0.3)), mileage);
    const easyTotal = Math.max(0, mileage - longRun);
    const easyRun = Math.round((easyTotal / 3) * 10) / 10;
    const distances = [easyRun, easyRun, Math.max(0, Math.round((easyTotal - easyRun * 2) * 10) / 10), longRun].filter(
      (distance) => distance > 0
    );
    return distances.map((distance, runIndex) => ({
      provider: "strava" as const,
      providerActivityId: `${weekIndex}-${runIndex}-${distance}`,
      sportType: "Run",
      startDate: new Date(start.getTime() + (weekIndex * 7 + runIndex + 1) * 24 * 60 * 60 * 1000).toISOString(),
      distanceMeters: distance * metersPerMile,
      movingTimeSeconds: Math.round(distance * 9 * 60)
    }));
  });
}

function longRuns(plan: StructuredTrainingPlan) {
  return plan.weeks.map(longestRun);
}

function longestRun(week: StructuredTrainingPlan["weeks"][number]) {
  return Math.max(...week.days.filter((day) => day.workout.type === "long_run").map((day) => day.workout.targetMiles ?? 0));
}

function preRacePeakLongRun(plan: StructuredTrainingPlan) {
  const nonRaceWeeks = plan.weeks.filter((week) => week.focus !== "Race week");
  return Math.max(...nonRaceWeeks.map(longestRun));
}

function planShape(plan: StructuredTrainingPlan) {
  return plan.weeks.map((week) => ({
    miles: week.targetMiles,
    focus: week.focus,
    longRun: longestRun(week),
    days: week.days.map((day) => ({
      day: day.dayOfWeek,
      type: day.workout.type,
      miles: day.workout.targetMiles
    }))
  }));
}
