import type { SavedEvent } from "@/lib/schema";
import { localReminderLabel } from "@/lib/dates";
import Countdown from "./Countdown";
function targetLabel(value:string) {
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year,month,day]=value.split("-").map(Number);
    return new Date(year,month-1,day).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  }
  return localReminderLabel(value);
}
export default function UpcomingPanel({events}:{events:SavedEvent[]}) {
  return <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start"><section className="card p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="font-semibold">Upcoming</h2><span className="rounded-lg bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-600">{events.length}</span></div><p className="mt-1 text-xs text-slate-400">Your next opportunities, in view.</p><div className="mt-5 space-y-4">{events.map((event,i)=><article key={event.id} className="rounded-2xl border border-slate-100 p-4"><div className="mb-3 flex items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${i%2?"bg-blue-50 text-blue-600":"bg-purple-50 text-purple-600"}`}>{(event.organization??event.title).slice(0,1)}</span><div className="min-w-0"><h3 className="text-sm font-semibold leading-5">{event.title}</h3><p className="mt-1 text-xs text-slate-400">{event.organization}</p></div></div>{event.dueAt&&<><p className="text-sm font-semibold text-[#6C5CE7]"><Countdown dueAt={event.dueAt}/></p><p className="mt-1 text-xs leading-5 text-slate-500">{event.kind==="event_start"?"Event date":"Deadline"} — {targetLabel(event.dueAt)}</p></>}<h4 className="mt-3 text-xs font-semibold">Reminders</h4><ul className="mt-1 space-y-1 text-xs text-slate-500">{event.reminders.map(reminder=><li key={reminder.at}>{localReminderLabel(reminder.at)} — {reminder.label}{reminder.sent?" · Sent":""}</li>)}</ul><span className="mt-3 inline-block text-xs text-slate-500">{event.confidence} confidence</span></article>)}</div><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">Reminders run while this server is running. Restarting it clears pending reminders.</p></section><div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-5"><p className="text-sm font-semibold text-purple-800">Evidence before certainty.</p><p className="mt-2 text-xs leading-6 text-slate-500">Every date has a source. If sources disagree, you’ll see both sides.</p></div></aside>;
}
