import { SavedEvent, UserTimezone, Reminder } from "./schema";

export function normalizeSourceUrl(value:string) {
  const url=new URL(value);url.hash="";
  if(url.protocol === "http:" || url.protocol === "https:") {url.pathname=url.pathname.replace(/\/+$/,"") || "/";url.searchParams.sort();}
  return url.toString();
}
export function opportunityIdentity(event:Pick<SavedEvent,"sourceUrl"|"title"|"dueAt">) {
  if (/^https?:/i.test(event.sourceUrl)) return normalizeSourceUrl(event.sourceUrl);
  if (/^urn:poster:sha256:[a-f0-9]{64}$/i.test(event.sourceUrl)) return event.sourceUrl;
  // Legacy posters had random IDs and no image bytes available to recover a hash.
  return "poster:"+event.title.trim().toLocaleLowerCase().replace(/\s+/g," ")+":"+(event.dueAt??"");
}
export function mergeReminders(incoming:SavedEvent["reminders"],previous:SavedEvent["reminders"] = []) {
  const sent=new Set(previous.filter(r=>r.sent).map(r=>new Date(r.at).toISOString()));
  const map=new Map<string,SavedEvent["reminders"][number]>();
  for(const r of [...previous.filter(r=>r.sent),...incoming]) {
    const at=new Date(r.at).toISOString();
    map.set(at,{...r,at,sent:r.sent || sent.has(at) || map.get(at)?.sent === true});
  }
  return [...map.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
export function upsertSavedEvent(events:SavedEvent[],incoming:SavedEvent) {
  const identity=opportunityIdentity(incoming);
  const existing=events.find(e=>opportunityIdentity(e)===identity);
  const event={...incoming,id:existing?.id??incoming.id,reminders:mergeReminders(incoming.reminders,existing?.reminders)};
  return [...events.filter(e=>opportunityIdentity(e)!==identity),event];
}
export function migrateSavedEvents(input:unknown,timezone:string,now=Date.now()):SavedEvent[] {
  if(!Array.isArray(input))return [];
  const groups=new Map<string,SavedEvent[]>();
  for(const raw of input) {
    if(!raw || typeof raw!=="object")continue;
    const candidate={...raw};
    if(!UserTimezone.safeParse(candidate.timezone).success)candidate.timezone=timezone;
    if(!Array.isArray(candidate.reminders))candidate.reminders=typeof candidate.reminderAt==="string" && Number.isFinite(Date.parse(candidate.reminderAt)) ? [{at:new Date(candidate.reminderAt).toISOString(),label:"Custom reminder",sent:false}] : [];
    candidate.reminders=candidate.reminders.map((r:unknown)=>Reminder.safeParse(r)).filter((r:{success:boolean})=>r.success).map((r:{data:SavedEvent["reminders"][number]})=>r.data);
    if(typeof candidate.sourceUrl!=="string" || !/^(https?:|urn:poster:)/i.test(candidate.sourceUrl))candidate.sourceUrl="urn:poster:legacy";
    const parsed=SavedEvent.safeParse(candidate);if(!parsed.success)continue;
    const event=parsed.data;event.reminders=mergeReminders(event.reminders);
    const key=opportunityIdentity(event);groups.set(key,[...(groups.get(key)??[]),event]);
  }
  const confidence={low:0,medium:1,high:2};
  const future=(e:SavedEvent)=>e.reminders.filter(r=>!r.sent&&Date.parse(r.at)>now).length;
  return [...groups.values()].map(records=>{
    let winner=records[0];
    for(const candidate of records.slice(1)) {
      const score=Number(candidate.dueAt!==null)-Number(winner.dueAt!==null) || future(candidate)-future(winner) || confidence[candidate.confidence]-confidence[winner.confidence];
      if(score>=0)winner=candidate;
    }
    // Preserve reminder entries from old two-card saves, along with delivered tombstones.
    return {...winner,reminders:mergeReminders(records.flatMap(e=>e.reminders),records.flatMap(e=>e.reminders))};
  });
}
