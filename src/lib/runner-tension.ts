import { randomUUID } from "node:crypto";
import type {
  AppData,
  RunnerTensionId,
  RunnerTensionModel,
  RunnerTensionPosture,
  RunnerTensionSide,
  RunnerTensionSnapshot,
  TensionEvidenceConfidence,
  TensionEvidenceEvent,
  TensionEvidenceSource
} from "./types.ts";

export const TENSION_DECAY_MODEL_V1 = {
  version: "runner_tension_decay_v1",
  promptEvidenceThreshold: 0.05,
  sourceHalfLifeDays: {
    explicit_user: 120,
    manual_seed: 120,
    scenario_fixture: 120,
    manual_admin: 180,
    observed_behavior: 60,
    observed_outcome: 90,
    recommendation_trace: 45,
    question_history: 30
  },
  sourceWeights: {
    explicit_user: 1,
    manual_seed: 1,
    scenario_fixture: 1,
    manual_admin: 1,
    observed_behavior: 0.8,
    observed_outcome: 0.9,
    recommendation_trace: 0.4,
    question_history: 0.45
  },
  confidenceWeights: {
    low: 0.4,
    medium: 0.7,
    high: 1
  }
} as const;

export const RUNNER_TENSIONS: Array<{
  id: RunnerTensionId;
  leftLabel: string;
  rightLabel: string;
  meaning: string;
  recommendationImplication: string;
}> = [
  {
    id: "health_protection_vs_performance_ambition",
    leftLabel: "Health/protection",
    rightLabel: "Performance/ambition",
    meaning: "Protecting health, the build, and finishing healthy vs accepting training risk for performance or aggressive race goals.",
    recommendationImplication:
      "When proposed training risk is high, align the framing with the runner's durable tradeoff posture while preserving hard risk findings."
  },
  {
    id: "plan_adherence_vs_reality_adaptation",
    leftLabel: "Plan adherence",
    rightLabel: "Reality adaptation",
    meaning: "Following the plan closely vs adapting to recent training, fatigue, schedule, or risk.",
    recommendationImplication:
      "When the plan and recent reality conflict, explain whether preserving the plan or adapting it better matches the runner's posture."
  },
  {
    id: "consistency_momentum_vs_recovery_rest",
    leftLabel: "Consistency/momentum",
    rightLabel: "Recovery/rest",
    meaning: "Preserving habit and minimum viable movement vs protecting recovery and rest.",
    recommendationImplication:
      "When either a short run or rest could be reasonable, name the habit-versus-recovery tradeoff."
  },
  {
    id: "ambition_identity_vs_current_evidence",
    leftLabel: "Ambition/identity",
    rightLabel: "Current evidence",
    meaning: "Training like the runner the user wants to be vs respecting what current recent evidence supports.",
    recommendationImplication:
      "When self-image and current readiness diverge, ground the recommendation in recent evidence without dismissing ambition."
  },
  {
    id: "structure_guidance_vs_flexibility_autonomy",
    leftLabel: "Structure/guidance",
    rightLabel: "Flexibility/autonomy",
    meaning: "Wanting firm guidance and guardrails vs wanting flexible options and autonomy.",
    recommendationImplication:
      "Choose firmer wording or option-oriented wording based on the runner's durable preference."
  },
  {
    id: "short_term_relief_vs_long_term_goal",
    leftLabel: "Short-term relief",
    rightLabel: "Long-term goal",
    meaning: "Optimizing today's relief, friction, anxiety, or schedule pressure vs protecting the longer-term goal.",
    recommendationImplication:
      "When today's friction conflicts with the larger build, make the tradeoff explicit and give the meaningful alternative."
  }
];

export type TensionEvidenceInput = Partial<Pick<TensionEvidenceEvent, "id" | "createdAt" | "decayModelVersion">> &
  Omit<TensionEvidenceEvent, "id" | "createdAt" | "decayModelVersion">;

const tensionIds = new Set<RunnerTensionId>(RUNNER_TENSIONS.map((tension) => tension.id));
const sides = new Set<RunnerTensionSide>(["left", "right"]);

