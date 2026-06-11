import type { TrainingPlanDayOfWeek } from "./types";

export type PlanCalendarPositionStatus = "before_plan" | "in_plan" | "after_plan";

export type PlanCalendarPosition = {
  status: PlanCalendarPositionStatus;
  deltaDays: number;
  weekNumber: number;
  dayOfWeek: TrainingPlanDayOfWeek;
};

const dayOrder: TrainingPlanDayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function planCalendarPosition(
  startDate: string | undefined,
  localDate: string | undefined,
  durationWeeks: number
): PlanCalendarPosition | undefined {
  const startOrdinal = isoDateOrdinal(startDate);
  const todayOrdinal = isoDateOrdinal(localDate);
  if (startOrdinal === undefined || todayOrdinal === undefined || durationWeeks <= 0) return undefined;

  const deltaDays = todayOrdinal - startOrdinal;
  if (deltaDays < 0) {
    return {
      status: "before_plan",
      deltaDays,
      weekNumber: 1,
      dayOfWeek: "monday"
    };
  }

  if (deltaDays >= durationWeeks * 7) {
    return {
      status: "after_plan",
      deltaDays,
      weekNumber: durationWeeks,
      dayOfWeek: "sunday"
    };
  }

  return {
    status: "in_plan",
    deltaDays,
    weekNumber: Math.floor(deltaDays / 7) + 1,
    dayOfWeek: dayOrder[deltaDays % 7]
  };
}

export function addIsoDateDays(value: string, days: number) {
  const parsed = parseIsoDateParts(value);
  if (!parsed) return undefined;
  const ordinal = daysFromCivil(parsed.year, parsed.month, parsed.day) + days;
  return civilFromDays(ordinal);
}

export function isoDateOrdinal(value: string | undefined) {
  const parsed = parseIsoDateParts(value);
  if (!parsed) return undefined;
  return daysFromCivil(parsed.year, parsed.month, parsed.day);
}

export function localTodayIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function parseIsoDateParts(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return undefined;
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) return undefined;
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysFromCivil(year: number, month: number, day: number) {
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number) {
  days += 719468;
  const era = Math.floor(days / 146097);
  const dayOfEra = days - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  const adjustedYear = year + (month <= 2 ? 1 : 0);
  return `${adjustedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
