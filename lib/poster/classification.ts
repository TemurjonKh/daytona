import { z } from 'zod';
import { ImportantDateKind, OpportunityResult, type ImportantDate } from '@/lib/schema';
import { type DiscoveredDateEvidence } from '@/lib/dates/evidence';
import { type DeduplicatedLine, normalizeLine } from './transcription';

const RegionSummary = OpportunityResult.pick({ title:true, organization:true, opportunityType:true, summary:true, eligibility:true, requirements:true, suggestedTasks:true }).extend({ posterRegionId:z.string(), applicationUrl:z.string().nullable() });
export const ClassificationSchema = z.object({
 regions:z.array(RegionSummary),
 mappings:z.array(z.object({ evidenceId:z.string(), candidateId:z.string().nullable(), posterRegionId:z.string(), kind:ImportantDateKind, label:z.string() })),
});
export type Classification = z.infer<typeof ClassificationSchema>;
export type PosterPipelineOutput =
 | { kind:'single'; result:OpportunityResult }
 | { kind:'multiple'; results:OpportunityResult[] };
const englishLabel:Record<ImportantDate['kind'],string> = { application_open:'Applications open', deadline:'Application deadline', event_start:'Event date', event_end:'Event ends', announcement:'Announcement', rolling:'Open applications', other:'Date — review its meaning' };
export const posterReviewCopy = {
 noDate:'No visible date was detected in the poster transcription. Review the original image.',
 unreadable:'The image was not sufficiently readable for a complete transcription. Any recovered dates need review.',
 uncertain:'A date was detected, but its meaning or year needs review. See Other important dates and the original evidence.',
 conflict:'The image views contain conflicting dates. Review the original poster before using them.',
 event:'An event date was found. No application deadline was identified.',
};
const isEnglish = (text:string) => !/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
export function mergePosterEvidence(lines:DeduplicatedLine[], evidence:DiscoveredDateEvidence[], classification:Classification, sourceId:string, options:{truncated:boolean;resolutionInsufficient:boolean;classificationIncomplete?:boolean;regionOrder?:string[]}):PosterPipelineOutput & {reasons:string[]} {
 const reasons=new Set<string>();
 if(options.truncated)reasons.add('transcription_truncated');
 if(options.resolutionInsufficient||!lines.length)reasons.add('image_resolution_insufficient');
 if(options.classificationIncomplete)reasons.add('classification_mapping_missing');
 if(!evidence.length)reasons.add('no_date_text_detected');
 const crossedEvidence=new Set<string>();
 // The transcription line is the owner of evidence, not a classification association.
 evidence=evidence.map(item=>{
  const owner=lines.find(line=>line.id===item.lineId);
  if(!owner||owner.originalText!==item.originalText)throw new Error('Poster evidence has no matching transcription line');
  if(owner.posterRegionId!==item.posterRegionId)crossedEvidence.add(item.id);
  return {...item,posterRegionId:owner.posterRegionId};
 });
 const regions=[...new Set([...(options.regionOrder??[]),...lines.map(l=>l.posterRegionId)])];
 if(!regions.length)regions.push('unreadable');
 const results:OpportunityResult[]=[];
 for(const [regionIndex,region] of regions.entries()){
  const regionLines=lines.filter(l=>l.posterRegionId===region);
  const dates=evidence.filter(e=>e.posterRegionId===region);
  const sourceUrl=regions.length===1?sourceId:`${sourceId}:region:${regionIndex+1}`;
  const regionSummaries=classification.regions.filter(r=>r.posterRegionId===region);
  const summary=regionSummaries.length===1?regionSummaries[0]:undefined;
  const conflicts:OpportunityResult['conflicts']=[];
  const importantDates:ImportantDate[]=[];
  let weak=options.truncated||options.resolutionInsufficient||!summary||!!options.classificationIncomplete;
  const conflicting=new Set<string>();
  for(const a of dates)for(const b of dates){
   if(a.id>=b.id)continue;
   const signature=(s:string)=>normalizeLine(s).replace(/\d+/g,'#');
   if(signature(a.originalText)===signature(b.originalText)&&a.originalText!==b.originalText&&
     JSON.stringify(a.candidates.map(c=>c.value))!==JSON.stringify(b.candidates.map(c=>c.value))&&
     a.supportingViewIds.some(v=>!b.supportingViewIds.includes(v))){conflicting.add(a.id);conflicting.add(b.id);}
  }
  if(conflicting.size){reasons.add('conflicting_date_candidates');weak=true;conflicts.push({field:'Poster dates',explanation:posterReviewCopy.conflict,sourceUrls:[sourceUrl]});}
  for(const item of dates){
   for(const reason of item.reasons)reasons.add(reason);
   if(item.reasons.length)weak=true;
   for(const candidate of item.candidates){
    const mappings=classification.mappings.filter(m=>m.evidenceId===item.id&&m.candidateId===candidate.id&&m.posterRegionId===region);
    const mapping=mappings.length===1?mappings[0]:undefined;
    if(!mapping){reasons.add('classification_mapping_missing');weak=true;}
    if(mappings.length>1){reasons.add('conflicting_classification_mappings');weak=true;}
    let kind:ImportantDate['kind']=candidate.kind;
    // Explicit local application/event roles are stronger than classification. Unknowns survive as other.
    if(kind==='other'&&mapping){
     // A model cannot invent an application cutoff without supporting local labels.
     kind=['deadline','application_open','rolling'].includes(mapping.kind)?'other':mapping.kind;
     if(mapping.kind==='announcement')kind='other';
    }
    const crossRegion=crossedEvidence.has(item.id)||classification.mappings.some(m=>m.evidenceId===item.id&&m.candidateId===candidate.id&&m.posterRegionId!==region);
    if(crossRegion){reasons.add('different_poster_region');weak=true;}
    if(mappings.length>1||conflicting.has(item.id)||crossRegion)kind='other';
    let label=mapping&&mapping.kind===kind&&isEnglish(mapping.label)&&mapping.label.trim()?mapping.label:englishLabel[kind];
    if(crossRegion)label='Date — poster association needs review';
    if(!candidate.value&&kind!=='rolling')label+=' (date needs review)';
    importantDates.push({label,kind,value:candidate.value,precision:candidate.value?(candidate.precision??'date_only'):'unknown',timezone:candidate.timezone??null,
     yearResolution:candidate.value?'explicit':'unknown',sourceText:item.originalText,sourceUrl});
   }
  }
  for(const mapping of classification.mappings.filter(m=>m.posterRegionId===region)){
   if(!dates.some(e=>e.id===mapping.evidenceId&&e.candidates.some(c=>c.id===mapping.candidateId))){reasons.add('invalid_classification_mapping');weak=true;}
  }
  const unique=[...new Map(importantDates.map(d=>[JSON.stringify([d.kind,d.value,normalizeLine(d.sourceText)]),d])).values()];
  if(new Set(unique.filter(d=>d.kind==='deadline'&&d.value).map(d=>d.value)).size>1){
   weak=true;reasons.add('multiple_application_tracks');
   conflicts.push({field:'Application dates',explanation:'Multiple application closing dates are visible. Review the labelled tracks and evidence; no single deadline has been selected.',sourceUrls:[sourceUrl]});
  }
  const uncertain=unique.some(d=>d.kind==='other'||!d.value&&d.kind!=='rolling');
  if(uncertain)weak=true;
  const review=options.truncated||options.resolutionInsufficient||!lines.length?posterReviewCopy.unreadable:conflicting.size?posterReviewCopy.conflict:uncertain?posterReviewCopy.uncertain:!dates.length?posterReviewCopy.noDate:unique.some(d=>d.kind==='event_start')&&!unique.some(d=>d.kind==='deadline')?posterReviewCopy.event:'';
  const generatedSummary=summary&&isEnglish(summary.summary)?summary.summary:'';
  const validUrl=summary?.applicationUrl&&/^https?:\/\//.test(summary.applicationUrl)&&regionLines.some(l=>l.originalText.includes(summary.applicationUrl!))?summary.applicationUrl:null;
  // Assert region ownership immediately before producing the public result.
  for(const date of unique){
   if(date.sourceUrl!==sourceUrl||!dates.some(item=>item.originalText===date.sourceText&&regionLines.some(line=>line.id===item.lineId)))throw new Error('Cross-region poster evidence');
  }
  results.push(OpportunityResult.parse({title:summary?.title||`Uploaded poster${regions.length>1?' '+(regionIndex+1):''}`,organization:summary?.organization??null,opportunityType:summary?.opportunityType??'other',
   summary:[generatedSummary,review].filter(Boolean).join(' '),importantDates:unique,
   eligibility:summary?.eligibility.filter(isEnglish)??[],requirements:summary?.requirements.filter(isEnglish)??[],suggestedTasks:summary?.suggestedTasks.filter(isEnglish)??[],
   applicationUrl:validUrl,sources:[{url:sourceUrl,title:regions.length>1?`Uploaded poster ${regionIndex+1}`:'Uploaded poster',status:options.truncated?'partial':'fetched'}],
   conflicts,confidence:weak||!dates.length?'low':'medium'}));
 }
 if(classification.mappings.some(m=>!regions.includes(m.posterRegionId)))reasons.add('different_poster_region');
 return results.length===1?{kind:'single',result:results[0],reasons:[...reasons]}:{kind:'multiple',results,reasons:[...reasons]};
}
