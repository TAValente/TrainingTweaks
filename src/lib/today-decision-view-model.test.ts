import assert from "node:assert/strict";
import test from "node:test";
import { buildActivePlanSnapshot } from "./active-plan-snapshot.ts";
import { buildTodayDecisionViewModel } from "./today-decision-view-model.ts";
import type {
  ActivitySummary,
  RecommendationFulfillmentTrace,
  RiskFinding,
  RunnerTensionSnapshot,
  StructuredTrainingPlan
} from "./types.ts";

test("normal state maps active plan and risk context into today's decision", () => {
  const plan = planFixture();
  const snapshot = buildActivePlanSnapshot(plan, [], {
    localDate: "2026-06-24",
    completedMilesLast7Days: 18
  });
  const model = buildTodayDecisionViewModel({
    activePlanSnapshot: snapshot,
    structuredPlan: plan,
    summary: summaryFixture({ mileageLast7Days: 18 }),
    riskFindings: [riskFinding({ severity: "green", title: "Load context", message: "Recent load is readable." })],
    lastRefreshAt: "2026-06-24T11:42:00.000Z",
    localDate: "2026-06-24"
  });

  assert.equal(model.headline, "6 mi Tempo");
  assert.equal(model.assignment.source, "plan");
  assert.equal(model.receipt.items.find((item) => item.label === "Risk")?.value, "Recent load looks manageable");
  assert.equal(model.weekPath.length, 7);
  assert.equal(model.weekPath[2].status, "today");
  assert.match(model.freshness, /Fresh/);
});

test("missing plan uses latest recorded recommendation safely", () => {
  const model = buildTodayDecisionViewModel({
    activePlanSnapshot: buildActivePlanSnapshot(undefined, [], { localDate: "2026-06-24" }),
    summary: summaryFixture(),
    latestRecommendation: recommendationFixture("Keep this easy if you run", 4),
    localDate: "2026-06-24"
  });

  assert.equal(model.headline, "Keep this easy if you run");
  assert.equal(model.assignment.source, "recommendation");
  assert.equal(model.assignment.distance, "4 mi");
  assert.match(model.subheadline ?? "", /latest recorded recommendation/i);
});

test("missing recommendation falls back without inventing a workout", () => {
  const model = buildTodayDecisionViewModel({
    activePlanSnapshot: buildActivePlanSnapshot(undefined, [], { localDate: "2026-06-24" }),
    summary: summaryFixture(),
    localDate: "2026-06-24"
  });

  assert.equal(model.assignment.source, "fallback");
  assert.equal(model.headline, "No active plan today");
  assert.match(model.rationale.join(" "), /No active structured plan is accepted/);
});

test("missing plan assignment with unusable plan degrades safely", () => {
  const snapshot = buildActivePlanSnapshot({ ...planFixture(), startDate: "bad-date" }, [], { localDate: "2026-06-24" });
  const model = buildTodayDecisionViewModel({
    activePlanSnapshot: snapshot,
    summary: summaryFixture(),
    localDate: "2026-06-24"
  });

  assert.equal(model.headline, "Plan needs review");
  assert.equal(model.assignment.source, "fallback");
  assert.match(model.receipt.items.find((item) => item.label === "Plan")?.value ?? "", /invalid/i);
});

test("risk and build evidence maps into receipt without overstating certainty", () => {
  const plan = planFixture();
  const snapshot = buildActivePlanSnapshot(plan, [], { localDate: "2026-06-24" });
  const model = buildTodayDecisionViewModel({
    activePlanSnapshot: snapshot,
    structuredPlan: plan,
    summary: summaryFixture(),
    riskFindings: [
      riskFinding({
        severity: "red",
        title: "Long run novelty",
        message: "Today's planned run is high relative to recent adaptation."
      })
    ],
    localDate: "2026-06-24"
  });

  assert.equal(model.receipt.items.find((item) => item.label === "Risk")?.tone, "risk");
  assert.match(model.receipt.primary, /Risk: high/);
  assert.doesNotMatch(model.subheadline ?? "", /optimal/i);
  assert.match(model.rationale.join(" "), /risk signal, not a full diagnosis/i);
});

test("freshness timestamp renders safely", () => {
  assert.match(
    buildTodayDecisionViewModel({
      summary: summaryFixture(),
      lastRefreshAt: "2026-06-24T11:42:00.000Z",
      localDate: "2026-06-24"
    }).freshness,
    /Fresh/
  );

  assert.equal(
    buildTodayDecisionViewModel({
      summary: summaryFixture(),
      localDate: "2026-06-24"
    }).freshness,
    "No refresh yet"
  );
});

test("UI-facing model is complete with incomplete data", () => {
  const model = buildTodayDecisionViewModel({
    summary: summaryFixture(),
    localDate: "2026-06-24"
  });

  assert.ok(model.headline);
  assert.ok(model.receipt.primary);
  assert.ok(model.receipt.items.length >= 3);
  assert.ok(model.rationale.length);
  assert.ok(model.weekPath.length);
  assert.ok(model.weekPath.every((item) => item.date && item.label && item.status));
});

function planFixture(): StructuredTrainingPlan {
  return {
    schemaVersion: "1",
    id: "today-plan",
    name: "Today plan",
    source: "trainingtweaks_generic",
    startDate: "2026-06-15",
    durationWeeks: 2,
    weeks: [
      {
        weekNumber: 1,
        focus: "Base",
        targetMiles: 20,
        days: [plannedDay("monday", "easy", "Easy run", 4), plannedDay("sunday", "long_run", "Long run", 8)]
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

function summaryFixture(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    mileageLast7Days: 0,
    mileageLast14Days: 0,
    mileageLast28Days: 0,
    mileageLast42Days: 0,
    mileageLast84Days: 0,
    mileageLast182Days: 0,
    mileageLast730Days: 0,
    mileageLast1825Days: 0,
    longestRunLast14DaysMiles: 0,
    longestRunLast28DaysMiles: 0,
    longestRunLast182DaysMiles: 0,
    longestRunLast730DaysMiles: 0,
    longestRunLast1825DaysMiles: 0,
    recentIntensityIndicators: [],
    recentMissedDays: 0,
    runCountLast14Days: 0,
    runCountLast28Days: 0,
    runCountLast182Days: 0,
    runCountLast730Days: 0,
    runCountLast1825Days: 0,
    fastestEfforts: [],
    ...overrides
  };
}

function riskFinding(overrides: Partial<RiskFinding> = {}): RiskFinding {
  return {
    id: "risk-1",
    ruleId: "cardio_load_7d",
    category: "cardio_load",
    severity: "green",
    confidence: "medium",
    title: "Cardio load",
    message: "Recent load looks manageable.",
    lookbackDays: 7,
    evidence: { source: "fixture" },
    createdAt: "2026-06-24T10:00:00.000Z",
    ...overrides
  };
}

function recommendationFixture(summary: string, targetMiles: number): RecommendationFulfillmentTrace {
  return {
    schemaVersion: "1",
    id: "recommendation-1",
    createdAt: "2026-06-24T10:00:00.000Z",
    question: "What should I run today?",
    recommendedActionSummary: summary,
    targetIntent: "easy_run",
    expectedExposure: {
      targetMiles,
      intensity: "easy"
    },
    tensionTraces: [],
    runnerTensionSnapshot: runnerTensionSnapshotFixture(),
    actualFulfillment: "unknown"
  };
}

function runnerTensionSnapshotFixture(): RunnerTensionSnapshot {
  return {
    schemaVersion: "1",
    asOf: "2026-06-24T10:00:00.000Z",
    decayModelVersion: "fixture",
    postures: []
  };
}
