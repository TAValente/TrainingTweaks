import {
  runFulfillmentScenario,
  type FulfillmentScenarioFixture,
  type FulfillmentScenarioResult
} from "./fulfillment-scenario-harness.ts";
import { fulfillmentScenarioFixtures } from "./fulfillment-scenarios.ts";
import {
  createRecommendationAuditReport,
  formatRecommendationAuditReport,
  type RecommendationAuditReport
} from "./recommendation-audit-report.ts";

export type ScenarioAuditInspection = {
  scenario: FulfillmentScenarioFixture;
  result: FulfillmentScenarioResult;
  report: RecommendationAuditReport;
};

export function createScenarioAuditInspection(scenario: FulfillmentScenarioFixture): ScenarioAuditInspection {
  const result = runFulfillmentScenario(scenario);
  const report = createRecommendationAuditReport({
    trace: result.trace,
    match: result.match,
    createdAt: scenario.asOfDate
  });

  return {
    scenario,
    result,
    report
  };
}

export function createScenarioAuditInspections(scenarios = fulfillmentScenarioFixtures) {
  return scenarios.map(createScenarioAuditInspection);
}

export function formatScenarioAuditInspection(inspection: ScenarioAuditInspection) {
  return [
    `SCENARIO: ${inspection.scenario.id}`,
    `Title: ${inspection.scenario.title}`,
    "",
    formatRecommendationAuditReport(inspection.report)
  ].join("\n");
}

export function formatScenarioAuditInspections(inspections = createScenarioAuditInspections()) {
  return inspections.map(formatScenarioAuditInspection).join("\n\n---\n\n");
}