export function emptyRunnerTensionModel(): RunnerTensionModel {
  return {
    schemaVersion: "1",
    evidence: []
  };
}

export function addTensionEvidence(appData: AppData, input: TensionEvidenceInput, now = new Date()): AppData {
  const event = createTensionEvidenceEvent(input, now);
  const model = appData.runnerTensionModel ?? emptyRunnerTensionModel();

  return {
    ...appData,
    runnerTensionModel: {
      schemaVersion: "1",
      evidence: [...model.evidence, event]
    }
  };
}

export function createTensionEvidenceEvent(input: TensionEvidenceInput, now = new Date()): TensionEvidenceEvent {
  validateTensionId(input.tensionId);
  validateSide(input.side);
  validateSource(input.source);
  validateConfidence(input.confidence);

  return {
    ...input,
    id: input.id ?? randomUUID(),
    amplitude: clamp(input.amplitude, 0, 1),
    summary: input.summary.trim(),
    createdAt: input.createdAt ?? now.toISOString(),
    decayModelVersion: input.decayModelVersion ?? TENSION_DECAY_MODEL_V1.version
  };
}

export function computeRunnerTensionSnapshot(
  model: RunnerTensionModel | undefined,
  asOfDate = new Date()
): RunnerTensionSnapshot {
  const evidence = model?.evidence ?? [];
  const asOf = asOfDate.toISOString();

  return {
    schemaVersion: "1",
    asOf,
    decayModelVersion: TENSION_DECAY_MODEL_V1.version,
    postures: RUNNER_TENSIONS.map((tension) => {
      const weighted = evidence
        .filter((event) => event.tensionId === tension.id)
        .map((event) => ({
          event,
          effectiveWeight: effectiveTensionEvidenceWeight(event, asOfDate)
        }));
      const leftWeight = round3(sumWeights(weighted, "left"));
      const rightWeight = round3(sumWeights(weighted, "right"));
      const net = round3(rightWeight - leftWeight);
      const total = leftWeight + rightWeight;
      const leaning = leaningFor(leftWeight, rightWeight);
      const confidence = confidenceFor(total);

      return {
        tensionId: tension.id,
        leftLabel: tension.leftLabel,
        rightLabel: tension.rightLabel,
        leftWeight,
        rightWeight,
        net,
        confidence,
        leaning,
        strongestEvidence: weighted
          .filter(({ effectiveWeight }) => effectiveWeight >= TENSION_DECAY_MODEL_V1.promptEvidenceThreshold)
          .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
          .slice(0, 3)
          .map(({ event, effectiveWeight }) => ({
            side: event.side,
            source: event.source,
            effectiveWeight: round3(effectiveWeight),
            summary: event.summary,
            createdAt: event.createdAt
          }))
      } satisfies RunnerTensionPosture;
    })
  };
}

export function effectiveTensionEvidenceWeight(event: TensionEvidenceEvent, asOfDate = new Date()) {
  const halfLifeDays = TENSION_DECAY_MODEL_V1.sourceHalfLifeDays[event.source];
  const sourceWeight = TENSION_DECAY_MODEL_V1.sourceWeights[event.source];
  const confidenceWeight = TENSION_DECAY_MODEL_V1.confidenceWeights[event.confidence];
  const ageDays = Math.max(0, (asOfDate.getTime() - new Date(event.createdAt).getTime()) / (24 * 60 * 60 * 1000));

  return event.amplitude * sourceWeight * confidenceWeight * 0.5 ** (ageDays / halfLifeDays);
}

