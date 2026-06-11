import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptPreviewPlan,
  activePlanForContext,
  discardPreviewPlan,
  peakLongRunMiles,
  previewGeneratedPlan,
  weeklyPreviewRows
} from "./plan-preview.ts";
import type { StructuredTrainingPlan } from "./types.ts";

test("generating a plan creates preview without replacing active structured plan", () => {
  const active = planFixture("active-plan", "Active plan");
  const preview = planFixture("preview-plan", "Preview plan");

  const state = previewGeneratedPlan({ activeStructuredPlan: active }, preview);

  assert.equal(state.activeStructuredPlan?.id, "active-plan");
  assert.equal(state.previewStructuredPlan?.id, "preview-plan");
  assert.equal(activePlanForContext(state)?.id, "active-plan");
});

test("accepting preview replaces active structured plan", () => {
  const active = planFixture("active-plan", "Active plan");
  const preview = planFixture("preview-plan", "Preview plan");

  const state = acceptPreviewPlan(previewGeneratedPlan({ activeStructuredPlan: active }, preview));

  assert.equal(state.activeStructuredPlan?.id, "preview-plan");
  assert.equal(state.previewStructuredPlan, undefined);
});

test("discarding preview preserves existing active structured plan", () => {
  const active = planFixture("active-plan", "Active plan");
  const preview = planFixture("preview-plan", "Preview plan");

  const state = discardPreviewPlan(previewGeneratedPlan({ activeStructuredPlan: active }, preview));

  assert.equal(state.activeStructuredPlan?.id, "active-plan");
  assert.equal(state.previewStructuredPlan, undefined);
});

test("compromised preview can be accepted and keeps warnings and status", () => {
  const preview = planFixture("preview-plan", "Preview plan", {
    status: "compromised",
    warnings: ["Requested peak is not reachable."]
  });

  const state = acceptPreviewPlan(previewGeneratedPlan({}, preview));

  assert.equal(state.activeStructuredPlan?.generator?.status, "compromised");
  assert.deepEqual(state.activeStructuredPlan?.generator?.warnings, ["Requested peak is not reachable."]);
});

test("context uses only accepted active plan, not preview plan", () => {
  const active = planFixture("active-plan", "Active plan");
  const preview = planFixture("preview-plan", "Preview plan");

  const state = previewGeneratedPlan({ activeStructuredPlan: active }, preview);

  assert.equal(activePlanForContext(state)?.id, "active-plan");
});

test("regenerating replaces previous preview without touching active plan", () => {
  const active = planFixture("active-plan", "Active plan");
  const firstPreview = planFixture("first-preview", "First preview");
  const secondPreview = planFixture("second-preview", "Second preview");

  const state = previewGeneratedPlan(previewGeneratedPlan({ activeStructuredPlan: active }, firstPreview), secondPreview);

  assert.equal(state.activeStructuredPlan?.id, "active-plan");
  assert.equal(state.previewStructuredPlan?.id, "second-preview");
});

test("preview weekly rows expose summary and warning severity", () => {
  const preview = planFixture("preview-plan", "Preview plan", {
    status: "compromised",
    warnings: ["Watch week 1."],
    riskAssessments: [
      {
        weekNumber: 1,
        ruleId: "planned_mileage_step",
        severity: "yellow",
        observedValue: 0.12,
        unit: "growth_ratio",
        message: "12% planned mileage step"
      }
    ]
  });

  const rows = weeklyPreviewRows(preview);

  assert.deepEqual(rows[0], {
    weekNumber: 1,
    focus: "Build",
    targetMiles: 30,
    longRunMiles: 10,
    workoutLabel: "Controlled quality",
    severity: "yellow"
  });
});

test("preview peak long run excludes marathon race week when possible", () => {
  const preview = planFixture("marathon-preview", "Marathon preview");
  preview.raceDistance = "marathon";
  preview.weeks = [
    {
      weekNumber: 1,
      focus: "Peak week",
      targetMiles: 45,
      days: [
        {
          dayOfWeek: "sunday",
          workout: {
            type: "long_run",
            label: "Long run",
            targetMiles: 20,
            intensity: "easy",
            purpose: "Peak training long run"
          }
        }
      ]
    },
    {
      weekNumber: 2,
      focus: "Race week",
      targetMiles: 30,
      days: [
        {
          dayOfWeek: "sunday",
          workout: {
            type: "long_run",
            label: "Marathon day",
            targetMiles: 26.2,
            intensity: "hard",
            purpose: "Race execution"
          }
        }
      ]
    }
  ];

  assert.equal(peakLongRunMiles(preview), 20);
});

function planFixture(
  id: string,
  name: string,
  generator?: Partial<NonNullable<StructuredTrainingPlan["generator"]>>
): StructuredTrainingPlan {
  return {
    schemaVersion: "1",
    id,
    name,
    source: "trainingtweaks_generic",
    raceDistance: "half_marathon",
    startDate: "2026-06-15",
    durationWeeks: 1,
    currentWeek: 1,
    currentDay: "monday",
    weeks: [
      {
        weekNumber: 1,
        focus: "Build",
        targetMiles: 30,
        days: [
          {
            dayOfWeek: "tuesday",
            workout: {
              type: "workout",
              label: "Controlled quality",
              targetMiles: 6,
              intensity: "moderate",
              purpose: "Quality cap"
            }
          },
          {
            dayOfWeek: "sunday",
            workout: {
              type: "long_run",
              label: "Long run",
              targetMiles: 10,
              intensity: "easy",
              purpose: "Endurance"
            }
          }
        ]
      }
    ],
    generator: {
      id: "plan_generator_v1",
      version: "plan-generator-v1",
      plannedPeakMilesPerWeek: 30,
      inputs: {
        currentMilesPerWeek: 20,
        targetMilesPerWeek: 30,
        requestedTargetMilesPerWeek: 30,
        durationWeeks: 1,
        riskTolerance: "regular"
      },
      riskRules: [],
      riskBudget: {
        tolerance: "regular",
        allowedYellow: 0,
        allowedRed: 0,
        yellowRatio: 0,
        redRatio: 0
      },
      riskCounts: { green: 0, yellow: 0, red: 0 },
      riskAssessments: [],
      ...generator
    }
  };
}
