import assert from "node:assert/strict";
import { test } from "node:test";
import { structuredPlanSnapshot, structuredPlanSummary } from "./structured-plans.ts";
import type { StructuredTrainingPlan } from "./types.ts";

const importedPlanFixture: StructuredTrainingPlan = {
  schemaVersion: "1",
  id: "user-import:test-plan",
  name: "Imported marathon plan",
  source: "user_import",
  sourceNotes: "Fixture representing a runner-provided plan.",
  raceDistance: "marathon",
  durationWeeks: 2,
  currentWeek: 2,
  currentDay: "tuesday",
  weeks: [
    {
      weekNumber: 1,
      focus: "Base rhythm",
      targetMiles: 24,
      days: [
        {
          dayOfWeek: "monday",
          workout: {
            type: "rest",
            label: "Rest",
            intensity: "off",
            purpose: "Recovery"
          }
        }
      ]
    },
    {
      weekNumber: 2,
      focus: "Long-run build",
      targetMiles: 28,
      days: [
        {
          dayOfWeek: "tuesday",
          workout: {
            type: "tempo",
            label: "Tempo run",
            targetMiles: 6,
            intensity: "moderate",
            purpose: "Sustainable quality"
          }
        },
        {
          dayOfWeek: "wednesday",
          workout: {
            type: "easy",
            label: "Easy run",
            targetMiles: 4,
            intensity: "easy",
            purpose: "Aerobic support"
          }
        }
      ]
    }
  ]
};

test("snapshot exposes current and upcoming user-imported plan context", () => {
  const snapshot = structuredPlanSnapshot(importedPlanFixture);

  assert.equal(snapshot?.source, "user_import");
  assert.equal(snapshot?.currentWeek, 2);
  assert.equal(snapshot?.plannedToday?.type, "tempo");
  assert.equal(snapshot?.upcoming7Days.length, 2);
  assert.match(structuredPlanSummary(importedPlanFixture), /Imported marathon plan/);
});

test("empty summary is explicit when no structured plan has been imported", () => {
  assert.equal(structuredPlanSnapshot(undefined), undefined);
  assert.equal(structuredPlanSummary(undefined), "No structured plan imported yet.");
});

test("snapshot exposes calendar anchored plan start", () => {
  const snapshot = structuredPlanSnapshot({
    ...importedPlanFixture,
    startDate: "2099-01-05",
    currentWeek: undefined,
    currentDay: undefined
  });

  assert.equal(snapshot?.startDate, "2099-01-05");
  assert.equal(snapshot?.currentWeek, 1);
  assert.equal(snapshot?.currentDay, "monday");
});

test("snapshot uses supplied local date for plannedToday", () => {
  const snapshot = structuredPlanSnapshot({
    ...importedPlanFixture,
    startDate: "2026-06-01",
    currentWeek: undefined,
    currentDay: undefined
  }, { localDate: "2026-06-10" });

  assert.equal(snapshot?.currentWeek, 2);
  assert.equal(snapshot?.currentDay, "wednesday");
  assert.equal(snapshot?.plannedToday?.type, "easy");
});
