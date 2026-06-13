import assert from "node:assert/strict";
import test from "node:test";
import { runFulfillmentScenario, runFulfillmentScenarios } from "./fulfillment-scenario-harness.ts";
import { fulfillmentScenarioFixtures } from "./fulfillment-scenarios.ts";
import {
  createRecommendationAuditReport,
  formatRecommendationAuditReport
} from "./recommendation-audit-report.ts";

test("createRecommendationAuditReport summarizes recommendation trace and fulfillment match", () => {
  const scenario = fulfillmentScenarioFixtures.find((item) => item.id === "exceeds-long-run-cap")!;
  const result = runFulfillmentScenario(scenario);
  const report = createRecommendationAuditReport({
    trace: result.trace,
    match: result.match,
    createdAt: "2026-06-16T12:00:00.000Z"
  });

  assert.equal(report.schemaVersion, "1");
  assert.equal(report.traceId, "exceeds-long-run-cap-trace");
  assert.equal(report.createdAt, "2026-06-16T12:00:00.000Z");
  assert.equal(report.question, "Should I stretch the long run?");
  assert.match(report.recommendationSummary, /Cap the long run at 13 miles/);
  assert.equal(report.expectedAction.intent, "long_run");
  assert.match(report.expectedAction.exposure, /13/);
  assert.equal(report.fulfillmentStatus, "chose_opposite_side");
  assert.match(report.actualAction.summary, /15 mi/);
  assert.equal(report.learningEligible, false);
});

test("scenario audit reports include tension evidence provenance and caveats", () => {
  const results = runFulfillmentScenarios(fulfillmentScenarioFixtures);

  for (const result of results) {
    const report = createRecommendationAuditReport({
      trace: result.trace,
      match: result.match,
      createdAt: result.scenario.asOfDate
    });

    assert.match(report.recommendationSummary, /\w/);
    assert.notEqual(report.expectedAction.exposure, "No expected exposure was recorded.");
    assert.equal(report.fulfillmentStatus, result.scenario.expectedFulfillment);
    assert.equal(report.learningEligible, false);
    assert.ok(report.tensionSummary.length > 0);
    assert.ok(report.tensionSummary.every((tension) => tension.evidence.some((evidence) => evidence.source === "scenario_fixture")));
    assert.ok(report.evidence.some((line) => line.includes(`Trace target intent: ${result.trace.targetIntent}`)));
    assert.ok(report.caveats.includes("No Runner Tension Model evidence was created or updated."));
    assert.ok(report.caveats.includes("No automatic learning is performed from this report."));
  }
});

test("formatRecommendationAuditReport renders stable human-readable report", () => {
  const result = runFulfillmentScenario(
    fulfillmentScenarioFixtures.find((scenario) => scenario.id === "long-run-ramp-shifted")!
  );
  const report = createRecommendationAuditReport({
    trace: result.trace,
    match: result.match,
    createdAt: result.scenario.asOfDate
  });
  const formatted = formatRecommendationAuditReport(report);

  assert.match(formatted, /RECOMMENDATION AUDIT REPORT/);
  assert.match(formatted, /Question: Can I move the long run\?/);
  assert.match(formatted, /Expected: long_run/);
  assert.match(formatted, /Fulfillment: shifted_but_aligned/);
  assert.match(formatted, /ambition_identity_vs_current_evidence/);
  assert.match(formatted, /scenario_fixture/);
  assert.match(formatted, /Learning eligible: no/);
  assert.match(formatted, /No Runner Tension Model evidence was created or updated/);
});

test("audit report does not mutate scenario app data or create tension evidence", () => {
  const result = runFulfillmentScenario(
    fulfillmentScenarioFixtures.find((scenario) => scenario.id === "pain-risk-rest-conservative")!
  );
  const beforeEvidenceCount = result.appData.runnerTensionModel?.evidence.length;

  createRecommendationAuditReport({
    trace: result.trace,
    match: result.match,
    createdAt: result.scenario.asOfDate
  });

  assert.equal(result.appData.runnerTensionModel?.evidence.length, beforeEvidenceCount);
  assert.ok(result.appData.runnerTensionModel?.evidence.every((event) => event.source === "scenario_fixture"));
});
