import type { FulfillmentMatchResult } from "./fulfillment-matching.ts";
import type {
  ActualFulfillment,
  RecommendationFulfillmentTrace,
  RunnerTensionPosture,
  RunnerTensionSide
} from "./types.ts";

export type RecommendationAuditReport = {
  schemaVersion: "1";
  traceId: string;
  createdAt: string;
  question: string;
  recommendationSummary: string;
  expectedAction: {
    intent: RecommendationFulfillmentTrace["targetIntent"];
    exposure: string;
    scheduleTolerance?: string;
    acceptableSubstitutions: string[];
    notAlignedIf: string[];
  };
  actualAction: {
    summary: string;
    exposure?: FulfillmentMatchResult["actualExposure"];
  };
  fulfillmentStatus: ActualFulfillment;
  tensionSummary: Array<{
    tensionId: string;
    recommendedSide?: RunnerTensionSide;
    alternativeSide?: RunnerTensionSide;
    discouragedSide?: RunnerTensionSide;
    rationale?: string;
    posture?: {
      leaning: RunnerTensionPosture["leaning"];
      confidence: RunnerTensionPosture["confidence"];
      leftLabel: string;
      rightLabel: string;
    };
    evidence: Array<{
      side: RunnerTensionSide;
      source: string;
      summary: string;
      effectiveWeight: number;
      createdAt: string;
    }>;
  }>;
  evidence: string[];
  caveats: string[];
  learningEligible: false;
};

export function createRecommendationAuditReport(input: {
  trace: RecommendationFulfillmentTrace;
  match: FulfillmentMatchResult;
  createdAt?: string;
}): RecommendationAuditReport {
  const { trace, match } = input;

  return {
    schemaVersion: "1",
    traceId: trace.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    question: trace.question,
    recommendationSummary: trace.recommendedActionSummary ?? "No recommendation summary was recorded.",
    expectedAction: {
      intent: trace.targetIntent,
      exposure: exposureSummary(trace),
      scheduleTolerance: scheduleToleranceSummary(trace),
      acceptableSubstitutions: trace.acceptableSubstitutions ?? [],
      notAlignedIf: trace.notAlignedIf ?? []
    },
    actualAction: {
      summary: actualActionSummary(match),
      exposure: match.actualExposure
    },
    fulfillmentStatus: match.actualFulfillment,
    tensionSummary: trace.tensionTraces.map((tensionTrace) => {
      const posture = trace.runnerTensionSnapshot.postures.find(
        (candidate) => candidate.tensionId === tensionTrace.tensionId
      );

      return {
        tensionId: tensionTrace.tensionId,
        recommendedSide: tensionTrace.recommendedSide,
        alternativeSide: tensionTrace.alternativeSide,
        discouragedSide: tensionTrace.discouragedSide,
        rationale: tensionTrace.rationale,
        posture: posture
          ? {
              leaning: posture.leaning,
              confidence: posture.confidence,
              leftLabel: posture.leftLabel,
              rightLabel: posture.rightLabel
            }
          : undefined,
        evidence:
          posture?.strongestEvidence.map((item) => ({
            side: item.side,
            source: item.source,
            summary: item.summary,
            effectiveWeight: item.effectiveWeight,
            createdAt: item.createdAt
          })) ?? []
      };
    }),
    evidence: evidenceLines(trace, match),
    caveats: caveatsFor(trace, match),
    learningEligible: false
  };
}

export function formatRecommendationAuditReport(report: RecommendationAuditReport) {
  const lines = [
    "RECOMMENDATION AUDIT REPORT",
    `Trace: ${report.traceId}`,
    `Question: ${report.question}`,
    `Recommendation: ${report.recommendationSummary}`,
    `Expected: ${report.expectedAction.intent}; ${report.expectedAction.exposure}`,
    `Actual: ${report.actualAction.summary}`,
    `Fulfillment: ${report.fulfillmentStatus}`,
    `Learning eligible: ${report.learningEligible ? "yes" : "no"}`,
    "",
    "Tensions:"
  ];

  if (!report.tensionSummary.length) {
    lines.push("- none recorded");
  } else {
    for (const tension of report.tensionSummary) {
      const posture = tension.posture
        ? `${tension.posture.leaning}, ${tension.posture.confidence} confidence`
        : "no posture available";
      lines.push(
        `- ${tension.tensionId}: recommended ${tension.recommendedSide ?? "unknown"} (${posture})${
          tension.rationale ? `; ${tension.rationale}` : ""
        }`
      );
      for (const evidence of tension.evidence) {
        lines.push(`  evidence: ${evidence.source} ${evidence.side} (${evidence.effectiveWeight}): ${evidence.summary}`);
      }
    }
  }

  lines.push("", "Evidence:");
  report.evidence.forEach((item) => lines.push(`- ${item}`));
  lines.push("", "Caveats:");
  report.caveats.forEach((item) => lines.push(`- ${item}`));

  return lines.join("\n");
}

