import type { ImportantDate } from "./schema";
export function formatDate(date: ImportantDate) {
  if (!date.value) return "Date not confirmed";
  const value = new Date(date.precision === "date_only" ? date.value.slice(0, 10) + "T12:00:00Z" : date.value);
  if (!Number.isFinite(value.getTime())) return "Date not confirmed";
  return new Intl.DateTimeFormat("en-US", {month: "long", day: "numeric", year: "numeric", ...(date.precision === "date_time" ? {hour: "numeric", minute: "2-digit", timeZoneName: "short" as const, timeZone: date.timezone ?? "UTC"} : {timeZone: "UTC"})}).format(value);
}
export function localDateTime(value: number) {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}
