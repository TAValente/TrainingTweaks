import assert from "node:assert/strict";
import test from "node:test";
import { computeRiskFindings } from "./risk.ts";
import type { Activity, ActivityStreamSummary, NoveltySignal, PlannedWorkoutExposure, RiskFinding } from "./types.ts";

const asOfDate = new Date("2026-06-05T12:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;
const metersPerMile = 1609.344;

test("near-zero fast-running baseline does not collapse novelty to zero", () => {
  const findings = computeRiskFindings({
    activities: [
      ...priorWeeks(6, [4, 4, 4], withEasyData()),
      run(1, 5, {
        ...withEasyData(),
        streamSummary: streamSummary({ fastRunningSeconds: 180 })
      })
    ],
    asOfDate
  });
  const signal = noveltySignal(assertFinding(findings, "fast_running_novelty"));
  assert.equal(signal.baselineValue, 0);
  assert.equal(signal.currentValue, 180);
  assert.equal(signal.severity, "yellow");
});

test("returning runner can have high capacity and low adaptation", () => {
  const findings = computeRiskFindings({
    activities: [
      ...oldHighCapacityBlock(),
      run(1, 5, withEasyData())
    ],
    asOfDate
  });
  const finding = assertFinding(findings, "adaptation_context");
  assert.equal(finding.framework?.capacity?.classification, "high");
  assert.equal(finding.framework?.adaptation?.classification, "low");
  assert.equal(finding.severity, "yellow");
});

test("true beginner has low capacity and low adaptation", () => {
  const findings = computeRiskFindings({
    activities: [run(1, 3, withEasyData()), run(5, 3, withEasyData())],
    asOfDate
  });
  const finding = assertFinding(findings, "adaptation_context");
  assert.equal(finding.framework?.capacity?.classification, "low");
  assert.equal(finding.framework?.adaptation?.classification, "low");
});

test("high cardio load can be novel while mechanical exposure stays ordinary", () => {
  const findings = computeRiskFindings({
    activities: [
      ...priorWeeks(6, [3, 3, 3], { ...withEasyData(), relativeEffort: 15 }),
      run(1, 3, { ...withEasyData(), relativeEffort: 90 })
    ],
    asOfDate
  });
  assert.equal(assertFinding(findings, "cardio_load_novelty").severity, "red");
  assert.equal(assertFinding(findings, "mileage_novelty").severity, "green");
});

test("mechanical novelty can be high even when cardio load is moderate", () => {
  const findings = computeRiskFindings({
    activities: [
      ...priorWeeks(6, [4, 4, 4], { ...withEasyData(), relativeEffort: 15 }),
      run(1, 14, { ...withEasyData(), relativeEffort: 20 })
    ],
    asOfDate
  });
  assert.equal(assertFinding(findings, "long_run_novelty").severity, "red");
  assert.equal(assertFinding(findings, "cardio_load_novelty").severity, "green");
});

test("stream fast-running exposure identifies workout despite slow average pace", () => {
  const findings = computeRiskFindings({
    activities: [
      ...priorWeeks(6, [5, 5, 5], withEasyData()),
      run(1, 6, {
        ...withEasyData(),
        averagePaceSecondsPerKm: 390,
        streamSummary: streamSummary({ fastRunningSeconds: 600 })
      })
    ],
    asOfDate
  });
  const finding = assertFinding(findings, "fast_running_novelty");
  const signal = noveltySignal(finding);
  assert.equal(signal.source, "strava_streams");
  assert.equal(finding.framework?.mechanicalExposure?.fastRunningSource, "streams");
  assert.equal(signal.currentValue, 600);
});

test("no streams available uses low-confidence fallback instead of fake precision", () => {
  const findings = computeRiskFindings({
    activities: [
      ...priorWeeks(6, [5, 5, 5], withEasyData()),
      run(1, 6, {
        ...withEasyData(),
        name: "Tempo workout",
        averagePaceSecondsPerKm: 390
      })
    ],
    asOfDate
  });
  const finding = assertFinding(findings, "fast_running_novelty");
  const signal = noveltySignal(finding);
  assert.equal(signal.source, "trainingtweaks_inferred");
  assert.equal(signal.confidence, "low");
  assert.equal(finding.framework?.mechanicalExposure?.fastRunningSource, "activity_summary_fallback");
});

test("no planned workout emits only observed decision risk", () => {
  const findings = computeRiskFindings({
    activities: priorWeeks(6, [4, 4, 4], withEasyData()),
    asOfDate
  });
  assertFinding(findings, "decision_risk_observed");
  assert.equal(findings.some((finding) => finding.ruleId === "decision_risk_planned_vs_observed"), false);
});

test("planned long run is compared against recent observed adaptation", () => {
  const plannedWorkout: PlannedWorkoutExposure = {
    source: "trainingtweaks_generated_plan",
    type: "long_run",
    targetMiles: 14,
    intensity: "easy",
    purpose: "Long run",
    confidence: "medium"
  };
  const findings = computeRiskFindings({
    activities: priorWeeks(6, [4, 4, 4], withEasyData()),
    asOfDate,
    plannedWorkout
  });
  const observed = assertFinding(findings, "decision_risk_observed");
  const finding = assertFinding(findings, "decision_risk_planned_vs_observed");
  assert.equal(finding.severity, "red");
  assert.equal(observed.framework?.decisionRisk?.scope, "observed");
  assert.equal(finding.framework?.decisionRisk?.scope, "observed");
  assert.equal((finding.evidence.plannedDecisionRisk as { scope?: string; plannedWorkout?: PlannedWorkoutExposure }).scope, "planned_vs_observed");
  assert.equal((finding.evidence.plannedDecisionRisk as { scope?: string; plannedWorkout?: PlannedWorkoutExposure }).plannedWorkout?.targetMiles, 14);
});

test("mixed stream and no-stream window keeps inferred hard exposure for unsynced runs", () => {
  const findings = computeRiskFindings({
    activities: [
      ...priorWeeks(6, [5, 5, 5], withEasyData()),
      run(1, 5, {
        ...withEasyData(),
        streamSummary: streamSummary({ fastRunningSeconds: 300 })
      }),
      run(2, 5, {
        ...withEasyData(),
        name: "Tempo workout"
      })
    ],
    asOfDate
  });
  const finding = assertFinding(findings, "fast_running_novelty");
  const signal = noveltySignal(finding);
  assert.equal(finding.framework?.mechanicalExposure?.fastRunningSource, "mixed");
  assert.equal(signal.currentValue, 1500);
  assert.equal(signal.source, "trainingtweaks_inferred");
});

test("capacity includes best-effort summaries when available", () => {
  const findings = computeRiskFindings({
    activities: [
      run(365, 6, {
        ...withEasyData(),
        name: "5K race",
        bestEfforts: [bestEffort("5K", 5000, 20 * 60)]
      }),
      run(1, 3, withEasyData())
    ],
    asOfDate
  });
  const finding = assertFinding(findings, "capacity_context");
  assert.equal(finding.framework?.capacity?.fastestEfforts?.[0]?.distance, "5K");
  assert.equal(finding.framework?.capacity?.fastestEfforts?.[0]?.seconds, 1200);
  assert.equal(finding.framework?.capacity?.confidence, "low");
});

test("strong old best effort can raise capacity while adaptation stays low", () => {
  const findings = computeRiskFindings({
    activities: [
      run(365, 6, {
        ...withEasyData(),
        name: "5K race",
        bestEfforts: [bestEffort("5K", 5000, 20 * 60)]
      }),
      run(1, 3, withEasyData())
    ],
    asOfDate
  });
  const finding = assertFinding(findings, "adaptation_context");
  assert.equal(finding.framework?.capacity?.classification, "high");
  assert.equal(finding.framework?.adaptation?.classification, "low");
  assert.equal(finding.framework?.adaptation?.mileagePerWeek28Days, 0.8);
});

function assertFinding(findings: RiskFinding[], ruleId: string) {
  const finding = findings.find((candidate) => candidate.ruleId === ruleId);
  assert.ok(finding, `Expected ${ruleId}; got ${findings.map((item) => `${item.ruleId}:${item.severity}`).join(", ")}`);
  assert.equal(typeof finding.message, "string");
  assert.ok(Object.keys(finding.evidence).length > 0);
  return finding;
}

function noveltySignal(finding: RiskFinding) {
  return finding.evidence.noveltySignal as NoveltySignal;
}

function oldHighCapacityBlock() {
  const activities: Activity[] = [];
  for (let week = 16; week < 24; week += 1) {
    const base = week * 7;
    activities.push(
      run(base + 1, 10, withEasyData()),
      run(base + 3, 10, withEasyData()),
      run(base + 5, 10, withEasyData()),
      run(base + 6, 10, withEasyData())
    );
  }
  return activities;
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
    providerActivityId: `run-${daysAgo}-${distanceMiles}-${overrides.name ?? "easy"}-${overrides.relativeEffort ?? ""}-${overrides.streamSummary?.fastRunningSeconds ?? ""}`,
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

function streamSummary(input: { fastRunningSeconds: number }): ActivityStreamSummary {
  return {
    source: "strava_streams" as const,
    fetchedAt: asOfDate.toISOString(),
    availableTypes: ["time", "distance", "velocity_smooth", "moving"],
    sampleCount: 100,
    movingSeconds: 1800,
    fastRunningSeconds: input.fastRunningSeconds,
    fastRunningSource: "personalized_stream_zone" as const,
    fastRunningConfidence: "medium" as const
  };
}

function bestEffort(name: string, distanceMeters: number, elapsedTimeSeconds: number) {
  return {
    name,
    distanceMeters,
    elapsedTimeSeconds,
    movingTimeSeconds: elapsedTimeSeconds,
    startDate: asOfDate.toISOString()
  };
}
