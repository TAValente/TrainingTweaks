import type { Activity } from "./types.ts";
import type { FulfillmentScenarioFixture } from "./fulfillment-scenario-harness.ts";

const metersPerMile = 1609.344;
const createdAt = "2026-06-14T12:00:00.000Z";

export const fulfillmentScenarioFixtures: FulfillmentScenarioFixture[] = [
  {
    id: "exceeds-long-run-cap",
    title: "Runner tends to exceed planned mileage",
    asOfDate: "2026-06-15T12:00:00.000Z",
    seeds: [
      {
        tensionId: "health_protection_vs_performance_ambition",
        side: "right",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: runner repeatedly accepts extra mileage for performance ambition.",
        scenarioId: "exceeds-long-run-cap"
      }
    ],
    trace: {
      question: "Should I stretch the long run?",
      createdAt,
      recommendedActionSummary: "Cap the long run at 13 miles; 15 is not aligned with the recommendation.",
      targetIntent: "long_run",
      expectedExposure: {
        maxMiles: 13,
        intensity: "easy"
      },
      scheduleTolerance: {
        type: "same_day"
      },
      notAlignedIf: ["15 miles", "hard workout intensity"]
    },
    tensionTraces: [
      {
        tensionId: "health_protection_vs_performance_ambition",
        recommendedSide: "left",
        discouragedSide: "right",
        rationale: "Seeded ambition tension is acknowledged, but the recommendation protects the build."
      }
    ],
    activities: [run("2026-06-14T16:00:00.000Z", 15, { name: "Long Run" })],
    expectedFulfillment: "chose_opposite_side"
  },
  {
    id: "easy-day-turns-hard",
    title: "Runner tends to turn easy days into hard efforts",
    asOfDate: "2026-06-15T12:00:00.000Z",
    seeds: [
      {
        tensionId: "consistency_momentum_vs_recovery_rest",
        side: "left",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: runner preserves momentum by making easy days more demanding.",
        scenarioId: "easy-day-turns-hard"
      }
    ],
    trace: {
      question: "How should I run today?",
      createdAt,
      recommendedActionSummary: "Run 4 to 5 easy miles and avoid workout intensity.",
      targetIntent: "easy_run",
      expectedExposure: {
        minMiles: 4,
        maxMiles: 5,
        intensity: "easy",
        avoidIntensity: true
      },
      scheduleTolerance: {
        type: "same_day"
      },
      notAlignedIf: ["hard workout intensity", "tempo", "intervals"]
    },
    tensionTraces: [
      {
        tensionId: "consistency_momentum_vs_recovery_rest",
        recommendedSide: "right",
        discouragedSide: "left",
        rationale: "Seeded momentum tendency is counterbalanced toward recovery discipline."
      }
    ],
    activities: [run("2026-06-14T17:00:00.000Z", 5, { name: "Tempo workout", relativeEffort: 95 })],
    expectedFulfillment: "chose_opposite_side"
  },
  {
    id: "cautious-runner-easy-fulfillment",
    title: "Runner is cautious and completes bounded easy work",
    asOfDate: "2026-06-15T12:00:00.000Z",
    seeds: [
      {
        tensionId: "health_protection_vs_performance_ambition",
        side: "left",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: runner prioritizes finishing healthy over squeezing out extra work.",
        scenarioId: "cautious-runner-easy-fulfillment"
      }
    ],
    trace: {
      question: "Should I run today?",
      createdAt,
      recommendedActionSummary: "Run 4 to 5 easy miles.",
      targetIntent: "easy_run",
      expectedExposure: {
        minMiles: 4,
        maxMiles: 5,
        intensity: "easy"
      },
      scheduleTolerance: {
        type: "same_day"
      }
    },
    tensionTraces: [
      {
        tensionId: "health_protection_vs_performance_ambition",
        recommendedSide: "left",
        rationale: "Seeded caution aligns with bounded easy running."
      }
    ],
    activities: [run("2026-06-14T18:00:00.000Z", 4.5, { name: "Easy Run", relativeEffort: 20 })],
    expectedFulfillment: "fulfilled"
  },
  {
    id: "long-run-ramp-shifted",
    title: "Runner has long-run progression tension and shifts within tolerance",
    asOfDate: "2026-06-16T12:00:00.000Z",
    seeds: [
      {
        tensionId: "ambition_identity_vs_current_evidence",
        side: "right",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: recent evidence should govern long-run progression.",
        scenarioId: "long-run-ramp-shifted"
      }
    ],
    trace: {
      question: "Can I move the long run?",
      createdAt,
      recommendedActionSummary: "Keep the long run between 12 and 13 easy miles; Monday is acceptable.",
      targetIntent: "long_run",
      expectedExposure: {
        minMiles: 12,
        maxMiles: 13,
        intensity: "easy"
      },
      scheduleTolerance: {
        type: "next_day"
      }
    },
    tensionTraces: [
      {
        tensionId: "ambition_identity_vs_current_evidence",
        recommendedSide: "right",
        alternativeSide: "left",
        rationale: "Seeded current-evidence posture keeps the ramp bounded even with a schedule shift."
      }
    ],
    activities: [run("2026-06-15T10:00:00.000Z", 12.8, { name: "Long Run" })],
    expectedFulfillment: "shifted_but_aligned"
  },
  {
    id: "pain-risk-rest-conservative",
    title: "Recent pain/risk context keeps the recommendation conservative",
    asOfDate: "2026-06-15T12:00:00.000Z",
    seeds: [
      {
        tensionId: "health_protection_vs_performance_ambition",
        side: "left",
        provenance: "scenario_fixture",
        rationale: "Scenario seed: pain or injury-risk context should bias toward health protection.",
        scenarioId: "pain-risk-rest-conservative"
      }
    ],
    trace: {
      question: "Can I push through soreness?",
      createdAt,
      recommendedActionSummary: "Rest today; do not turn soreness into a hard run.",
      targetIntent: "rest",
      expectedExposure: {
        intensity: "off",
        notes: "Pain-risk scenario: no run today."
      },
      scheduleTolerance: {
        type: "same_day"
      },
      notAlignedIf: ["hard run", "workout", "tempo"]
    },
    tensionTraces: [
      {
        tensionId: "health_protection_vs_performance_ambition",
        recommendedSide: "left",
        discouragedSide: "right",
        rationale: "Seeded health-protection posture is recorded in the conservative rest trace."
      }
    ],
    activities: [],
    expectedFulfillment: "fulfilled"
  }
];

function run(startDate: string, distanceMiles: number, overrides: Partial<Activity> = {}): Activity {
  return {
    provider: "strava",
    providerActivityId: `${startDate}-${distanceMiles}-${overrides.name ?? "run"}`,
    sportType: "Run",
    name: overrides.name ?? "Run",
    startDate,
    distanceMeters: distanceMiles * metersPerMile,
    movingTimeSeconds: Math.round(distanceMiles * 9 * 60),
    elapsedTimeSeconds: Math.round(distanceMiles * 9 * 60),
    ...overrides
  };
}
