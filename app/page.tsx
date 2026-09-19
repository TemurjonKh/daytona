"use client";
import { useEffect, useState } from "react";
import InputCard from "@/components/InputCard";
import AgentActivity from "@/components/AgentActivity";
import OpportunityResult from "@/components/OpportunityResult";
import UpcomingPanel from "@/components/UpcomingPanel";
import { mockResults, mockSavedEvents, type DemoState } from "@/lib/mock-data";
import { SavedEvent } from "@/lib/schema";
export default function Home() {
  const [state,setState] = useState<DemoState>("dated");
  const [events,setEvents] = useState<SavedEvent[]>([]);
  const [notice,setNotice] = useState("");
  useEffect(() => {
    try { const stored=localStorage.getItem("deadline-events"); const parsed=stored ? SavedEvent.array().safeParse(JSON.parse(stored)) : null; setEvents(parsed?.success ? parsed.data : mockSavedEvents(Date.now())); }
    catch {setEvents(mockSavedEvents(Date.now()));}
  },[]);
  function saveEvent(event: SavedEvent) {
    setEvents(previous => {const next=[...previous,event];try {localStorage.setItem("deadline-events",JSON.stringify(next));}catch {setNotice("Event saved on the server, but browser storage is unavailable.");}return next;});
  }
  return <><header className="border-b border-slate-200/70 bg-white"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6C5CE7] text-xl font-semibold text-white" aria-hidden="true">â†—</span><span className="text-base font-semibold tracking-tight sm:text-lg">Opportunity Agent</span></div><span className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-500">Powered by <strong className="font-semibold text-[#17213C]">Daytona</strong></span></div></header>
    <main className="mx-auto w-full max-w-[1200px] px-5 pb-12 pt-9 sm:px-8 sm:pt-12"><div className="mb-8"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-purple-600">Find it. Understand it. Act on it.</p><h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">Never miss a deadline<br className="hidden sm:block"/> you found once.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">Paste an opportunity link or upload a poster and get a verified deadline with a reminder.</p></div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">WORKSPACE <span className="ml-2 text-slate-500">/ Opportunity explorer</span></p>{process.env.NODE_ENV === "development" && <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1" aria-label="Demo state"><span className="px-2 text-xs text-slate-400">Demo state</span>{([["dated","Dated"],["rolling","Rolling"],["no-date","No date"],["conflict","Conflict"]] as const).map(([value,label]) => <button key={value} aria-pressed={state===value} onClick={() => {setState(value);setNotice("");}} className={`rounded-lg px-2.5 py-2 text-xs font-medium ${state===value ? "bg-purple-50 text-purple-700" : "text-slate-500 hover:bg-slate-50"}`}>{label}</button>)}</div>}</div>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px]"><div className="min-w-0 space-y-5"><InputCard onInvestigate={() => setNotice("Mock preview loaded below. No investigation was run; use Demo state to explore results.")}/>{notice && <p role="status" className="rounded-xl bg-purple-50 px-4 py-3 text-sm text-purple-700">{notice}</p>}<AgentActivity statuses={state === "no-date" ? ["complete","complete","pending","failed","pending"] : state === "conflict" ? ["complete","complete","pending","complete","failed"] : undefined}/><OpportunityResult key={state} result={mockResults[state]} onSave={saveEvent} onTryAgain={() => {document.getElementById("source-url")?.focus();document.getElementById("input-title")?.scrollIntoView({behavior:"smooth",block:"center"});}}/></div><UpcomingPanel events={events}/></div>
    <footer className="mt-9 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-400"><span>Opportunity Agent Â· Deadline HackSprint</span><span>Phase 2 preview Â· all opportunities and evidence are mock data</span></footer></main></>;
}
