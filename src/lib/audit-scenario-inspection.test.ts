import assert from "node:assert/strict";
import test from "node:test";
import {
  createScenarioAuditInspections,
  formatScenarioAuditInspection,
  formatScenarioAuditInspections
} from "./audit-scenario-inspection.ts";
import { fulfillmentScenarioFixtures } from "./fulfillment-scenarios.ts";

test("scenario audit inspection covers all synthetic fixtures", () => {
  const inspections = createScenarioAuditInspections();

  assert.equal(inspections.length, 5);
  assert.deepEqual(
    inspections.map((inspection) => inspection.scenario.id),
    fulfillmentScenarioFixtures.map((scenario) => scenario.id)
  );
  assert.ok(inspections.every((inspection) => inspection.report.learningEligible === false));
});

test("scenario audit inspection output includes key human review fields", () => {
  const formatted = formatScenarioAuditInspections();

  for (const scenario of fulfillmentScenarioFixtures) {
    assert.match(formatted, new RegExp(`SCENARIO: ${scenario.id}`));
    assert.match(formatted, new RegExp(`Title: ${escapeRegExp(scenario.title)}`));
    assert.match(formatted, new RegExp(`Question: ${escapeRegExp(scenario.trace.question)}`));
    assert.match(formatted, new RegExp(`Fulfillment: ${scenario.expectedFulfillment}`));
  }

  assert.match(formatted, /Recommendation:/);
  assert.match(formatted, /Expected:/);
  assert.match(formatted, /Actual:/);
  assert.match(formatted, /Tensions:/);
  assert.match(formatted, /scenario_fixture/);
  assert.match(formatted, /Evidence:/);
  assert.match(formatted, /Caveats:/);
  assert.match(formatted, /Learning eligible: no/);
  assert.match(formatted, /No Runner Tension Model evidence was created or updated/);
  assert.match(formatted, /No automatic learning is performed from this report/);
});

test("single scenario audit inspection output is readable without brittle full-line matching", () => {
  const [inspection] = createScenarioAuditInspections();
  const formatted = formatScenarioAuditInspection(inspection);

  assert.match(formatted, /^SCENARIO: exceeds-long-run-cap/m);
  assert.match(formatted, /RECOMMENDATION AUDIT REPORT/);
  assert.match(formatted, /Cap the long run at 13 miles/);
  assert.match(formatted, /Expected: long_run; up to 13 mi/);
  assert.match(formatted, /Actual: .*15 mi/);
  assert.match(formatted, /health_protection_vs_performance_ambition/);
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
