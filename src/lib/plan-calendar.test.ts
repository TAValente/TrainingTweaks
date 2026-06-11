import assert from "node:assert/strict";
import { test } from "node:test";
import { addIsoDateDays, isoDateOrdinal, planCalendarPosition } from "./plan-calendar.ts";

test("plan calendar position uses ISO day ordinals across spring DST boundary", () => {
  const position = planCalendarPosition("2026-03-07", "2026-03-09", 4);

  assert.equal(position?.status, "in_plan");
  assert.equal(position?.deltaDays, 2);
  assert.equal(position?.weekNumber, 1);
  assert.equal(position?.dayOfWeek, "wednesday");
});

test("plan calendar position uses ISO day ordinals across fall DST boundary", () => {
  const position = planCalendarPosition("2026-10-31", "2026-11-02", 4);

  assert.equal(position?.status, "in_plan");
  assert.equal(position?.deltaDays, 2);
  assert.equal(position?.weekNumber, 1);
  assert.equal(position?.dayOfWeek, "wednesday");
});

test("plan calendar position returns explicit before and after statuses", () => {
  assert.equal(planCalendarPosition("2026-06-15", "2026-06-14", 2)?.status, "before_plan");
  assert.equal(planCalendarPosition("2026-06-15", "2026-06-29", 2)?.status, "after_plan");
});

test("ISO date helpers reject invalid calendar dates", () => {
  assert.equal(isoDateOrdinal("2026-02-30"), undefined);
  assert.equal(addIsoDateDays("2026-02-30", 1), undefined);
});

test("addIsoDateDays advances without constructing local Date instances", () => {
  assert.equal(addIsoDateDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addIsoDateDays("2028-02-28", 1), "2028-02-29");
});
