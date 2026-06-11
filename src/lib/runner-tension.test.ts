import assert from "node:assert/strict";
import test from "node:test";
import { buildUserContent } from "./ai.ts";
import { redactModelRun } from "./model-runs.ts";
import {
  addTensionEvidence,
  computeRunnerTensionSnapshot,
  effectiveTensionEvidenceWeight,
  runnerTensionSnapshotForPrompt,
  TENSION_DECAY_MODEL_V1
} from "./runner-tension.ts";
import { contextForPrompt } from "./summary.ts";
import type { AppData, RunnerTensionModel, StoredModelRun, TensionEvidenceEvent, TrainingContext } from "./types.ts";

const asOfDate = new Date("2026-06-11T12:00:00.000Z");

test("default empty RunnerTensionModel produces unknown none posture for all v1 tensions", () => {
  const snapshot = computeRunnerTensionSnapshot(undefined, asOfDate);

  assert.equal(snapshot.schemaVersion, "1");
  assert.equal(snapshot.decayModelVersion, TENSION_DECAY_MODEL_V1.version);
  assert.equal(snapshot.postures.length, 6);
  assert.ok(snapshot.postures.every((posture) => posture.leaning === "unknown"));
  assert.ok(snapshot.postures.every((posture) => posture.confidence === "none"));
});

test("addTensionEvidence validates clamps initializes and appends events", () => {
  const appData: AppData = { activities: [] };
  const updated = addTensionEvidence(appData, {
    tensionId: "health_protection_vs_performance_ambition",
    side: "left",
    source: "explicit_user",
    confidence: "high",
    amplitude: 2,
    summary: "Finish healthy matters most."
  }, asOfDate);

  const event = updated.runnerTensionModel?.evidence[0];
  assert.ok(event);
  assert.equal(updated.runnerTensionModel?.schemaVersion, "1");
  assert.equal(event.amplitude, 1);
  assert.equal(event.createdAt, asOfDate.toISOString());
  assert.equal(event.decayModelVersion, TENSION_DECAY_MODEL_V1.version);
  assert.throws(
    () =>
      addTensionEvidence(appData, {
        tensionId: "not_real",
        side: "left",
        source: "explicit_user",
        confidence: "high",
        amplitude: 1,
        summary: "Bad"
      } as never),
    /Unknown runner tension id/
  );
});

test("exponential decay uses versioned half-life parameters", () => {
  const event = evidence({
    source: "explicit_user",
    createdAt: "2026-02-11T12:00:00.000Z",
    amplitude: 1
  });

  assert.equal(event.decayModelVersion, TENSION_DECAY_MODEL_V1.version);
  assert.ok(Math.abs(effectiveTensionEvidenceWeight(event, asOfDate) - 0.5) < 0.0001);
});

test("explicit_user evidence decays slower and weighs more than question_history", () => {
  const createdAt = "2026-05-12T12:00:00.000Z";
  const explicit = evidence({ source: "explicit_user", createdAt });
  const questionHistory = evidence({ source: "question_history", createdAt });

  assert.ok(effectiveTensionEvidenceWeight(explicit, asOfDate) > effectiveTensionEvidenceWeight(questionHistory, asOfDate));
});

test("contrary evidence produces mixed posture when both sides have meaningful active weight", () => {
  const snapshot = computeRunnerTensionSnapshot({
    schemaVersion: "1",
    evidence: [
      evidence({ side: "left", source: "explicit_user", summary: "I want to finish healthy." }),
      evidence({ side: "right", source: "observed_behavior", summary: "Accepted an aggressive long-run jump." })
    ]
  }, asOfDate);

  const posture = snapshot.postures.find((item) => item.tensionId === "health_protection_vs_performance_ambition");
  assert.equal(posture?.leaning, "mixed");
  assert.ok(posture?.strongestEvidence.some((item) => item.side === "left"));
  assert.ok(posture?.strongestEvidence.some((item) => item.side === "right"));
});

