"use client";
import { enablePush, registerEvent, requestPushPermission } from "@/lib/push/client";
import { useRef, useState } from "react";
import type { OpportunityResult as Result, SavedEvent } from "@/lib/schema";
import { formatDate, localDateTime, selectReminderTarget, automaticReminders } from "@/lib/dates";
import EvidenceList from "./EvidenceList";
import ConflictAlert from "./ConflictAlert";
export default function OpportunityResult({result,onSave,onTryAgain,live=false}: {live?:boolean;result: Result; onSave: (event: SavedEvent) => void; onTryAgain: () => void}) {
  const [reminder,setReminder] = useState("");
  const [message,setMessage] = useState("");
  const [custom,setCustom] = useState(false);
  const [saved,setSaved] = useState(false);
  const pending = useRef<{key:string;events:SavedEvent[]}|null>(null);
  const locallySaved = useRef(new Set<string>());
  const [busy,setBusy] = useState(false);
  const {primary:date,primaryIsScoped,target} = selectReminderTarget(result);
  const rolling = !date && result.importantDates.some(d => d.kind === "rolling");
  const conflict = result.conflicts.length > 0;
  const missing = !date && !rolling && !conflict;
  const plans = target ? automaticReminders(target) : [];
  const otherDates = result.importantDates.filter(d => d !== date && d.kind !== "rolling");
  async function save() {
    if (busy || saved) return;
    const times = custom || !target ? [new Date(reminder).getTime()] : plans.map(p => Date.parse(p.at));
    if (times.some(t => !Number.isFinite(t))) {setMessage("Choose a valid reminder time.");return;}
    const future = times.filter(t => t > Date.now());
    if (!future.length) {setMessage("These reminder times have passed. Customize a future reminder.");return;}
    setBusy(true);
    const permission = requestPushPermission();
    try {
      const key = JSON.stringify([target?.value, future]);
      if (pending.current?.key !== key) pending.current = {key, events:future.map(when => ({id:crypto.randomUUID(),title:result.title,organization:result.organization,dueAt:target?.value ?? null,kind:target?.kind ?? (rolling ? "rolling" : "other"),reminderAt:new Date(when).toISOString(),sourceUrl:target?.sourceUrl ?? result.sources[0].url,confidence:result.confidence}))};
      const events = pending.current.events;
      for (const event of events) {
        await registerEvent(event);
        if (!locallySaved.current.has(event.id)) {onSave(event);locallySaved.current.add(event.id);}
      }
      const allowed = await permission;
      if (allowed !== "granted") {setMessage(`Notification permission: ${allowed}. Reminders saved but not scheduled. Allow notifications and retry.`);return;}
      const endpoint = await enablePush();
      for (const event of events) await registerEvent(event,endpoint);
      setSaved(true);
      setMessage(`${events.length} reminder${events.length === 1 ? "" : "s"} scheduled. ${future.length < times.length ? "Past reminder times were skipped. " : ""}Keep the local server running.`);
    } catch (error) {setMessage(error instanceof Error ? error.message : "Notification setup failed. Retry to finish scheduling.");}
    finally {setBusy(false);}
  }
  async function testNotification() {
    try {
      const permission = await requestPushPermission();
      if (permission !== "granted") {setMessage(`Notification permission: ${permission}`);return;}
      await navigator.serviceWorker.register("/sw.js", {scope: "/"});
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Deadline direct display check", {body: "Direct browser notification test", tag: "direct-check"});
      setMessage("Browser accepted the direct notification. Check Windows notifications for display.");
    } catch {setMessage("Direct notification failed. Check browser and Windows notification settings.");}
  }
  return <section className="card overflow-hidden" aria-labelledby="result-title"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="step-number">02</span><h2 id="result-title" className="font-semibold">Opportunity brief</h2></div><span className="text-xs text-slate-400">{live?(result.sources.some(s=>s.url.startsWith("urn:poster:"))?"Poster · vision transcription":"Grounded source result"):"Illustrative mock data"}</span></div><div className="space-y-6 p-5 sm:p-7"><div><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="rounded-md bg-purple-50 px-2 py-1 capitalize text-purple-600">{result.opportunityType}</span>{result.organization}</div><h3 className="text-2xl font-semibold tracking-tight">{result.title}</h3></div>
    {conflict ? <ConflictAlert result={result} live={live}/> : missing ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="text-xl font-semibold">No application deadline found</h3><p className="mt-2 text-sm leading-6 text-slate-500">The inspected source did not contain enough grounded deadline evidence. Try an official listing or another source.</p><button onClick={onTryAgain} className="mt-4 text-sm font-semibold text-purple-600">Try another source ↗</button></div> : <div className={`rounded-2xl border p-5 ${rolling ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50/70"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-xs font-semibold uppercase tracking-wider ${rolling ? "text-amber-700" : "text-emerald-700"}`}>{rolling ? "Open applications" : primaryIsScoped ? `Scoped deadline: ${date?.label}` : "Application deadline"}</p><span className={`rounded-full bg-white px-2.5 py-1 text-xs font-medium ${rolling ? "text-amber-700" : "text-emerald-700"}`}>{result.confidence} confidence</span></div><p className="mt-3 text-xl font-semibold sm:text-2xl">{rolling ? "Rolling — closes when filled." : date ? formatDate(date) : ""}</p><p className="mt-2 text-xs text-slate-500">{rolling ? "Apply early." : date?.precision === "date_only" ? "Source gives a date only; no time was provided." : "Time shown in the source timezone. Verify before applying."}</p></div>}
    {live&&<p className="text-xs font-medium text-slate-500">{result.confidence} confidence · computed from evidence</p>}
    {otherDates.length > 0 && <section><h3 className="mb-3 font-semibold">Other important dates</h3><ul className="space-y-2">{otherDates.map((d,i)=><li key={i} className="text-sm text-slate-600"><strong>{d.label} ({d.kind.replaceAll('_',' ')})</strong> — {formatDate(d)}</li>)}</ul></section>}
    <div><h3 className="mb-2 font-semibold">Summary</h3><p className="text-sm leading-7 text-slate-500">{result.summary}</p></div>
    <div className="grid gap-5 sm:grid-cols-2">{[["Eligibility",result.eligibility],["Requirements",result.requirements]].map(([label,items]) => <div key={label as string}><h3 className="mb-3 font-semibold">{label}</h3><ul className="space-y-2">{(items as string[]).map(item => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-500"><span className="text-emerald-600">✓</span>{item}</li>)}</ul></div>)}</div>
    <div className="rounded-xl bg-[#F6F7FB] p-4"><h3 className="text-sm font-semibold">Suggested tasks <span className="ml-1 text-xs font-normal text-slate-400">· ideas, not requirements</span></h3><ul className="mt-3 space-y-2">{result.suggestedTasks.map(item => <li key={item} className="flex gap-2 text-sm text-slate-500"><span aria-hidden="true">□</span>{item}</li>)}</ul></div>
    {process.env.NODE_ENV === "development" && <button type="button" onClick={testNotification} className="text-sm text-purple-600">Demo: test browser notification now</button>}
    <EvidenceList result={result} live={live}/>
    {!conflict && <div className="border-t border-slate-100 pt-5">
      {target && <p className="mb-3 text-sm"><strong>Reminder target:</strong> {target.kind === "event_start" ? "Event date" : primaryIsScoped ? date?.label : "Application deadline"} — {formatDate(target)}</p>}
      {target ? <div className="mb-4"><h3 className="font-semibold">Reminders</h3><ul className="mt-2 space-y-1 text-sm">{plans.map(plan=><li key={plan.days}>✓ {plan.days} {plan.days === 1 ? "day" : "days"} before — {new Date(plan.at).toLocaleString()}{Date.parse(plan.at) <= Date.now() ? " (passed; will be skipped)" : ""}</li>)}</ul>{target.precision === "date_only" && <p className="mt-2 text-xs text-slate-500">09:00 in your local timezone is a reminder preference, not a time printed by the source.</p>}<label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={custom} disabled={saved} onChange={e=>setCustom(e.target.checked)}/>Customize with one reminder instead</label></div> : <p className="mb-3 text-sm text-slate-500">No unambiguous reminder target. Choose a reminder time.</p>}
      {(custom || !target) && <><label htmlFor="reminder" className="field-label">Remind me at (your local time)</label><input id="reminder" disabled={saved} type="datetime-local" value={reminder} min={localDateTime(Date.now())} onChange={e=>{setReminder(e.target.value);setMessage("");}} className="input"/></>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">{result.applicationUrl && <a href={result.applicationUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-purple-600">Application link ↗</a>}<button disabled={busy || saved} onClick={save} className="primary disabled:opacity-50">{saved ? "Reminders saved" : "Save and remind me"}</button></div><p className="mt-3 text-xs text-slate-400">Reminders require this server to stay running.</p>{message && <p role="status" className="mt-3 text-sm text-purple-700">{message}</p>}
    </div>}
  </div></section>;
}
