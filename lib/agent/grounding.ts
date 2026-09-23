import { OpportunityResult } from "@/lib/schema";
import type { Source } from "./types";
export function normalizeEvidence(value:string){return value.normalize('NFKC').replace(/\s+/g,' ').trim();}
import { normalizeDateCandidates,type DateCandidate } from "@/lib/dates/evidence";
export function groundResult(draft:OpportunityResult & {importantDates:DateCandidate[]},source:Source){
  const rawSlice=source.text.slice(0,15000);const slice=normalizeEvidence(rawSlice);
  const quoted=draft.importantDates.filter(candidate=>{const quote=normalizeEvidence(candidate.sourceText);return !!quote&&slice.includes(quote)&&candidate.sourceUrl===source.url;});
  const normalized=normalizeDateCandidates(quoted,{source:'url',slice:rawSlice,allowInferred:true});
  const importantDates=normalized.dates;const dropped=draft.importantDates.length-quoted.length+normalized.dropped;const weak=normalized.weak;
  const applicationUrl=draft.applicationUrl&&(draft.applicationUrl===source.url||source.text.slice(0,15000).includes(draft.applicationUrl))&&/^https?:/.test(draft.applicationUrl)?draft.applicationUrl:null;
  // Only sources actually fetched are displayed, never model-generated URLs.
  const conflicts=draft.conflicts.filter(c=>c.sourceUrls.length>0&&c.sourceUrls.every(u=>u===source.url)&&importantDates.length>1);
  const result=OpportunityResult.parse({...draft,importantDates,applicationUrl,conflicts,sources:[{url:source.url,title:source.title,status:'fetched'}],confidence:'low'});
  return {result,dropped,weak,contextual:normalized.contextual,decisions:normalized.decisions};
}
export function noDateResult(source:Source,message:string):OpportunityResult {
  return OpportunityResult.parse({title:source.title,organization:null,opportunityType:'other',summary:message,importantDates:[],eligibility:[],requirements:[],suggestedTasks:[],applicationUrl:null,sources:[{url:source.url,title:source.title,status:'partial'}],conflicts:[],confidence:'low'});
}
