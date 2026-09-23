import { normalizeEvidence } from "@/lib/agent/grounding";
import { scopeWords } from "@/lib/dates";
import type { ImportantDate,OpportunityResult } from "@/lib/schema";
export type Change={type:string;fingerprint:string;old:unknown;next:unknown;explanation:string};
const norm=(s:string)=>normalizeEvidence(s).toLowerCase();
export const fingerprint=(d:ImportantDate)=>d.kind+':'+norm((d.label+' '+d.sourceText).match(scopeWords)?.[0]??'general');
export function compareResults(old:OpportunityResult,next:OpportunityResult,text:string){
 const changes:Change[]=[];const ignored:string[]=[];const slice=normalizeEvidence(text);
 const add=(type:string,fp:string,a:unknown,b:unknown)=>{if(!changes.some(c=>c.type===type&&c.fingerprint===fp))changes.push({type,fingerprint:fp,old:a,next:b,explanation:type.replaceAll('_',' ')});};
 const present=(d:ImportantDate)=>!!d.sourceText&&slice.includes(normalizeEvidence(d.sourceText));
 const low=(d:ImportantDate)=>d.yearResolution==='inferred_next_occurrence';
 const paired=(a:ImportantDate,b:ImportantDate,fp:string)=>{
   if(a.value===b.value&&a.precision===b.precision)return;
   if(low(b)){ignored.push('inferred_year');return;}
   if(present(a)){add('conflict_appeared',fp,a,b);return;}
   if(!b.value)return;
   const type=b.kind==='deadline'?(a.value&&Date.parse(b.value)<Date.parse(a.value)?'deadline_moved_earlier':'deadline_moved_later'):b.kind==='application_open'?'application_open_changed':b.kind.startsWith('event_')?'event_date_changed':null;
   if(type)add(type,fp,a,b);
 };
 const all=new Set([...old.importantDates,...next.importantDates].map(fingerprint));
 for(const fp of all){
   const a=old.importantDates.filter(d=>fingerprint(d)===fp),b=next.importantDates.filter(d=>fingerprint(d)===fp);
   if(a.length===1&&b.length===1){paired(a[0],b[0],fp);continue;}
   if(a.length>1||b.length>1){
     for(const x of a){const matches=b.filter(y=>normalizeEvidence(y.sourceText)===normalizeEvidence(x.sourceText));if(matches.length===1&&a.filter(y=>normalizeEvidence(y.sourceText)===normalizeEvidence(x.sourceText)).length===1)paired(x,matches[0],fp);else ignored.push('ambiguous_date');}
     if(b.length!==a.length)ignored.push('unmatched_date');continue;
   }
   if(a.length===1&&!b.length){const x=a[0];if(present(x))continue;
     if(x.kind==='deadline')add('deadline_removed',fp,x,null);
   }
   if(!a.length&&b.length===1){const x=b[0];if(low(x)){ignored.push('inferred_year');continue;}if(x.kind==='deadline'&&x.value)add('deadline_added',fp,null,x);}
 }
 const oldRolling=old.importantDates.find(d=>d.kind==='rolling'),newRolling=next.importantDates.find(d=>d.kind==='rolling');
 const oldDated=old.importantDates.find(d=>d.kind==='deadline'&&d.value),newDated=next.importantDates.find(d=>d.kind==='deadline'&&d.value);
 if(oldRolling&&!newRolling&&newDated&&!low(newDated)&&!present(oldRolling))add('rolling_became_dated','rolling',oldRolling,newDated);
 if(oldDated&&!newDated&&newRolling&&!present(oldDated))add('dated_became_rolling','rolling',oldDated,newRolling);
 if(old.applicationUrl!==next.applicationUrl&&(next.applicationUrl||!old.applicationUrl||!text.includes(old.applicationUrl)))add('application_url_changed','application_url',old.applicationUrl,next.applicationUrl);
 const a=new Map(old.requirements.map(x=>[norm(x),x])),b=new Map(next.requirements.map(x=>[norm(x),x]));
 for(const [key,value]of b)if(!a.has(key))add('requirement_added',key,null,value);
 for(const [key,value]of a)if(!b.has(key))add('requirement_removed',key,value,null);
 if(!old.conflicts.length&&next.conflicts.length)add('conflict_appeared','conflicts',old.conflicts,next.conflicts);
 if(old.conflicts.length&&!next.conflicts.length){const quotes=old.importantDates.map(d=>normalizeEvidence(d.sourceText));if(!quotes.every(q=>q&&slice.includes(q)))add('conflict_disappeared','conflicts',old.conflicts,next.conflicts);}
 return {changes,ignored};
}
