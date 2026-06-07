export const defaultTimeZone = "America/New_York";

export function localDateParts(date: Date, timeZone = defaultTimeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "long",
    year: "numeric"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    dayOfWeek: value("weekday")
  };
}
