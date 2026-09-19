import { OpportunityResult, SavedEvent } from "./schema";
export type DemoState = "dated" | "rolling" | "no-date" | "conflict";
const source = "https://opportunities.example/krafton-ai";
const second = "https://careers.example/krafton-ai";
const base = {
  title: "KRAFTON AI Internship", organization: "KRAFTON", opportunityType: "internship",
  summary: "Explore applied AI with a team building the next generation of interactive experiences. A hands-on internship for curious builders and researchers.",
  importantDates: [{label: "Application deadline", kind: "deadline", value: "2026-09-24T18:00:00+09:00", precision: "date_time", timezone: "Asia/Seoul", yearResolution: "explicit", sourceUrl: source, sourceText: "Applications close on September 24, 2026 at 6:00 PM KST."}],
  eligibility: ["Currently enrolled undergraduate or graduate students", "Available for a full-time internship in Seoul"],
  requirements: ["Resume or CV", "A portfolio or GitHub link"],
  suggestedTasks: ["Choose one AI project to highlight", "Prepare a short introduction about your interests"],
  applicationUrl: source,
  sources: [{url: source, title: "Internship overview", status: "fetched"}], conflicts: [], confidence: "high",
};
export const mockResults: Record<DemoState, OpportunityResult> = {
  dated: OpportunityResult.parse(base),
  rolling: OpportunityResult.parse({...base, title: "AI Research Fellowship", organization: "Open Research Lab", opportunityType: "other", summary: "Work alongside a small research team on practical, open AI projects. Applications are reviewed as they arrive.", importantDates: [{...base.importantDates[0], label: "Rolling applications", kind: "rolling", value: null, precision: "unknown", yearResolution: "unknown", sourceText: "Applications are reviewed on a rolling basis until all positions are filled."}], confidence: "medium"}),
  "no-date": OpportunityResult.parse({...base, title: "Student Innovation Program", summary: "A program for students turning new ideas into useful projects. The inspected page describes the program but gives no reliable application cutoff.", importantDates: [], applicationUrl: null, sources: [{url: source, title: "Program overview — no deadline stated", status: "partial"}], confidence: "low"}),
  conflict: OpportunityResult.parse({...base, importantDates: [...base.importantDates, {...base.importantDates[0], value: "2026-09-28T18:00:00+09:00", sourceUrl: second, sourceText: "The application deadline is September 28, 2026, 6:00 PM KST."}], sources: [...base.sources, {url: second, title: "Careers listing", status: "fetched"}], conflicts: [{field: "Application deadline", explanation: "The overview lists September 24, while the careers listing lists September 28. Confirm with the organizer before relying on either date.", sourceUrls: [source, second]}], confidence: "low"}),
};
export function mockSavedEvents(now: number): SavedEvent[] {
  return [{title: "KRAFTON AI Internship", organization: "KRAFTON", hours: 52}, {title: "Samsung Scholarship", organization: "Samsung", hours: 155}].map((item, i) => SavedEvent.parse({id: `demo-${i}`, title: item.title, organization: item.organization, dueAt: new Date(now + item.hours * 3600000).toISOString(), kind: "deadline", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, reminders: [{at:new Date(now + (item.hours - 24) * 3600000).toISOString(),label:"Custom reminder",sent:false}], sourceUrl: source+"/"+i, confidence: "high"}));
}
