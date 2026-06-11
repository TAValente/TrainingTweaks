import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildUserContent } from "./ai.ts";
import { redactModelRun } from "./model-runs.ts";
import {
  ACTUAL_FULFILLMENTS,
  createRecommendationFulfillmentTrace,
  defaultRecommendationFulfillmentTraceForModelRun
} from "./recommendation-fulfillment.ts";
import { computeRunnerTensionSnapshot, runnerTensionSnapshotForPrompt } from "./runner-tension.ts";
import { contextForPrompt } from "./summary.ts";
import type { RecommendationFulfillmentTrace, StoredModelRun } from "./types.ts";

const asOfDate = new Date("2026-06-11T12:00:00.000Z");

test("RecommendationFulfillmentTrace supports long_run shifted by schedule tolerance", () => {
  const runnerTensionSnapshot = computeRunnerTensionSnapshot(undefined, asOfDate);
  const trace: RecommendationFulfillmentTrace = createRecommendationFulfillmentTrace({
    id: "trace-1",
    createdAt: asOfDate.toISOString(),
    question: "Should I move my long run?",
    recommendedActionSummary: "Cap the long run at 13 miles.",
    targetIntent: "long_run",
    expectedExposure: {
      targetMiles: 13,
      minMiles: 12,
      maxMiles: 13,
      intensity: "easy",
      avoidIntensity: true
    },
    acceptableSubstitutions: ["12 easy miles if fatigue is high"],
    scheduleTolerance: {
      type: "next_day",
      latestDate: "2026-06-15",
      notes: "Sunday or Monday preserves the long-run intent."
    },
    notAlignedIf: ["15 miles", "hard workout intensity"],
    runnerTensionSnapshot
  }, asOfDate);

  assert.equal(trace.schemaVersion, "1");
  assert.equal(trace.targetIntent, "long_run");
  assert.equal(trace.scheduleTolerance?.type, "next_day");
  assert.equal(trace.actualFulfillment, "unknown");
});

test("StoredModelRun can preserve recommendationFulfillmentTrace", () => {
  const runnerTensionSnapshot = computeRunnerTensionSnapshot(undefined, asOfDate);
  const recommendationFulfillmentTrace = createRecommendationFulfillmentTrace({
    question: "Should I run long?",
    targetIntent: "long_run",
    runnerTensionSnapshot
  }, asOfDate);
  const modelRun: StoredModelRun = {
    id: "run-1",
    timestamp: asOfDate.toISOString(),
    question: "Should I run long?",
    trainingContext: {},
    recommendationFulfillmentTrace
  };

  const redactedTrace = redactModelRun(modelRun).recommendationFulfillmentTrace;
  assert.equal(redactedTrace?.schemaVersion, recommendationFulfillmentTrace.schemaVersion);
  assert.equal(redactedTrace?.targetIntent, "long_run");
  assert.equal(redactedTrace?.actualFulfillment, "unknown");
  assert.deepEqual(redactedTrace?.runnerTensionSnapshot, recommendationFulfillmentTrace.runnerTensionSnapshot);
});

test("prompt and runtime doctrine mention workout intent rather than raw observation window", () => {
  const runningContext = contextForPrompt([], {}, "Should I run long?", asOfDate);
  const content = buildUserContent({}, "Should I run long?", runningContext);
  const runtimeDoctrine = readFileSync("docs/runtime-doctrine.md", "utf8");

  assert.match(content, /fulfilled by workout intent, not only by calendar date/i);
  assert.match(content, /shifted-but-aligned/i);
  assert.match(runtimeDoctrine, /fulfilled by workout intent, not only by date/i);
  assert.doesNotMatch(content, /expectedObservationWindowDays/);
});

test("trace enums include future fulfillment classifications", () => {
  assert.deepEqual([...ACTUAL_FULFILLMENTS], [
    "unknown",
    "fulfilled",
    "shifted_but_aligned",
    "modified_but_aligned",
    "accepted_alternative",
    "chose_opposite_side",
    "skipped",
    "not_enough_data"
  ]);
});

test("default trace does not perform automatic behavior classification", () => {
  const runnerTensionSnapshot = computeRunnerTensionSnapshot(undefined, asOfDate);
  const runningContext = {
    riskFindings: [],
    activePlanSnapshot: {
      status: "no_plan"
    }
  };
  const trace = defaultRecommendationFulfillmentTraceForModelRun({
    question: "Should I run today?",
    runnerTensionSnapshot,
    runningContext
  });

  assert.equal(trace.targetIntent, "unknown");
  assert.equal(trace.actualFulfillment, "unknown");
  assert.equal(trace.actualExposure, undefined);
  assert.deepEqual(trace.expectedRiskContext, {
    loadRiskContext: undefined,
    riskFindings: [],
    activePlanSnapshot: {
      status: "no_plan"
    },
    structuredTrainingPlan: undefined
  });
});

test("existing Runner Tension Model compact empty behavior remains intact", () => {
  const prompt = runnerTensionSnapshotForPrompt(computeRunnerTensionSnapshot(undefined, asOfDate));

  assert.equal(prompt, "Runner Tension Model: no durable runner-specific tension evidence yet.");
});
