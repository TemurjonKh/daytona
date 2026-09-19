import type { ImportantDate, OpportunityResult } from "./schema";
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

// Scope is derived from the date's own label/evidence, never from chronological order.
const scopeWords = /maker|메이커|블록코딩|임베디드|category|track|division|부문|분야|대상별|예선|본선|early.bird|조기|작품\s*제출|submission/iu;
const registration = /application|registration|apply|접수|신청|지원|등록/iu;
const period = /period|window|기간/iu;
export function selectReminderTarget(result: OpportunityResult) {
  const deadlines = result.importantDates.filter(d => d.kind === "deadline" && d.value);
  const scoped = (d: ImportantDate) => scopeWords.test(d.label + " " + d.sourceText);
  const rank = (d: ImportantDate) => period.test(d.label + " " + d.sourceText) ? 1 : 0;
  const general = deadlines.filter(d => !scoped(d) && registration.test(d.label + " " + d.sourceText)).sort((a,b) => rank(a)-rank(b))[0];
  // A scoped date is eligible only when its named scope also appears in this result's title.
  const relevantScoped = deadlines.find(d => {
    const scope = (d.label + " " + d.sourceText).match(/maker|메이커|블록코딩|임베디드/iu)?.[0];
    return scoped(d) && !!scope && result.title.toLocaleLowerCase().includes(scope.toLocaleLowerCase());
  });
  const primary = general ?? relevantScoped;
  const event = result.importantDates.find(d => d.kind === "event_start" && d.value);
  // Do not silently switch to an event when an unresolved scoped deadline still exists.
  return {primary, primaryIsScoped: !!primary && !general, target: primary ?? (deadlines.length === 0 ? event : undefined)};
}
export function automaticReminders(target: ImportantDate) {
  if (!target.value) return [];
  const base = new Date(target.precision === "date_only" ? target.value.slice(0,10) + "T09:00:00" : target.value);
  if (!Number.isFinite(base.getTime())) return [];
  return [3,1].map(days => {
    const delivery = new Date(base);
    delivery.setDate(delivery.getDate() - days);
    return {days, at: delivery.toISOString()};
  });
}
