import assert from "node:assert/strict";
import test from "node:test";
import {
  matchRecommendationFulfillment,
  updateStoredModelRunFulfillment
} from "./fulfillment-matching.ts";
import { createRecommendationFulfillmentTrace } from "./recommendation-fulfillment.ts";
import { computeRunnerTensionSnapshot } from "./runner-tension.ts";
import type { Activity, RecommendationFulfillmentTrace, StoredModelRun } from "./types.ts";

const metersPerMile = 1609.344;
const traceCreatedAt = "2026-06-14T12:00:00.000Z";
const runnerTensionSnapshot = computeRunnerTensionSnapshot(undefined, new Date(traceCreatedAt));

test("long run recommended Sunday completed Monday within bounds is shifted_but_aligned", () => {
  const trace = traceFor({
    targetIntent: "long_run",
    expectedExposure: {
      minMiles: 12,
      maxMiles: 13,
      intensity: "easy"
    },
    scheduleTolerance: {
      type: "next_day"
    }
  });

  const result = matchRecommendationFulfillment({
    trace,
    activities: [run("2026-06-15T10:00:00.000Z", 12.8, { name: "Long Run" })],
    asOfDate: new Date("2026-06-16T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "shifted_but_aligned");
  assert.equal(result.actualExposure?.miles, 12.8);
  assert.equal(result.confidence, "medium");
});

test("long run max 13 with actual 15 and explicit notAlignedIf is chose_opposite_side", () => {
  const trace = traceFor({
    targetIntent: "long_run",
    expectedExposure: {
      maxMiles: 13,
      intensity: "easy"
    },
    notAlignedIf: ["15 miles", "hard workout intensity"],
    scheduleTolerance: {
      type: "same_day"
    }
  });

  const result = matchRecommendationFulfillment({
    trace,
    activities: [run("2026-06-14T16:00:00.000Z", 15, { name: "Long Run" })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "chose_opposite_side");
  assert.equal(result.actualExposure?.miles, 15);
});

test("long run without exposure structure stays unknown despite later run", () => {
  const result = matchRecommendationFulfillment({
    trace: traceFor({
      targetIntent: "long_run",
      scheduleTolerance: {
        type: "next_day"
      }
    }),
    activities: [run("2026-06-15T10:00:00.000Z", 12.8, { name: "Long Run" })],
    asOfDate: new Date("2026-06-16T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "unknown");
  assert.equal(result.confidence, "low");
  assert.match(result.rationale, /lacks enough exposure/i);
});

test("easy run recommended and similar easy run same day is fulfilled", () => {
  const trace = traceFor({
    targetIntent: "easy_run",
    expectedExposure: {
      minMiles: 4,
      maxMiles: 5,
      intensity: "easy",
      avoidIntensity: true
    },
    scheduleTolerance: {
      type: "same_day"
    }
  });

  const result = matchRecommendationFulfillment({
    trace,
    activities: [run("2026-06-14T18:00:00.000Z", 4.5, { name: "Easy Run", relativeEffort: 20 })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "fulfilled");
  assert.equal(result.actualExposure?.intensity, "easy");
});

test("easy run without exposure structure stays unknown despite later easy run", () => {
  const result = matchRecommendationFulfillment({
    trace: traceFor({
      targetIntent: "easy_run",
      scheduleTolerance: {
        type: "same_day"
      }
    }),
    activities: [run("2026-06-14T18:00:00.000Z", 4.5, { name: "Easy Run", relativeEffort: 20 })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "unknown");
  assert.equal(result.confidence, "low");
});

test("recovery run without exposure structure stays unknown despite later run", () => {
  const result = matchRecommendationFulfillment({
    trace: traceFor({
      targetIntent: "recovery_run",
      scheduleTolerance: {
        type: "same_day"
      }
    }),
    activities: [run("2026-06-14T18:00:00.000Z", 3, { name: "Recovery Run", relativeEffort: 10 })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "unknown");
  assert.equal(result.confidence, "low");
});

test("easy run recommended with no later run before tolerance elapses is not_enough_data", () => {
  const trace = traceFor({
    targetIntent: "easy_run",
    expectedExposure: {
      targetMiles: 4,
      intensity: "easy"
    },
    scheduleTolerance: {
      type: "next_day"
    }
  });

  const result = matchRecommendationFulfillment({
    trace,
    activities: [],
    asOfDate: new Date("2026-06-14T18:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "not_enough_data");
});

test("rest recommended with no activity after elapsed tolerance is fulfilled", () => {
  const trace = traceFor({
    targetIntent: "rest",
    scheduleTolerance: {
      type: "same_day"
    }
  });

  const result = matchRecommendationFulfillment({
    trace,
    activities: [],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "fulfilled");
  assert.equal(result.actualExposure?.intensity, "off");
});

test("rest recommended with hard run in tolerance is chose_opposite_side", () => {
  const trace = traceFor({
    targetIntent: "rest",
    scheduleTolerance: {
      type: "same_day"
    }
  });

  const result = matchRecommendationFulfillment({
    trace,
    activities: [run("2026-06-14T17:00:00.000Z", 6, { name: "Tempo workout", relativeEffort: 95 })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "chose_opposite_side");
  assert.equal(result.confidence, "high");
});

test("unknown targetIntent stays unknown", () => {
  const result = matchRecommendationFulfillment({
    trace: traceFor({ targetIntent: "unknown" }),
    activities: [run("2026-06-14T17:00:00.000Z", 5, { name: "Easy Run" })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "unknown");
});

test("ambiguous workout activity remains unknown", () => {
  const result = matchRecommendationFulfillment({
    trace: traceFor({
      targetIntent: "workout",
      expectedExposure: {
        intensity: "hard"
      },
      scheduleTolerance: {
        type: "same_day"
      }
    }),
    activities: [run("2026-06-14T17:00:00.000Z", 5, { name: "Run" })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.actualFulfillment, "unknown");
});

test("StoredModelRun update only changes recommendation fulfillment actual fields", () => {
  const trace = traceFor({
    targetIntent: "easy_run",
    expectedExposure: {
      targetMiles: 4
    }
  });
  const modelRun: StoredModelRun = {
    id: "run-1",
    timestamp: traceCreatedAt,
    question: "Should I run?",
    trainingContext: {
      planVariant: "novice"
    },
    renderedAnswer: "Run easy.",
    recommendationFulfillmentTrace: trace
  };
  const result = matchRecommendationFulfillment({
    trace,
    activities: [run("2026-06-14T17:00:00.000Z", 4, { name: "Easy Run" })],
    asOfDate: new Date("2026-06-15T12:00:00.000Z")
  });

  const updated = updateStoredModelRunFulfillment(modelRun, result);

  assert.equal(updated.id, modelRun.id);
  assert.equal(updated.renderedAnswer, modelRun.renderedAnswer);
  assert.deepEqual(updated.trainingContext, modelRun.trainingContext);
  assert.equal(updated.recommendationFulfillmentTrace?.actualFulfillment, "fulfilled");
  assert.equal((updated.recommendationFulfillmentTrace?.actualExposure as { miles?: number } | undefined)?.miles, 4);
  assert.equal(modelRun.recommendationFulfillmentTrace?.actualFulfillment, "unknown");
});

function traceFor(overrides: Partial<RecommendationFulfillmentTrace>): RecommendationFulfillmentTrace {
  return createRecommendationFulfillmentTrace({
    question: "What should I do?",
    createdAt: traceCreatedAt,
    runnerTensionSnapshot,
    ...overrides
  });
}

function run(startDate: string, distanceMiles: number, overrides: Partial<Activity> = {}): Activity {
  return {
    provider: "strava",
    providerActivityId: `${startDate}-${distanceMiles}-${overrides.name ?? "run"}`,
    sportType: "Run",
    name: overrides.name ?? "Run",
    startDate,
    distanceMeters: distanceMiles * metersPerMile,
    movingTimeSeconds: Math.round(distanceMiles * 9 * 60),
    elapsedTimeSeconds: Math.round(distanceMiles * 9 * 60),
    ...overrides
  };
}
