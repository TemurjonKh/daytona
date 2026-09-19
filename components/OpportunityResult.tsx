"use client";
import { enablePush, registerEvent, requestPushPermission } from "@/lib/push/client";
import { useState } from "react";
import type { OpportunityResult as Result, SavedEvent } from "@/lib/schema";
import { formatDate, localDateTime } from "@/lib/dates";
import EvidenceList from "./EvidenceList";
import ConflictAlert from "./ConflictAlert";
export default function OpportunityResult({result,onSave,onTryAgain,live=false}: {live?:boolean;result: Result; onSave: (event: SavedEvent) => void; onTryAgain: () => void}) {
  const [reminder,setReminder] = useState("");
  const [message,setMessage] = useState("");
  const [quick,setQuick] = useState(true);
  const [busy,setBusy] = useState(false);
  const date = result.importantDates.find(d => d.kind === "deadline" && d.value);
  const rolling = result.importantDates.some(d => d.kind === "rolling");
  const conflict = result.conflicts.length > 0;
  const missing = !date && !rolling && !conflict;
  async function save() {
    if (busy) return;
    const when = quick ? Date.now()+60000 : new Date(reminder).getTime();
    if (!Number.isFinite(when) || when <= Date.now()) {setMessage("Choose a reminder time in the future.");return;}
    const event: SavedEvent = {id:crypto.randomUUID(),title:result.title,organization:result.organization,dueAt:rolling ? null : date?.value ?? null,kind:rolling ? "rolling" : "deadline",reminderAt:new Date(when).toISOString(),sourceUrl:date?.sourceUrl ?? result.sources[0].url,confidence:result.confidence};
    setBusy(true);
    // Invoked synchronously from the user's click, preserving browser user activation.
    const permission = requestPushPermission();
    try {
      await registerEvent(event);
      onSave(event);
      const allowed = await permission;
      if (allowed !== "granted") {setMessage(allowed === "unsupported" ? "Notifications unsupported. Event saved." : "Notifications blocked. Event saved; allow notifications and save again to schedule.");return;}
      setMessage("Event saved. Enabling notifications…");
      const endpoint = await enablePush();
      await registerEvent(event,endpoint);
      setMessage("Notifications enabled. Reminder scheduled; keep the local server running.");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Notification setup failed. Check the saved event above.");}
    finally {setBusy(false);}
  }
  return <section className="card overflow-hidden" aria-labelledby="result-title"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="step-number">02</span><h2 id="result-title" className="font-semibold">Opportunity brief</h2></div><span className="text-xs text-slate-400">{live?"Grounded source result":"Illustrative mock data"}</span></div><div className="space-y-6 p-5 sm:p-7"><div><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="rounded-md bg-purple-50 px-2 py-1 capitalize text-purple-600">{result.opportunityType}</span>{result.organization}</div><h3 className="text-2xl font-semibold tracking-tight">{result.title}</h3></div>
    {conflict ? <ConflictAlert result={result} live={live}/> : missing ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="text-xl font-semibold">No reliable deadline found.</h3><p className="mt-2 text-sm leading-6 text-slate-500">The inspected source did not contain enough grounded deadline evidence. Try an official listing or another source.</p><button onClick={onTryAgain} className="mt-4 text-sm font-semibold text-purple-600">Try another source â†—</button></div> : <div className={`rounded-2xl border p-5 ${rolling ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50/70"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-xs font-semibold uppercase tracking-wider ${rolling ? "text-amber-700" : "text-emerald-700"}`}>{rolling ? "Open applications" : "Application deadline"}</p><span className={`rounded-full bg-white px-2.5 py-1 text-xs font-medium ${rolling ? "text-amber-700" : "text-emerald-700"}`}>{result.confidence} confidence</span></div><p className="mt-3 text-xl font-semibold sm:text-2xl">{rolling ? "Rolling â€” closes when filled." : date ? formatDate(date) : ""}</p><p className="mt-2 text-xs text-slate-500">{rolling ? "Apply early." : "Time shown in the source timezone. Verify before applying."}</p></div>}
    {live&&<p className="text-xs font-medium text-slate-500">{result.confidence} confidence · computed from evidence</p>}
    {result.importantDates.some(d=>!['deadline','rolling'].includes(d.kind))&&<section><h3 className="mb-3 font-semibold">Other important dates</h3><ul className="space-y-2">{result.importantDates.filter(d=>!['deadline','rolling'].includes(d.kind)).map((d,i)=><li key={i} className="text-sm text-slate-600"><strong>{d.kind.replaceAll('_',' ')}: {d.label}</strong> — {formatDate(d)}</li>)}</ul></section>}
    <div><h3 className="mb-2 font-semibold">Summary</h3><p className="text-sm leading-7 text-slate-500">{result.summary}</p></div>
    <div className="grid gap-5 sm:grid-cols-2">{[["Eligibility",result.eligibility],["Requirements",result.requirements]].map(([label,items]) => <div key={label as string}><h3 className="mb-3 font-semibold">{label}</h3><ul className="space-y-2">{(items as string[]).map(item => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-500"><span className="text-emerald-600">âœ“</span>{item}</li>)}</ul></div>)}</div>
    <div className="rounded-xl bg-[#F6F7FB] p-4"><h3 className="text-sm font-semibold">Suggested tasks <span className="ml-1 text-xs font-normal text-slate-400">Â· ideas, not requirements</span></h3><ul className="mt-3 space-y-2">{result.suggestedTasks.map(item => <li key={item} className="flex gap-2 text-sm text-slate-500"><span aria-hidden="true">â–¡</span>{item}</li>)}</ul></div>
    <EvidenceList result={result} live={live}/>
    {!missing && !conflict && <div className="border-t border-slate-100 pt-5"><label className="mb-4 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={quick} onChange={e => setQuick(e.target.checked)}/>Notify me in 60 seconds</label><label htmlFor="reminder" className="field-label">Remind me at <span className="font-normal text-slate-400">(your local time)</span></label><input id="reminder" disabled={quick} type="datetime-local" value={reminder} min={localDateTime(Date.now())} onChange={e => {setReminder(e.target.value);setMessage("");}} className="input"/><div className="mt-4 flex flex-wrap items-center justify-between gap-4">{result.applicationUrl && <a href={result.applicationUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-purple-600">Application link â†—</a>}<button disabled={busy} onClick={save} className="primary disabled:opacity-50">{rolling ? "Save reminder" : "Save and remind me"}</button></div><p className="mt-3 text-xs text-slate-400">Demo save only Â· no real reminders or notifications</p>{message && <p role="status" className="mt-3 text-sm text-purple-700">{message}</p>}</div>}
  </div></section>;
}
