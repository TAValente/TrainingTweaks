import { matchRecommendationFulfillment, type FulfillmentMatchResult } from "./fulfillment-matching.ts";
import { createRecommendationFulfillmentTrace } from "./recommendation-fulfillment.ts";
import { computeRunnerTensionSnapshot } from "./runner-tension.ts";
import { addRunnerTensionSeeds, type RunnerTensionSeedInput } from "./runner-tension-seeds.ts";
import type {
  Activity,
  AppData,
  RecommendationFulfillmentTrace,
  RecommendationFulfillmentTrace as Trace,
  RunnerTensionId,
  RunnerTensionSide
} from "./types.ts";

export type FulfillmentScenarioFixture = {
  id: string;
  title: string;
  asOfDate: string;
  seeds: RunnerTensionSeedInput[];
  trace: Omit<
    Trace,
    "schemaVersion" | "id" | "createdAt" | "question" | "tensionTraces" | "runnerTensionSnapshot" | "actualFulfillment"
  > & {
    question: string;
    createdAt: string;
  };
  tensionTraces: Array<{
    tensionId: RunnerTensionId;
    recommendedSide: RunnerTensionSide;
    alternativeSide?: RunnerTensionSide;
    discouragedSide?: RunnerTensionSide;
    rationale?: string;
  }>;
  activities: Activity[];
  expectedFulfillment: FulfillmentMatchResult["actualFulfillment"];
};

export type FulfillmentScenarioResult = {
  scenario: FulfillmentScenarioFixture;
  appData: AppData;
  trace: RecommendationFulfillmentTrace;
  match: FulfillmentMatchResult;
};

export function runFulfillmentScenario(scenario: FulfillmentScenarioFixture): FulfillmentScenarioResult {
  const now = new Date(scenario.trace.createdAt);
  const appData = addRunnerTensionSeeds({ activities: [] }, scenario.seeds, now);
  const runnerTensionSnapshot = computeRunnerTensionSnapshot(appData.runnerTensionModel, now);
  const trace = createRecommendationFulfillmentTrace(
    {
      ...scenario.trace,
      id: `${scenario.id}-trace`,
      tensionTraces: scenario.tensionTraces,
      runnerTensionSnapshot
    },
    now
  );
  const match = matchRecommendationFulfillment({
    trace,
    activities: scenario.activities,
    asOfDate: new Date(scenario.asOfDate)
  });

  return {
    scenario,
    appData,
    trace,
    match
  };
}

export function assertScenarioUsesSeededTension(result: FulfillmentScenarioResult) {
  for (const seed of result.scenario.seeds) {
    const event = result.appData.runnerTensionModel?.evidence.find(
      (candidate) => candidate.tensionId === seed.tensionId && candidate.side === seed.side
    );
    const posture = result.trace.runnerTensionSnapshot.postures.find((candidate) => candidate.tensionId === seed.tensionId);
    const trace = result.trace.tensionTraces.find((candidate) => candidate.tensionId === seed.tensionId);

    if (!event) throw new Error(`Scenario ${result.scenario.id} did not seed ${seed.tensionId}.`);
    if (event.source !== seed.provenance) throw new Error(`Scenario ${result.scenario.id} lost seed provenance.`);
    if (!posture?.strongestEvidence.some((item) => item.source === seed.provenance && item.summary === seed.rationale)) {
      throw new Error(`Scenario ${result.scenario.id} snapshot did not include seeded evidence for ${seed.tensionId}.`);
    }
    if (!trace) throw new Error(`Scenario ${result.scenario.id} trace did not record ${seed.tensionId}.`);
  }
}

export function runFulfillmentScenarios(scenarios: FulfillmentScenarioFixture[]) {
  return scenarios.map(runFulfillmentScenario);
}
