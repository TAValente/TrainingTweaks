import assert from "node:assert/strict";
import test from "node:test";
import {
  assertScenarioUsesSeededTension,
  runFulfillmentScenario,
  runFulfillmentScenarios
} from "./fulfillment-scenario-harness.ts";
import { fulfillmentScenarioFixtures } from "./fulfillment-scenarios.ts";

test("scenario fixtures cover representative runner tension cases", () => {
  assert.equal(fulfillmentScenarioFixtures.length, 5);
  assert.deepEqual(
    fulfillmentScenarioFixtures.map((scenario) => scenario.id),
    [
      "exceeds-long-run-cap",
      "easy-day-turns-hard",
      "cautious-runner-easy-fulfillment",
      "long-run-ramp-shifted",
      "pain-risk-rest-conservative"
    ]
  );
});

test("scenario harness carries seeded tension into snapshot and trace before matching", () => {
  for (const scenario of fulfillmentScenarioFixtures) {
    const result = runFulfillmentScenario(scenario);

    assertScenarioUsesSeededTension(result);
    assert.equal(result.match.actualFulfillment, scenario.expectedFulfillment);
  }
});

test("scenario harness proves exceed-planned-mileage seed can conflict with conservative trace", () => {
  const result = runFulfillmentScenario(
    fulfillmentScenarioFixtures.find((scenario) => scenario.id === "exceeds-long-run-cap")!
  );

  assert.equal(result.trace.tensionTraces[0]?.recommendedSide, "left");
  assert.equal(result.trace.tensionTraces[0]?.discouragedSide, "right");
  assert.equal(result.match.actualFulfillment, "chose_opposite_side");
});

test("scenario harness proves shifted long run remains aligned when bounded by trace", () => {
  const result = runFulfillmentScenario(
    fulfillmentScenarioFixtures.find((scenario) => scenario.id === "long-run-ramp-shifted")!
  );

  assert.equal(result.trace.targetIntent, "long_run");
  assert.equal(result.trace.scheduleTolerance?.type, "next_day");
  assert.equal(result.match.actualFulfillment, "shifted_but_aligned");
  assert.equal(result.match.actualExposure?.miles, 12.8);
});

test("scenario harness does not create new tension evidence from matching results", () => {
  const results = runFulfillmentScenarios(fulfillmentScenarioFixtures);

  for (const result of results) {
    assert.equal(result.appData.runnerTensionModel?.evidence.length, result.scenario.seeds.length);
    assert.ok(result.appData.runnerTensionModel?.evidence.every((event) => event.source === "scenario_fixture"));
    assert.ok(
      result.appData.runnerTensionModel?.evidence.every((event) => !event.summary.includes(result.match.actualFulfillment))
    );
  }
});
