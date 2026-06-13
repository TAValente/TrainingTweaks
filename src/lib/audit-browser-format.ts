import type { RecommendationAuditReport } from "./recommendation-audit-report.ts";
import type { RunnerTensionSide } from "./types.ts";

type AuditTension = RecommendationAuditReport["tensionSummary"][number];
type AuditTensionEvidence = AuditTension["evidence"][number];

export function labelForAuditTensionSide(tension: AuditTension, side: RunnerTensionSide | undefined) {
  if (!side) return "unknown";
  if (!tension.posture) return side;
  return side === "left" ? tension.posture.leftLabel : tension.posture.rightLabel;
}

export function auditTensionPostureLabel(tension: AuditTension) {
  const posture = tension.posture;
  if (!posture) return "Current posture: no posture available";

  if (posture.leaning === "mixed") return `Current posture: mixed, ${posture.confidence} confidence`;
  if (posture.leaning === "unknown") return `Current posture: unknown, ${posture.confidence} confidence`;

  return `Current posture: ${labelForAuditTensionSide(tension, posture.leaning)}, ${posture.confidence} confidence`;
}

export function auditTensionRecommendationLabel(tension: AuditTension) {
  return [
    `Recommended ${labelForAuditTensionSide(tension, tension.recommendedSide)}`,
    tension.discouragedSide ? `discouraged ${labelForAuditTensionSide(tension, tension.discouragedSide)}` : undefined,
    tension.alternativeSide ? `alternative ${labelForAuditTensionSide(tension, tension.alternativeSide)}` : undefined
  ]
    .filter(Boolean)
    .join("; ");
}

export function auditTensionEvidenceLabel(tension: AuditTension, evidence: AuditTensionEvidence) {
  return `${evidence.source}; ${labelForAuditTensionSide(tension, evidence.side)}; weight ${evidence.effectiveWeight}: ${evidence.summary}`;
}
