import assert from "node:assert/strict";
import test from "node:test";
import { computeRiskFindings } from "./risk.ts";
import type { Activity, RiskFinding } from "./types.ts";

const asOfDate = new Date("2026-06-05T12:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;
const metersPerMile = 1609.344;

test("safe steady runner emits no elevated risk findings", () => {
  const findings = computeRiskFindings({ activities: steadyRunner(), asOfDate });
  assert.equal(elevated(findings).length, 0);
});

test("weekly volume growth and ACWR fire on mileage jump", () => {
  const findings = computeRiskFindings({ activities: mileageJumpRunner(), asOfDate });
  assertFinding(findings, "weekly_volume_growth", "red");
  assertFinding(findings, "acwr_mileage", "red");
});

test("long-run-heavy runner fires long run percentage and jump", () => {
  const findings = computeRiskFindings({ activities: longRunHeavyRunner(), asOfDate });
  assertFinding(findings, "long_run_percentage", "red");
  assertFinding(findings, "long_run_jump", "red");
});

test("hard day clustering runner fires hard count, intensity spike, and clustering", () => {
  const findings = computeRiskFindings({ activities: hardClusterRunner(), asOfDate });
  assertFinding(findings, "hard_session_count", "red");
  assertFinding(findings, "intensity_spike", "red");
  assertFinding(findings, "hard_day_clustering", "red");
});

test("consecutive running days emits elevated streak finding", () => {
  const findings = computeRiskFindings({ activities: runningStreakRunner(), asOfDate });
  assertFinding(findings, "consecutive_running_days", "red");
});

test("new runner with insufficient history emits data quality finding", () => {
  const findings = computeRiskFindings({ activities: [run(1, 4)], asOfDate });
  const finding = assertFinding(findings, "data_quality", "info");
  assert.equal(finding.title, "Limited running history");
});

test("runner with no HR, effort, or gear emits data quality findings", () => {
  const findings = computeRiskFindings({ activities: paceOnlyRunner(), asOfDate });
  assert(findings.some((finding) => finding.evidence.field === "averageHeartRate"));
  assert(findings.some((finding) => finding.evidence.field === "relativeEffort"));
  assert(findings.some((finding) => finding.evidence.field === "gearId"));
});

test("elevation spike contributes to training novelty", () => {
  const findings = computeRiskFindings({ activities: elevationSpikeRunner(), asOfDate });
  const finding = assertFinding(findings, "training_novelty", "yellow");
  assert.equal((finding.evidence.components as Record<string, { score: number }>).elevationGain.score, 2);
});

test("consecutive build weeks emit build-streak finding", () => {
  const findings = computeRiskFindings({ activities: buildWeekRunner(), asOfDate });
  const finding = assertFinding(findings, "consecutive_build_weeks", "red");
  assert.equal(finding.observedValue, 6);
});

function elevated(findings: RiskFinding[]) {
  return findings.filter((finding) => finding.severity === "yellow" || finding.severity === "red");
}

function assertFinding(findings: RiskFinding[], ruleId: string, severity: RiskFinding["severity"]) {
  const finding = findings.find((candidate) => candidate.ruleId === ruleId && candidate.severity === severity);
  assert.ok(finding, `Expected ${ruleId} ${severity}; got ${findings.map((item) => `${item.ruleId}:${item.severity}`).join(", ")}`);
  assert.equal(typeof finding.message, "string");
  assert.ok(Object.keys(finding.evidence).length > 0);
  return finding;
}

function steadyRunner() {
  const activities: Activity[] = [];
  for (let week = 0; week < 10; week += 1) {
    const base = week * 7;
    activities.push(
      run(base + 1, 7, { averageHeartRate: 138, averagePaceSecondsPerKm: 330, relativeEffort: 20 }),
      run(base + 3, 6, { averageHeartRate: 136, averagePaceSecondsPerKm: 335, relativeEffort: 18 }),
      run(base + 5, 6, { averageHeartRate: 137, averagePaceSecondsPerKm: 333, relativeEffort: 19 }),
      run(base + 6, 6, { averageHeartRate: 139, averagePaceSecondsPerKm: 332, relativeEffort: 20 })
    );
  }
  return activities;
}

function mileageJumpRunner() {
  return [
    ...priorWeeks(4, [5, 5, 5, 5]),
    run(1, 6, withEasyData()),
    run(2, 6, withEasyData()),
    run(3, 6, withEasyData()),
    run(4, 6, withEasyData()),
    run(5, 6, withEasyData())
  ];
}

function longRunHeavyRunner() {
  return [
    ...priorWeeks(4, [4, 4, 8]),
    run(1, 14, withEasyData()),
    run(3, 4, withEasyData()),
    run(5, 4, withEasyData())
  ];
}

function hardClusterRunner() {
  return [
    ...priorWeeks(4, [5, 5, 5, 5], { relativeEffort: 10, averageHeartRate: 135, averagePaceSecondsPerKm: 340 }),
    run(1, 5, { name: "Tempo workout", relativeEffort: 80, averageHeartRate: 166, averagePaceSecondsPerKm: 290 }),
    run(2, 5, { name: "Interval workout", relativeEffort: 80, averageHeartRate: 168, averagePaceSecondsPerKm: 285 }),
    run(3, 11, { name: "Long run", relativeEffort: 28, averageHeartRate: 142, averagePaceSecondsPerKm: 335 }),
    run(4, 5, { name: "Threshold workout", relativeEffort: 80, averageHeartRate: 167, averagePaceSecondsPerKm: 288 })
  ];
}

function runningStreakRunner() {
  return [
    ...priorWeeks(4, [4, 4, 4, 4], withEasyData()),
    ...[0, 1, 2, 3, 4, 5, 6].map((daysAgo) => run(daysAgo, 3, withEasyData()))
  ];
}

function paceOnlyRunner() {
  return [1, 3, 5, 8, 10, 12, 15, 17].map((daysAgo) => run(daysAgo, 4, { averagePaceSecondsPerKm: 330 }));
}

function elevationSpikeRunner() {
  return [
    ...priorWeeks(8, [5, 5, 5, 5], { ...withEasyData(), elevationGainMeters: 20 }),
    run(1, 5, { ...withEasyData(), elevationGainMeters: 220 }),
    run(3, 5, { ...withEasyData(), elevationGainMeters: 220 }),
    run(5, 5, { ...withEasyData(), elevationGainMeters: 220 }),
    run(6, 5, { ...withEasyData(), elevationGainMeters: 220 })
  ];
}

function buildWeekRunner() {
  const weeklyMileage = [10, 12, 14, 16, 18, 20, 22];
  return weeklyMileage.flatMap((mileage, index) => {
    const weekOffset = (weeklyMileage.length - index - 1) * 7;
    return [
      run(weekOffset + 2, mileage / 2, withEasyData()),
      run(weekOffset + 5, mileage / 2, withEasyData())
    ];
  });
}

function priorWeeks(weeks: number, distances: number[], overrides: Partial<Activity> = withEasyData()) {
  const activities: Activity[] = [];
  for (let week = 1; week <= weeks; week += 1) {
    distances.forEach((distance, index) => {
      activities.push(run(week * 7 + index + 1, distance, overrides));
    });
  }
  return activities;
}

function run(daysAgo: number, distanceMiles: number, overrides: Partial<Activity> = {}): Activity {
  return {
    provider: "strava",
    providerActivityId: `run-${daysAgo}-${distanceMiles}-${overrides.name ?? "easy"}`,
    sportType: "Run",
    name: overrides.name ?? "Easy run",
    startDate: new Date(asOfDate.getTime() - daysAgo * dayMs).toISOString(),
    distanceMeters: distanceMiles * metersPerMile,
    movingTimeSeconds: Math.round(distanceMiles * 9 * 60),
    elapsedTimeSeconds: Math.round(distanceMiles * 9 * 60),
    elevationGainMeters: 40,
    ...overrides
  };
}

function withEasyData(): Partial<Activity> {
  return {
    averageHeartRate: 138,
    averagePaceSecondsPerKm: 335,
    relativeEffort: 20
  };
}
