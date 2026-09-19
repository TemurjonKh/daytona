import { OpportunityResult, type ImportantDate } from "@/lib/schema";
import type { Source } from "./types";
export function normalizeEvidence(value:string){return value.normalize('NFKC').replace(/\s+/g,' ').trim();}
const rolling=/rolling|until (?:all .* )?filled|상시\s*채용|채용\s*시\s*마감/i;
const cutoff=/deadline|apply by|applications? (?:close|due)|closing date|registration (?:closes|deadline)|마감|접수\s*(?:기간|기한)|지원\s*(?:기간|기한)|신청\s*(?:기간|기한)/i;
export function groundResult(draft:OpportunityResult,source:Source){
  const slice=normalizeEvidence(source.text.slice(0,15000));let dropped=0;let weak=false;
  const importantDates:ImportantDate[]=[];
  for(const candidate of draft.importantDates){
    const quote=normalizeEvidence(candidate.sourceText);
    if(!quote||!slice.includes(quote)||candidate.sourceUrl!==source.url){dropped++;continue;}
    const date={...candidate};
    if(rolling.test(quote)){date.kind='rolling';date.value=null;date.precision='unknown';date.yearResolution='unknown';}
    else if(date.kind==='rolling'){dropped++;continue;}
    if(date.kind==='deadline'&&!cutoff.test(quote)){dropped++;continue;}
    if(date.kind!=='rolling'){
      if(date.value){
        const match=date.value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if(!match || !Number.isFinite(Date.parse(date.value)) || new Date(date.value.slice(0,10)+'T12:00:00Z').toISOString().slice(0,10)!==date.value.slice(0,10)){dropped++;continue;}
        if(date.yearResolution==='explicit'&&!quote.includes(match[1])){date.value=null;date.precision='unknown';date.yearResolution='unknown';weak=true;}
        if(date.yearResolution==='unknown'){date.value=null;date.precision='unknown';weak=true;}
        if(date.value&&date.precision==='date_time'&&!/\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm|시)/i.test(quote)){date.value=date.value.slice(0,10);date.precision='date_only';weak=true;}
        if(date.value&&date.precision==='date_only')date.value=date.value.slice(0,10);
        if(date.value&&date.precision==='date_time'&&!/(?:Z|[+-]\d{2}:\d{2})$/.test(date.value)){date.value=null;date.precision='unknown';weak=true;}
      } else weak=true;
    }
    importantDates.push(date);
  }
  const applicationUrl=draft.applicationUrl&&(draft.applicationUrl===source.url||source.text.slice(0,15000).includes(draft.applicationUrl))&&/^https?:/.test(draft.applicationUrl)?draft.applicationUrl:null;
  // Only sources actually fetched are displayed, never model-generated URLs.
  const conflicts=draft.conflicts.filter(c=>c.sourceUrls.length>0&&c.sourceUrls.every(u=>u===source.url)&&importantDates.length>1);
  const result=OpportunityResult.parse({...draft,importantDates,applicationUrl,conflicts,sources:[{url:source.url,title:source.title,status:'fetched'}],confidence:'low'});
  return {result,dropped,weak};
}
export function noDateResult(source:Source,message:string):OpportunityResult {
  return OpportunityResult.parse({title:source.title,organization:null,opportunityType:'other',summary:message,importantDates:[],eligibility:[],requirements:[],suggestedTasks:[],applicationUrl:null,sources:[{url:source.url,title:source.title,status:'partial'}],conflicts:[],confidence:'low'});
}
