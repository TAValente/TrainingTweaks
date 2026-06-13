import assert from "node:assert/strict";
import test from "node:test";
import {
  auditTensionEvidenceLabel,
  auditTensionPostureLabel,
  auditTensionRecommendationLabel,
  labelForAuditTensionSide
} from "./audit-browser-format.ts";
import { createScenarioAuditInspections } from "./audit-scenario-inspection.ts";

test("browser audit labels tension sides with human-readable posture labels", () => {
  const inspection = createScenarioAuditInspections().find(
    (candidate) => candidate.scenario.id === "exceeds-long-run-cap"
  )!;
  const [tension] = inspection.report.tensionSummary;
  const [evidence] = tension.evidence;

  assert.equal(labelForAuditTensionSide(tension, tension.recommendedSide), "Health/protection");
  assert.match(auditTensionRecommendationLabel(tension), /Recommended Health\/protection/);
  assert.match(auditTensionRecommendationLabel(tension), /discouraged Performance\/ambition/);
  assert.equal(auditTensionPostureLabel(tension), "Current posture: Performance/ambition, medium confidence");
  assert.match(auditTensionEvidenceLabel(tension, evidence), /scenario_fixture; Performance\/ambition; weight 1/);
});

test("browser audit falls back to raw sides when posture labels are unavailable", () => {
  const inspection = createScenarioAuditInspections()[0];
  const tension = {
    ...inspection.report.tensionSummary[0],
    posture: undefined
  };

  assert.equal(labelForAuditTensionSide(tension, "left"), "left");
  assert.equal(auditTensionPostureLabel(tension), "Current posture: no posture available");
});

test("scenario audit reports expose schedule tolerance for browser rendering", () => {
  const inspection = createScenarioAuditInspections().find(
    (candidate) => candidate.scenario.id === "long-run-ramp-shifted"
  )!;

  assert.equal(inspection.report.expectedAction.scheduleTolerance, "next_day");
});
