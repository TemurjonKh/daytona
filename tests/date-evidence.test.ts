import { describe,it,expect } from 'vitest';
import { validateDateEvidence,normalizeDateCandidates,extractDateTokens,type DateCandidate } from '../lib/dates/evidence';
import { groundResult } from '../lib/agent/grounding';
import { normalizeImageResult } from '../lib/openai/extract-image';
import { computeConfidence } from '../lib/agent/confidence';
import { mockResults } from '../lib/mock-data';
const url='https://example.com/opportunity';
const candidate=(text:string,extra:Partial<DateCandidate>={}):DateCandidate=>({label:'Date',kind:'other',value:'2026-09-27',precision:'date_only',timezone:null,yearResolution:'explicit',sourceUrl:url,sourceText:text,yearContextText:null,visibleYears:[],...extra});
const validate=(date:DateCandidate)=>validateDateEvidence(date,{source:'image'});
const context={yearContextText:'2026 Autumn opportunities',visibleYears:[2026]};
const draft=(dates:DateCandidate[])=>({...structuredClone(mockResults.dated),importantDates:dates});
const source=(text:string)=>({url,title:'Opportunity',canonicalUrl:null,text,links:[],method:'plain fetch' as const});

describe('printed date formats',()=>{
 it.each(['2026-09-27','2026.09.27','2026/09/27','2026년 9월 27일','27 September 2026','27 Sept 2026','September 27, 2026','September 27th, 2026','Sep 27th 2026'])('%s is inline four-digit evidence',text=>{expect(validate(candidate(text))).toMatchObject({accepted:true,normalizedValue:'2026-09-27',yearResolution:'explicit',yearSource:'inline_four_digit',precision:'date_only'});});
 it.each(['26-09-27','26.09.27','26/09/27','26년 9월 27일','9/27/26','09/27/26'])('%s is inline two-digit evidence',text=>{expect(validate(candidate(text))).toMatchObject({accepted:true,normalizedValue:'2026-09-27',yearSource:'inline_two_digit'});});
 it.each(['9/27/2026','09/27/2026'])('%s supports month-first years',text=>{expect(validate(candidate(text)).accepted).toBe(true);});
 it.each(['9월 27일','9.27','09.27','9/27','09/27','9.27(일)','9/27(Sun)','27 September','27 Sept.','September 27th','Sep 27th','Sep 27'])('%s uses separate visible context',text=>{expect(validate(candidate(text,context))).toMatchObject({accepted:true,normalizedValue:'2026-09-27',yearSource:'contextual_four_digit',yearResolution:'explicit'});expect(validate(candidate(text)).accepted).toBe(false);});
 it.each(['26.09.28','2026-08-27','2025/09/27','09/28/26'])('rejects mismatched %s',text=>{expect(validate(candidate(text))).toMatchObject({accepted:false,reasons:['numeric_date_mismatch']});});
 it('generates both numeric interpretations but accepts only a unique candidate match',()=>{const tokens=extractDateTokens('01/02/03');expect(tokens[0].readings).toHaveLength(2);expect(validate(candidate('01/02/03',{value:'2003-01-02'})).accepted).toBe(true);expect(validate(candidate('01/02/03',{value:'2001-02-03'})).accepted).toBe(true);expect(validate(candidate('09/09/09',{value:'2009-09-09'}))).toMatchObject({accepted:false,reasons:['ambiguous_numeric_date']});});
 it('rejects invalid calendar dates and never reparses an invalid numeric token as a shorter date',()=>{expect(validate(candidate('2026.02.29',{value:'2026-02-29'})).accepted).toBe(false);expect(validate(candidate('2026.13.27')).accepted).toBe(false);expect(extractDateTokens('2026.13.27')).toHaveLength(1);});
});

