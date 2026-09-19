import { z } from "zod";

export const ImportantDateKind = z.enum(["application_open", "deadline", "event_start", "event_end", "announcement", "rolling", "other"]);
export const Confidence = z.enum(["high", "medium", "low"]);
export const ImportantDate = z.object({
  label: z.string(), kind: ImportantDateKind, value: z.string().nullable(),
  precision: z.enum(["date_time", "date_only", "unknown"]), timezone: z.string().nullable(),
  yearResolution: z.enum(["explicit", "inferred_next_occurrence", "unknown"]),
  sourceUrl: z.url(), sourceText: z.string(),
});
export const OpportunityResult = z.object({
  title: z.string(), organization: z.string().nullable(),
  opportunityType: z.enum(["job", "internship", "competition", "scholarship", "event", "volunteer", "concert", "other"]),
  summary: z.string(), importantDates: z.array(ImportantDate),
  eligibility: z.array(z.string()), requirements: z.array(z.string()), suggestedTasks: z.array(z.string()),
  applicationUrl: z.url().nullable(),
  sources: z.array(z.object({ url: z.url(), title: z.string(), status: z.enum(["fetched", "partial", "failed"]) })),
  conflicts: z.array(z.object({ field: z.string(), explanation: z.string(), sourceUrls: z.array(z.url()) })),
  confidence: Confidence,
});
export const SavedEvent = z.object({
  id: z.string(), title: z.string(), organization: z.string().nullable(), dueAt: z.string().nullable(),
  kind: ImportantDateKind, reminderAt: z.string(), sourceUrl: z.url(), confidence: Confidence,
});
export type ImportantDate = z.infer<typeof ImportantDate>;
export type OpportunityResult = z.infer<typeof OpportunityResult>;
export type SavedEvent = z.infer<typeof SavedEvent>;
