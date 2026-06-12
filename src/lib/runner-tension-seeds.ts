import { addTensionEvidence, createTensionEvidenceEvent } from "./runner-tension.ts";
import type {
  AppData,
  RunnerTensionId,
  RunnerTensionSide,
  TensionEvidenceConfidence,
  TensionEvidenceEvent
} from "./types.ts";

export type RunnerTensionSeedProvenance = "manual_seed" | "scenario_fixture";

export type RunnerTensionSeedInput = {
  tensionId: RunnerTensionId;
  side: RunnerTensionSide;
  provenance: RunnerTensionSeedProvenance;
  confidence?: TensionEvidenceConfidence;
  amplitude?: number;
  rationale: string;
  createdAt?: string;
  id?: string;
  runnerId?: string;
  scenarioId?: string;
  metadata?: Record<string, unknown>;
};

export function createRunnerTensionSeedEvidence(
  input: RunnerTensionSeedInput,
  now = new Date()
): TensionEvidenceEvent {
  return createTensionEvidenceEvent(
    {
      id: input.id,
      tensionId: input.tensionId,
      side: input.side,
      source: input.provenance,
      confidence: input.confidence ?? "high",
      amplitude: input.amplitude ?? 1,
      summary: input.rationale,
      createdAt: input.createdAt,
      metadata: {
        ...input.metadata,
        seedProvenance: input.provenance,
        runnerId: input.runnerId,
        scenarioId: input.scenarioId,
        learning: false
      }
    },
    now
  );
}

export function addRunnerTensionSeed(appData: AppData, input: RunnerTensionSeedInput, now = new Date()): AppData {
  const event = createRunnerTensionSeedEvidence(input, now);
  return addTensionEvidence(appData, event, now);
}

export function addRunnerTensionSeeds(
  appData: AppData,
  inputs: RunnerTensionSeedInput[],
  now = new Date()
): AppData {
  return inputs.reduce((current, input) => addRunnerTensionSeed(current, input, now), appData);
}
