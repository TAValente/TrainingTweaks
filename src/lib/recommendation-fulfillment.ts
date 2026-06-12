import { randomUUID } from "node:crypto";
import type {
  ActualFulfillment,
  DecisionTensionTrace,
  JsonValue,
  RecommendationFulfillmentTrace,
  RecommendationIntent,
  RecommendedExposure,
  RunnerTensionSnapshot,
  ScheduleTolerance
} from "./types.ts";

export const RECOMMENDATION_INTENTS = [
  "long_run",
  "easy_run",
  "recovery_run",
  "workout",
  "rest",
  "cross_train",
  "delay_decision",
  "adjust_week",
  "unknown"
] as const satisfies readonly RecommendationIntent[];

export const SCHEDULE_TOLERANCES = [
  "same_day",
  "next_day",
  "same_training_week",
  "same_microcycle",
  "flexible",
  "unknown"
] as const satisfies readonly ScheduleTolerance[];

export const ACTUAL_FULFILLMENTS = [
  "unknown",
  "fulfilled",
  "shifted_but_aligned",
  "modified_but_aligned",
  "accepted_alternative",
  "chose_opposite_side",
  "skipped",
  "not_enough_data"
] as const satisfies readonly ActualFulfillment[];

export type RecommendationFulfillmentTraceInput = {
  id?: string;
  createdAt?: string;
  question: string;
  recommendedActionSummary?: string;
  targetIntent?: RecommendationIntent;
  expectedExposure?: RecommendedExposure;
  acceptableSubstitutions?: string[];
  scheduleTolerance?: RecommendationFulfillmentTrace["scheduleTolerance"];
  notAlignedIf?: string[];
  tensionTraces?: DecisionTensionTrace[];
  runnerTensionSnapshot: RunnerTensionSnapshot;
  expectedRiskContext?: unknown;
  actualExposure?: unknown;
  actualFulfillment?: ActualFulfillment;
};

export function createRecommendationFulfillmentTrace(
  input: RecommendationFulfillmentTraceInput,
  now = new Date()
): RecommendationFulfillmentTrace {
  const targetIntent = input.targetIntent ?? "unknown";
  const actualFulfillment = input.actualFulfillment ?? "unknown";
  validateEnum("recommendation intent", targetIntent, RECOMMENDATION_INTENTS);
  validateEnum("actual fulfillment", actualFulfillment, ACTUAL_FULFILLMENTS);
  if (input.scheduleTolerance) {
    validateEnum("schedule tolerance", input.scheduleTolerance.type, SCHEDULE_TOLERANCES);
  }

  return {
    schemaVersion: "1",
    id: input.id ?? randomUUID(),
    createdAt: input.createdAt ?? now.toISOString(),
    question: input.question,
    recommendedActionSummary: input.recommendedActionSummary,
    targetIntent,
    expectedExposure: input.expectedExposure,
    acceptableSubstitutions: input.acceptableSubstitutions,
    scheduleTolerance: input.scheduleTolerance,
    notAlignedIf: input.notAlignedIf,
    tensionTraces: input.tensionTraces ?? [],
    runnerTensionSnapshot: input.runnerTensionSnapshot,
    expectedRiskContext: input.expectedRiskContext,
    actualExposure: input.actualExposure,
    actualFulfillment
  };
}

export function defaultRecommendationFulfillmentTraceForModelRun(input: {
  question: string;
  runnerTensionSnapshot: RunnerTensionSnapshot;
  runningContext?: JsonValue;
  createdAt?: string;
}) {
  return createRecommendationFulfillmentTrace({
    question: input.question,
    createdAt: input.createdAt,
    runnerTensionSnapshot: input.runnerTensionSnapshot,
    expectedRiskContext: expectedRiskContextFromRunningContext(input.runningContext)
  });
}

function expectedRiskContextFromRunningContext(runningContext: JsonValue | undefined) {
  if (!runningContext || typeof runningContext !== "object" || Array.isArray(runningContext)) return undefined;
  const context = runningContext as Record<string, unknown>;

  return {
    loadRiskContext: context.loadRiskContext,
    riskFindings: context.riskFindings,
    activePlanSnapshot: context.activePlanSnapshot,
    structuredTrainingPlan: context.structuredTrainingPlan
  };
}

function validateEnum<T extends string>(label: string, value: T, allowed: readonly T[]) {
  if (!allowed.includes(value)) throw new Error(`Unknown ${label}: ${value}`);
}