function exposureSummary(trace: RecommendationFulfillmentTrace) {
  const exposure = trace.expectedExposure;
  if (!exposure) return "No expected exposure was recorded.";

  const parts = [
    exposure.targetMiles !== undefined ? `${exposure.targetMiles} mi target` : undefined,
    exposure.minMiles !== undefined || exposure.maxMiles !== undefined
      ? rangeSummary(exposure.minMiles, exposure.maxMiles, "mi")
      : undefined,
    exposure.durationMinutes !== undefined ? `${exposure.durationMinutes} min target` : undefined,
    exposure.minDurationMinutes !== undefined || exposure.maxDurationMinutes !== undefined
      ? rangeSummary(exposure.minDurationMinutes, exposure.maxDurationMinutes, "min")
      : undefined,
    exposure.intensity ? `${exposure.intensity} intensity` : undefined,
    exposure.avoidIntensity ? "avoid intensity" : undefined,
    exposure.notes
  ].filter(Boolean);

  return parts.length ? parts.join("; ") : "Expected exposure was present but did not include concrete fields.";
}

function rangeSummary(min: number | undefined, max: number | undefined, unit: string) {
  if (min !== undefined && max !== undefined) return `${min}-${max} ${unit}`;
  if (min !== undefined) return `at least ${min} ${unit}`;
  if (max !== undefined) return `up to ${max} ${unit}`;
  return undefined;
}

function scheduleToleranceSummary(trace: RecommendationFulfillmentTrace) {
  if (!trace.scheduleTolerance) return undefined;
  return [
    trace.scheduleTolerance.type,
    trace.scheduleTolerance.latestDate ? `latest ${trace.scheduleTolerance.latestDate}` : undefined,
    trace.scheduleTolerance.notes
  ]
    .filter(Boolean)
    .join("; ");
}

function actualActionSummary(match: FulfillmentMatchResult) {
  const exposure = match.actualExposure;
  if (!exposure) return `No concrete actual exposure was matched. Matcher rationale: ${match.rationale}`;

  const parts = [
    exposure.completedAt ? `completed at ${exposure.completedAt}` : undefined,
    exposure.miles !== undefined ? `${exposure.miles} mi` : undefined,
    exposure.durationMinutes !== undefined ? `${exposure.durationMinutes} min` : undefined,
    exposure.intensity ? `${exposure.intensity} intensity` : undefined,
    exposure.notes
  ].filter(Boolean);

  return parts.join("; ");
}

function evidenceLines(trace: RecommendationFulfillmentTrace, match: FulfillmentMatchResult) {
  const lines = [
    `Trace target intent: ${trace.targetIntent}.`,
    `Matcher confidence: ${match.confidence}.`,
    `Matcher rationale: ${sentence(match.rationale)}`
  ];

  if (trace.notAlignedIf?.length) lines.push(`Not aligned if: ${trace.notAlignedIf.join("; ")}.`);
  if (trace.acceptableSubstitutions?.length) {
    lines.push(`Acceptable substitutions: ${trace.acceptableSubstitutions.join("; ")}.`);
  }
  if (match.actualExposure?.activityIds?.length) {
    lines.push(`Matched activities: ${match.actualExposure.activityIds.join(", ")}.`);
  }

  return lines;
}

function sentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function caveatsFor(trace: RecommendationFulfillmentTrace, match: FulfillmentMatchResult) {
  const caveats = [
    "Audit report is deterministic and read-only.",
    "No Runner Tension Model evidence was created or updated.",
    "No automatic learning is performed from this report."
  ];

  if (match.actualFulfillment === "unknown" || match.actualFulfillment === "not_enough_data") {
    caveats.push("Fulfillment remains unresolved or insufficiently observed.");
  }
  if (!trace.tensionTraces.length) caveats.push("No tension traces were recorded for this recommendation.");
  if (!match.actualExposure) caveats.push("No actual exposure summary is available.");

  return caveats;
}
