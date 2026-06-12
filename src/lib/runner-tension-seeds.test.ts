import assert from "node:assert/strict";
import test from "node:test";
import {
  addRunnerTensionSeed,
  addRunnerTensionSeeds,
  createRunnerTensionSeedEvidence
} from "./runner-tension-seeds.ts";
import { computeRunnerTensionSnapshot, TENSION_DECAY_MODEL_V1 } from "./runner-tension.ts";
import type { AppData } from "./types.ts";

const asOfDate = new Date("2026-06-12T12:00:00.000Z");

test("createRunnerTensionSeedEvidence creates explicit manual_seed evidence with provenance metadata", () => {
  const event = createRunnerTensionSeedEvidence(
    {
      id: "seed-1",
      tensionId: "health_protection_vs_performance_ambition",
      side: "left",
      provenance: "manual_seed",
      confidence: "medium",
      amplitude: 1.4,
      rationale: "Manual seed: runner wants health protection for this block.",
      runnerId: "runner-1"
    },
    asOfDate
  );

  assert.equal(event.id, "seed-1");
  assert.equal(event.source, "manual_seed");
  assert.equal(event.amplitude, 1);
  assert.equal(event.confidence, "medium");
  assert.equal(event.summary, "Manual seed: runner wants health protection for this block.");
  assert.equal(event.decayModelVersion, TENSION_DECAY_MODEL_V1.version);
  assert.deepEqual(event.metadata, {
    seedProvenance: "manual_seed",
    runnerId: "runner-1",
    scenarioId: undefined,
    learning: false
  });
});

test("addRunnerTensionSeed initializes app data and affects computed snapshot", () => {
  const appData: AppData = { activities: [] };
  const updated = addRunnerTensionSeed(
    appData,
    {
      tensionId: "structure_guidance_vs_flexibility_autonomy",
      side: "left",
      provenance: "manual_seed",
      rationale: "Manual seed: runner wants firm guardrails."
    },
    asOfDate
  );
  const snapshot = computeRunnerTensionSnapshot(updated.runnerTensionModel, asOfDate);
  const posture = snapshot.postures.find((item) => item.tensionId === "structure_guidance_vs_flexibility_autonomy");

  assert.equal(updated.runnerTensionModel?.evidence.length, 1);
  assert.equal(posture?.leaning, "left");
  assert.equal(posture?.strongestEvidence[0]?.source, "manual_seed");
});

test("addRunnerTensionSeeds preserves scenario_fixture provenance across multiple seeds", () => {
  const updated = addRunnerTensionSeeds(
    { activities: [] },
    [
      {
        tensionId: "health_protection_vs_performance_ambition",
        side: "left",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: protect health.",
        scenarioId: "scenario-a"
      },
      {
        tensionId: "plan_adherence_vs_reality_adaptation",
        side: "right",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: adapt reality.",
        scenarioId: "scenario-a"
      }
    ],
    asOfDate
  );

  assert.equal(updated.runnerTensionModel?.evidence.length, 2);
  assert.ok(updated.runnerTensionModel?.evidence.every((event) => event.source === "scenario_fixture"));
  assert.ok(updated.runnerTensionModel?.evidence.every((event) => event.metadata?.learning === false));
});