export function runnerTensionSnapshotForPrompt(snapshot: RunnerTensionSnapshot) {
  if (snapshot.postures.every((posture) => posture.strongestEvidence.length === 0)) {
    return "Runner Tension Model: no durable runner-specific tension evidence yet.";
  }

  const lines = [
    "RUNNER TENSION MODEL",
    "Use this only to contextualize ambiguous tradeoffs. Do not let it override deterministic risk findings, clear pain/injury/illness/safety signals, or actual recent training evidence.",
    "This is not a personality profile. Do not accuse the runner of motives. Preserve stated-vs-revealed mismatch instead of overwriting one with the other. When a recommendation is not a no-brainer, explain the tradeoff and give the meaningful alternative. The runner decides.",
    ""
  ];

  for (const posture of snapshot.postures) {
    const leaning = leaningLabel(posture);
    lines.push(`* ${posture.leftLabel} vs ${posture.rightLabel}: ${leaning}, ${posture.confidence} confidence.`);

    if (posture.strongestEvidence.length) {
      lines.push(`  Evidence: ${evidenceSentence(posture)}.`);
      lines.push(`  Recommendation implication: ${implicationFor(posture.tensionId)}`);
    } else {
      lines.push("  Evidence: insufficient evidence.");
    }
  }

  return lines.join("\n");
}

function evidenceSentence(posture: RunnerTensionPosture) {
  const dominant = posture.strongestEvidence[0];
  const contrary = posture.strongestEvidence.find((item) => item.side !== dominant.side);
  const sideLabel = labelForSide(posture, dominant.side).toLowerCase();
  const summary = `${dominant.source.replaceAll("_", " ")} signal toward ${sideLabel}: ${dominant.summary}`;

  if (!contrary) return summary;
  return `${summary}; contrary ${contrary.source.replaceAll("_", " ")} signal: ${contrary.summary}`;
}

function implicationFor(tensionId: RunnerTensionId) {
  return RUNNER_TENSIONS.find((tension) => tension.id === tensionId)?.recommendationImplication ?? "Explain the tradeoff.";
}

function leaningLabel(posture: RunnerTensionPosture) {
  if (posture.leaning === "unknown") return "unknown / insufficient evidence";
  if (posture.leaning === "mixed") return "mixed";
  return `leans ${labelForSide(posture, posture.leaning).toLowerCase()}`;
}

function labelForSide(posture: RunnerTensionPosture, side: RunnerTensionSide) {
  return side === "left" ? posture.leftLabel : posture.rightLabel;
}

function sumWeights(
  weighted: Array<{ event: TensionEvidenceEvent; effectiveWeight: number }>,
  side: RunnerTensionSide
) {
  return weighted
    .filter(({ event }) => event.side === side)
    .reduce((total, item) => total + item.effectiveWeight, 0);
}

function leaningFor(leftWeight: number, rightWeight: number): RunnerTensionPosture["leaning"] {
  const total = leftWeight + rightWeight;
  if (total < TENSION_DECAY_MODEL_V1.promptEvidenceThreshold) return "unknown";

  const weaker = Math.min(leftWeight, rightWeight);
  const stronger = Math.max(leftWeight, rightWeight);
  if (weaker >= 0.2 && weaker / stronger >= 0.35) return "mixed";
  return leftWeight > rightWeight ? "left" : "right";
}

function confidenceFor(totalWeight: number): RunnerTensionPosture["confidence"] {
  if (totalWeight < TENSION_DECAY_MODEL_V1.promptEvidenceThreshold) return "none";
  if (totalWeight < 0.5) return "low";
  if (totalWeight < 1.5) return "medium";
  return "high";
}

function validateTensionId(tensionId: RunnerTensionId) {
  if (!tensionIds.has(tensionId)) throw new Error(`Unknown runner tension id: ${tensionId}`);
}

function validateSide(side: RunnerTensionSide) {
  if (!sides.has(side)) throw new Error(`Unknown runner tension side: ${side}`);
}

function validateSource(source: TensionEvidenceSource) {
  if (!(source in TENSION_DECAY_MODEL_V1.sourceWeights)) throw new Error(`Unknown tension evidence source: ${source}`);
}

function validateConfidence(confidence: TensionEvidenceConfidence) {
  if (!(confidence in TENSION_DECAY_MODEL_V1.confidenceWeights)) {
    throw new Error(`Unknown tension evidence confidence: ${confidence}`);
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