describe('local range semantics and inherited years',()=>{
 it.each(['2026.09.01 ~ 2026.09.27','26.09.01 ~ 26.09.27','26-09-01 to 26-09-27','26/09/01–26/09/27','9월 1일 ~ 9월 27일'])('%s maps opening and cutoff independently',range=>{const text='모집기간 '+range;const dates=normalizeDateCandidates([candidate(text,{...context,value:'2026-09-01'}),candidate(text,context)],{source:'image'}).dates;expect(dates.map(d=>[d.kind,d.value])).toEqual([['application_open','2026-09-01'],['deadline','2026-09-27']]);expect(dates.every(d=>d.sourceText===text)).toBe(true);});
 it.each(['~','-','–','—','to','through','부터','에서'])('recognizes contiguous %s ranges',join=>{expect(validate(candidate('Application period 26.09.01 '+join+' 09.27'))).toMatchObject({accepted:true,kind:'deadline',yearSource:'range_inherited_year'});});
 it('inherits the printed start year and rolls December into the next year',()=>{expect(validate(candidate('접수기간 26.12.20 ~ 01.10',{value:'2027-01-10'}))).toMatchObject({accepted:true,normalizedValue:'2027-01-10',yearSource:'range_inherited_year',yearResolution:'explicit'});expect(validate(candidate('접수기간 26.12.20 ~ 01.10',{value:'2026-01-10'})).accepted).toBe(false);});
 it('rejects inherited years when relevant context conflicts',()=>{expect(validate(candidate('접수기간 26.09.01 ~ 09.27',{yearContextText:'2025 season',visibleYears:[2025]}))).toMatchObject({accepted:false,reasons:['invalid_range_year']});});
 it('unrelated dates cannot inherit years',()=>{expect(validate(candidate('접수기간 2026.09.01; Other date 09.27')).accepted).toBe(false);});
 it.each(['Event period','Concert','Fair','행사기간'])('%s remains an event range',label=>{const text=label+' 2026.09.01 ~ 2026.09.27';const dates=normalizeDateCandidates([candidate(text,{value:'2026-09-01',kind:'deadline'}),candidate(text,{kind:'deadline'})],{source:'image'}).dates;expect(dates.map(d=>d.kind)).toEqual(['event_start','event_end']);});
 it.each(['Announcement','Interviews','Judging','발표','면접','심사'])('%s cannot manufacture deadlines',label=>{expect(validate(candidate(label+' 2026.09.27',{kind:'deadline'})).accepted).toBe(false);});
 it('post-date cutoffs stay supported and generic event deadlines are not application cutoffs',()=>{
  expect(validate(candidate('2026.09.27 접수마감',{kind:'deadline'})).accepted).toBe(true);
  expect(validate(candidate('2026.09.27 deadline',{kind:'deadline'})).accepted).toBe(true);
  expect(validate(candidate('Judging deadline 2026.09.27',{kind:'deadline'})).accepted).toBe(false);
  expect(validate(candidate('Event registration deadline 2026.09.27',{kind:'deadline'})).accepted).toBe(true);
 });
 it('an unrelated period label cannot turn a single event into a deadline',()=>{expect(validate(candidate('Application period listed elsewhere; Event 2026.09.27',{kind:'deadline'})).accepted).toBe(false);});
});

