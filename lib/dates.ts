import type { ImportantDate, OpportunityResult } from "./schema";
export function formatDate(date: ImportantDate) {
  if (!date.value) return "Date not confirmed";
  const value = new Date(date.precision === "date_only" ? date.value.slice(0, 10) + "T12:00:00Z" : date.value);
  if (!Number.isFinite(value.getTime())) return "Date not confirmed";
  return new Intl.DateTimeFormat("en-US", {month: "long", day: "numeric", year: "numeric", ...(date.precision === "date_time" ? {hour: "numeric", minute: "2-digit"} : {timeZone: "UTC"})}).format(value);
}
export function localDateTime(value: number) {
  const date = new Date(value);
  const pad=(n:number)=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Scope is derived from the date's own label/evidence, never from chronological order.
export const scopeWords = /maker|메이커|블록코딩|임베디드|category|track|division|부문|분야|대상별|예선|본선|early.bird|조기|작품\s*제출/iu;
const registration = /application|registration|apply|접수|신청|지원|등록/iu;
const period = /period|window|기간/iu;
export function selectReminderTarget(result: OpportunityResult) {
  const deadlines = result.importantDates.filter(d => d.kind === "deadline" && d.value);
  const scoped = (d: ImportantDate) => scopeWords.test(d.label + " " + d.sourceText);
  const rank = (d: ImportantDate) => period.test(d.label + " " + d.sourceText) ? 1 : registration.test(d.label + " " + d.sourceText) ? 0 : 2;
  const general = deadlines.filter(d => !scoped(d)).sort((a,b) => rank(a)-rank(b))[0];
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
export function automaticReminders(target: ImportantDate,timezone?:string) {
  if (!target.value) return [];
  if(timezone){
    const fields=(date:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
    const localStamp=(date:Date)=>{const p=fields(date);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);};
    const local=target.precision==='date_only'?Date.parse(target.value.slice(0,10)+'T09:00:00Z'):localStamp(new Date(target.value));
    if(!Number.isFinite(local))return [];
    return [3,1].map(days=>{const desired=local-days*86400000;let instant=desired;for(let n=0;n<4;n++)instant+=desired-localStamp(new Date(instant));return {days,at:new Date(instant).toISOString()};});
  }
  let base:Date;
  if(target.precision === "date_only") {
    const [year,month,day]=target.value.slice(0,10).split("-").map(Number);
    base=new Date(year,month-1,day,9,0,0,0);
    if(base.getFullYear()!==year || base.getMonth()!==month-1 || base.getDate()!==day)return [];
  } else base=new Date(target.value);
  if (!Number.isFinite(base.getTime())) return [];
  return [3,1].map(days => {
    const delivery = new Date(base);
    delivery.setDate(delivery.getDate() - days);
    return {days, at: delivery.toISOString()};
  });
}

export function detectedTimezone() {return Intl.DateTimeFormat().resolvedOptions().timeZone;}
export function localReminderLabel(at:string) {return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(at));}