test("tiny effective signals are excluded from prompt rendering but retained in evidence", () => {
  const model: RunnerTensionModel = {
    schemaVersion: "1",
    evidence: [
      evidence({
        source: "question_history",
        confidence: "low",
        amplitude: 0.1,
        summary: "A tiny old hint.",
        createdAt: "2026-01-01T12:00:00.000Z"
      })
    ]
  };

  const snapshot = computeRunnerTensionSnapshot(model, asOfDate);
  const prompt = runnerTensionSnapshotForPrompt(snapshot);

  assert.equal(model.evidence.length, 1);
  assert.doesNotMatch(prompt, /tiny old hint/i);
  assert.equal(prompt, "Runner Tension Model: no durable runner-specific tension evidence yet.");
});

test("runnerTensionSnapshotForPrompt includes guardrails and human-readable tension labels", () => {
  const snapshot = computeRunnerTensionSnapshot({
    schemaVersion: "1",
    evidence: [evidence({ summary: "Finish healthy matters most." })]
  }, asOfDate);
  const prompt = runnerTensionSnapshotForPrompt(snapshot);

  assert.match(prompt, /RUNNER TENSION MODEL/);
  assert.match(prompt, /Do not let it override deterministic risk findings/);
  assert.match(prompt, /not a personality profile/i);
  assert.match(prompt, /The runner decides/);
  assert.match(prompt, /Health\/protection vs Performance\/ambition/);
});

test("runnerTensionSnapshotForPrompt renders empty model compactly", () => {
  const snapshot = computeRunnerTensionSnapshot(undefined, asOfDate);
  const prompt = runnerTensionSnapshotForPrompt(snapshot);

  assert.equal(prompt, "Runner Tension Model: no durable runner-specific tension evidence yet.");
});

test("contextForPrompt includes RunnerTensionSnapshot", () => {
  const context = contextForPrompt([], {}, "Should I run?", asOfDate, {
    schemaVersion: "1",
    evidence: [evidence({ summary: "Finish healthy matters most." })]
  });

  assert.equal(context.runnerTensionSnapshot.schemaVersion, "1");
  assert.equal(context.runnerTensionSnapshot.postures.length, 6);
});

test("buildUserContent includes Runner Tension Model context", () => {
  const runningContext = contextForPrompt([], {}, "Should I run?", asOfDate, {
    schemaVersion: "1",
    evidence: [evidence({ summary: "Finish healthy matters most." })]
  });
  const content = buildUserContent({}, "Should I run?", runningContext);

  assert.match(content, /Runner tension model:/);
  assert.match(content, /RUNNER TENSION MODEL/);
  assert.match(content, /Finish healthy matters most/);
});

test("StoredModelRun preserves the RunnerTensionSnapshot used at answer time", () => {
  const runnerTensionSnapshot = computeRunnerTensionSnapshot({
    schemaVersion: "1",
    evidence: [evidence({ summary: "Finish healthy matters most." })]
  }, asOfDate);
  const modelRun: StoredModelRun = {
    id: "run-1",
    timestamp: asOfDate.toISOString(),
    question: "Should I run?",
    trainingContext: {},
    runnerTensionSnapshot,
    runningContext: { runnerTensionSnapshot }
  };

  assert.deepEqual(redactModelRun(modelRun).runnerTensionSnapshot, runnerTensionSnapshot);
});

test("free-text training context is not parsed into tension evidence", () => {
  const trainingContext: TrainingContext = {
    goalsContext: "I want to finish healthy.",
    planContext: "I like adapting plans.",
    subjectiveContext: "I feel tempted to push."
  };
  const context = contextForPrompt([], trainingContext, "Should I run?", asOfDate);

  assert.ok(context.runnerTensionSnapshot.postures.every((posture) => posture.leaning === "unknown"));
  assert.ok(context.runnerTensionSnapshot.postures.every((posture) => posture.strongestEvidence.length === 0));
});

function evidence(overrides: Partial<TensionEvidenceEvent> = {}): TensionEvidenceEvent {
  return {
    id: overrides.id ?? `event-${Math.random()}`,
    tensionId: overrides.tensionId ?? "health_protection_vs_performance_ambition",
    side: overrides.side ?? "left",
    source: overrides.source ?? "explicit_user",
    confidence: overrides.confidence ?? "high",
    amplitude: overrides.amplitude ?? 1,
    summary: overrides.summary ?? "Evidence summary.",
    createdAt: overrides.createdAt ?? asOfDate.toISOString(),
    decayModelVersion: overrides.decayModelVersion ?? TENSION_DECAY_MODEL_V1.version,
    metadata: overrides.metadata
  };
}