describe('context provenance and confidence',()=>{
 it('conflicting validated years including a neighboring-poster contamination reject context',()=>{const date=candidate('모집기간 9월 1일 ~ 9월 27일',{yearContextText:'2025년 안내 2026년 모집',visibleYears:[2025,2026]});expect(validate(date)).toMatchObject({accepted:false,reasons:['conflicting_contextual_years']});});
 it('unsupported visibleYears are ignored and diagnosed, not used as year evidence',()=>{expect(validate(candidate('9.27',{visibleYears:[2026]}))).toMatchObject({accepted:false});const good=validate(candidate('9.27',{...context,visibleYears:[2025,2026]}));expect(good.accepted).toBe(true);expect(good.reasons).toContain('invalid_year_evidence');});
 it('URL context must occur verbatim in the exact bounded slice; footer years do not conflict',()=>{const date=candidate('Application deadline Sep 27',context);const s=source(context.yearContextText+' '+date.sourceText+' Copyright 2024');const grounded=groundResult(draft([date]),s);expect(grounded.result.importantDates).toHaveLength(1);expect(grounded.contextual).toBe(true);expect(computeConfidence(grounded.result,url,grounded.dropped,grounded.weak,grounded.contextual)).toBe('medium');expect(groundResult(draft([date]),source(date.sourceText)).result.importantDates).toHaveLength(0);expect(groundResult(draft([date]),source(date.sourceText+' '.repeat(15000)+context.yearContextText)).result.importantDates).toHaveLength(0);});
 it('a context shared with conflicting source years is rejected',()=>{expect(validate(candidate('2025 archive: deadline 9.27',context)).accepted).toBe(false);});
 it('inference remains opt-in and low confidence, never automatic',()=>{const d=candidate('Deadline September 27',{yearResolution:'inferred_next_occurrence'});expect(validate(d).accepted).toBe(false);const result=validateDateEvidence(d,{source:'url',allowInferred:true});expect(result).toMatchObject({accepted:true,yearSource:'inferred',weak:true,yearResolution:'inferred_next_occurrence'});expect(validate(candidate(d.sourceText)).accepted).toBe(false);});
 it.each(['(월)','Mon','(Mon)'])('weekday mismatch %s preserves the date with weak evidence',marker=>{const d=candidate('Deadline 2026.09.27'+marker,{kind:'deadline'});const decision=validate(d);expect(decision).toMatchObject({accepted:true,weak:true});expect(decision.reasons).toContain('weekday_mismatch');const g=groundResult(draft([d]),source(d.sourceText));expect(computeConfidence(g.result,url,g.dropped,g.weak,g.contextual)).toBe('low');});
 it('weekday matching is diagnostic only and cannot establish a date/year',()=>{expect(validate(candidate('2026.09.27(일)')).reasons).toContain('weekday_matches');expect(validate(candidate('Sunday')).accepted).toBe(false);expect(validate(candidate('9.27(일)')).accepted).toBe(false);});
 it('time-less dates stay date_only; printed matching times stay date_time',()=>{expect(validate(candidate('Deadline 2026.09.27',{value:'2026-09-27T18:00:00+09:00',precision:'date_time'}))).toMatchObject({accepted:true,normalizedValue:'2026-09-27',precision:'date_only'});expect(validate(candidate('Deadline September 27, 2026 at 6:00 PM KST',{value:'2026-09-27T18:00:00+09:00',precision:'date_time'}))).toMatchObject({accepted:true,normalizedValue:'2026-09-27T18:00:00+09:00',precision:'date_time'});});
 it('rolling requires rolling evidence and never invents a date',()=>{expect(validate(candidate('상시 채용, 채용 시 마감',{kind:'deadline'}))).toMatchObject({accepted:true,kind:'rolling',normalizedValue:null,precision:'unknown'});expect(validate(candidate('No printed dates',{kind:'rolling',value:null})).accepted).toBe(false);});
});

const periodLabels=['모집기간','접수기간','지원기간','신청기간','원서접수','서류접수','application period','application window','registration period','application dates','applications open','apply between'];
const cutoffLabels=['마감','접수마감','지원마감','신청마감','deadline','apply by','closing date','applications close','registration deadline','registration closes'];
describe('shared labels in both pipelines',()=>{
 it.each(periodLabels)('%s maps both endpoints identically',label=>{const text=label+' 26.09.01 ~ 26.09.27';const data=draft([candidate(text,{value:'2026-09-01'}),candidate(text)]);const web=groundResult(data,source(text)).result.importantDates;const image=normalizeImageResult(data,'urn:poster:sha256:offline').result.importantDates;expect(web.map(d=>[d.kind,d.value])).toEqual([['application_open','2026-09-01'],['deadline','2026-09-27']]);expect(image.map(d=>[d.kind,d.value])).toEqual(web.map(d=>[d.kind,d.value]));expect(validate(candidate(label+' 26.09.27',{kind:'deadline'})).accepted).toBe(false);});
 it.each(cutoffLabels)('%s accepts a validated cutoff in both pipelines',label=>{const text=label+' 26.09.27';const data=draft([candidate(text,{kind:'deadline'})]);expect(groundResult(data,source(text)).result.importantDates).toHaveLength(1);expect(normalizeImageResult(data,'urn:poster:sha256:offline').result.importantDates).toHaveLength(1);});
 it('strips internal metadata without altering original Korean evidence or English labels',()=>{const d=candidate('모집기간 26.09.01(화) ~ 26.09.27(일)',{...context,kind:'deadline',label:'Application deadline'});const normalized=normalizeImageResult(draft([d]),'urn:poster:sha256:offline');expect(normalized.result.importantDates.find(date=>date.kind==='deadline')).toMatchObject({sourceText:d.sourceText,label:'Application deadline',value:'2026-09-27'});expect(normalized.result.importantDates[0]).not.toHaveProperty('yearContextText');expect(normalized.result.importantDates[0]).not.toHaveProperty('visibleYears');expect(normalized.result.confidence).toBe('medium');});
});
