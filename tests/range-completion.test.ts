import { describe,it,expect } from 'vitest';
import { parseApplicationRanges,normalizeDateCandidates,type DateCandidate,type RangeEvidence } from '../lib/dates/evidence';
import { ExtractionDraft } from '../lib/openai/extraction-draft';
import { normalizeImageResult } from '../lib/openai/extract-image';
import { groundResult } from '../lib/agent/grounding';
import { computeConfidence } from '../lib/agent/confidence';
import { selectReminderTarget } from '../lib/dates';
import samsung from './fixtures/samsung-range-request-example.json';
import hyundai from './fixtures/hyundai-request-example.json';
const example=()=>ExtractionDraft.parse(structuredClone(samsung.draft));
const candidate=(extra:Partial<DateCandidate>={}):DateCandidate=>({...example().importantDates[0],...extra});
const image=(dates:DateCandidate[])=>normalizeImageResult({...example(),importantDates:dates},samsung.sourceEvidence.sourceUrl);
const pairs=(dates:ReturnType<typeof image>['dates'])=>dates.map(d=>[d.kind,d.value,d.precision]);
const expected=[['application_open','2026-09-08','date_only'],['deadline','2026-09-15','date_only']];

describe('evidence-first parsing',()=>{
 it('parses both endpoints without any model date candidates',()=>{
  const [range]=parseApplicationRanges(samsung.sourceEvidence,{source:'image'});
  expect(range.rangeType).toBe('application');expect(range.sourceText).toBe(samsung.sourceEvidence.sourceText);
  expect(range.start).toMatchObject({normalizedValue:'2026-09-08',kind:'application_open',precision:'date_only',yearResolution:'explicit',yearSource:'contextual_four_digit'});
  expect(range.end).toMatchObject({normalizedValue:'2026-09-15',kind:'deadline',precision:'date_only',yearResolution:'explicit',yearSource:'contextual_four_digit'});
 });
 it.each(['지원 모집','지원모집','지원 기간','지원기간','모집 기간','모집기간','접수 기간','접수기간','신청 기간','신청기간','원서 접수','원서접수','서류 접수','서류접수'])('completes flexible label %s without rewriting evidence',label=>{
  const quote='['+label+'] : 09.08(화) ~ 09.15(화) 17:00';const result=image([candidate({sourceText:quote})]);
  expect(pairs(result.dates)).toEqual(expected);expect(result.dates.every(d=>d.sourceText===quote)).toBe(true);
 });
 it('uses visible contextual year to disambiguate a month-first numeric range',()=>{
  const evidence={...samsung.sourceEvidence,sourceText:'Application period 09/08/26 ~ 09/15/26'};
  const [range]=parseApplicationRanges(evidence,{source:'image'});
  expect(range.start.normalizedValue).toBe('2026-09-08');expect(range.end.normalizedValue).toBe('2026-09-15');
 });
 it('supports a missing inherited-year endpoint across December and January',()=>{
  const evidence={...samsung.sourceEvidence,sourceText:'Application period 26.12.20 ~ 01.10'};
  const [range]=parseApplicationRanges(evidence,{source:'image'});
  expect(range.start.normalizedValue).toBe('2026-12-20');expect(range.end.normalizedValue).toBe('2027-01-10');expect(range.end.yearSource).toBe('range_inherited_year');
 });
 it('does not assume a century from the clock when YY lacks a full-year anchor',()=>{
  const evidence={sourceText:'Application period 26.09.01 ~ 26.09.27',sourceUrl:'https://example.com',yearContextText:null,visibleYears:[]};
  expect(parseApplicationRanges(evidence,{source:'image'})).toEqual([]);
  const normalized=normalizeDateCandidates([candidate({...evidence,value:'2026-09-01'})],{source:'image'});
  expect(normalized.dates.map(d=>d.value)).toEqual(['2026-09-01','2026-09-27']);
 });
});

describe('production normalization and merging',()=>{
 it.each(['omitted','null','valid_old_rejection','incorrect_candidate','both_null','end_only','wrong_roles'] as const)('completes %s without another model call',variant=>{
  const start=candidate();const end=candidate({kind:'deadline',label:'Application deadline',value:'2026-09-15'});
  let dates:DateCandidate[]=[start];
  if(variant==='null')dates.push({...end,value:null,precision:'unknown',yearResolution:'unknown'});
  if(variant==='valid_old_rejection')dates.push(end); // Literal-year check used to remove this valid contextual value.
  if(variant==='incorrect_candidate')dates.push({...end,value:'2026-09-16'});
  if(variant==='both_null')dates=[{...start,value:null},{...end,value:null}];
  if(variant==='end_only')dates=[end];
  if(variant==='wrong_roles')dates=[{...start,kind:'event_end',label:'Event finishes'},{...end,kind:'application_open',label:'Opening'}];
  const normalized=image(dates);expect(normalized.result).toEqual(samsung.expected);expect(pairs(normalized.dates)).toEqual(expected);
  expect(normalized.decisions.map(d=>d.yearSource)).toEqual(['contextual_four_digit','contextual_four_digit']);
  expect(normalized.dates.every(d=>d.sourceText===samsung.sourceEvidence.sourceText&&d.sourceUrl===samsung.sourceEvidence.sourceUrl&&d.timezone===null)).toBe(true);
  expect(selectReminderTarget(normalized.result).primary?.value).toBe('2026-09-15');
  expect(normalized.weak).toBe(false);expect(normalized.dropped).toBe(0);
 });
 it('deduplicates equivalent dates using source, role, value and normalized evidence',()=>{
  const first=candidate();const end=candidate({kind:'deadline',value:'2026-09-15'});
  expect(pairs(image([first,first,end,end,{...first,sourceText:first.sourceText.replaceAll(' ','  ')}]).dates)).toEqual(expected);
 });
 it('preserves raw validation decisions separately from the recovered final decisions',()=>{
  const normalized=image([candidate(),candidate({kind:'deadline',value:'2026-09-16'})]);
  expect(normalized.candidateDecisions[1].accepted).toBe(false);expect(normalized.decisions.every(d=>d.accepted)).toBe(true);expect(normalized.completedRanges).toHaveLength(1);
 });
 it('does not invent an offset even if a candidate supplies one without visible timezone evidence',()=>{
  const normalized=image([candidate(),candidate({kind:'deadline',value:'2026-09-15T17:00:00+09:00',precision:'date_time',timezone:'Asia/Seoul'})]);
  expect(pairs(normalized.dates)).toEqual(expected);expect(normalized.dates[1].timezone).toBeNull();expect(normalized.dates[1].sourceText).toContain('17:00');
 });
 it('does not mistake a source URL path for a visible IANA timezone',()=>{
  const quote=samsung.sourceEvidence.sourceText+' https://example.com/careers';
  const normalized=image([candidate({sourceText:quote}),candidate({sourceText:quote,kind:'deadline',value:'2026-09-15T17:00:00+09:00',precision:'date_time',timezone:'Asia/Seoul'})]);
  expect(normalized.dates[1]).toMatchObject({value:'2026-09-15',precision:'date_only',timezone:null});
 });
 it('preserves an existing grounded timed endpoint with a visible timezone',()=>{
  const quote=samsung.sourceEvidence.sourceText+' KST';
  const normalized=image([candidate({sourceText:quote}),candidate({sourceText:quote,kind:'deadline',value:'2026-09-15T17:00:00+09:00',precision:'date_time',timezone:'Asia/Seoul'})]);
  expect(normalized.dates[1]).toMatchObject({kind:'deadline',value:'2026-09-15T17:00:00+09:00',precision:'date_time'});
 });
 it('both request fixtures pass the real image and URL normalization functions',()=>{
  for(const fixture of [samsung,hyundai]){
   const raw=ExtractionDraft.parse(structuredClone(fixture.draft));
   expect(normalizeImageResult(raw,fixture.expected.sources[0].url).result).toEqual(fixture.expected);
   const url='https://example.com/opportunity';const dates=raw.importantDates.map(d=>({...d,sourceUrl:url}));
   const source={url,title:raw.title,canonicalUrl:null,text:dates[0].yearContextText+' '+dates[0].sourceText,links:[],method:'plain fetch' as const};
   const grounded=groundResult({...raw,importantDates:dates},source);
   expect(grounded.result.importantDates.map(d=>[d.kind,d.value])).toEqual(fixture.expected.importantDates.map(d=>[d.kind,d.value]));
   if(fixture===samsung)expect(computeConfidence(grounded.result,url,grounded.dropped,grounded.weak,grounded.contextual)).toBe('medium');
  }
 });
});

describe('no completion without unambiguous grounded evidence',()=>{
 it.each(['Event period','행사 기간','Interview period','Judging period','Dates','Deadline'])('does not complete %s into applications',label=>{
  const result=image([candidate({sourceText:label+' 09.08 ~ 09.15',kind:'other'})]);
  expect(result.completedRanges).toEqual([]);expect(result.dates.filter(d=>d.kind==='deadline')).toHaveLength(0);
 });
 it('rejects conflicting contextual years and unsubstantiated visibleYears',()=>{
  for(const extra of [{yearContextText:'2025년 안내 2026년 모집',visibleYears:[2025,2026]},{yearContextText:null,visibleYears:[2026]}]){
   expect(image([candidate(extra)]).completedRanges).toEqual([]);
  }
 });
 it('does not complete an inline range contradicted by the supplied contextual year',()=>{
  const evidence={...samsung.sourceEvidence,sourceText:'Application period 26.09.01 ~ 26.09.27',yearContextText:'2025 recruitment',visibleYears:[2025]};
  expect(parseApplicationRanges(evidence,{source:'image'})).toEqual([]);
 });
 it('cannot choose a numeric interpretation merely because a raw candidate preferred it',()=>{
  const normalized=image([candidate({sourceText:'Application period 09/08/09 ~ 09/15/09',yearContextText:'2009 recruitment',visibleYears:[2009],value:'2009-09-08'})]);
  expect(normalized.completedRanges).toEqual([]);expect(normalized.dates).toHaveLength(1);
 });
 it('does not combine endpoints from separate quotes',()=>{
  expect(image([candidate({sourceText:'지원 모집 09.08'}),candidate({sourceText:'09.15',value:null,kind:'deadline',yearContextText:null,visibleYears:[]})]).completedRanges).toEqual([]);
 });
 it('cannot borrow another poster/source context',()=>{
  const normalized=normalizeDateCandidates([candidate({sourceUrl:'urn:poster:sha256:one'}),candidate({sourceUrl:'urn:poster:sha256:two',yearContextText:null,visibleYears:[]})],{source:'image'});
  expect(normalized.dates.every(d=>d.sourceUrl==='urn:poster:sha256:one')).toBe(true);
 });
 it('conflicting contexts on duplicate candidates block completion',()=>{
  const normalized=image([candidate(),candidate({value:null,yearContextText:'2025년 모집',visibleYears:[2025]})]);expect(normalized.completedRanges).toEqual([]);expect(normalized.dates.some(d=>d.kind==='deadline'&&d.value)).toBe(false);
 });
 it('whitespace-equivalent evidence cannot hide conflicting contextual years',()=>{
  const normalized=image([candidate(),candidate({sourceText:samsung.sourceEvidence.sourceText.replaceAll(' ','  '),value:null,yearContextText:'2025년 모집',visibleYears:[2025]})]);
  expect(normalized.completedRanges).toEqual([]);expect(normalized.dates.some(d=>d.kind==='deadline'&&d.value)).toBe(false);
 });
 it.each(['지원 모집 09.15 ~ 09.08','지원 모집 09.08 ~ 09.15 ~ 09.22','지원 모집 09.31 ~ 10.10'])('rejects reversed, chained or invalid ranges: %s',sourceText=>{
  expect(parseApplicationRanges({...samsung.sourceEvidence,sourceText},{source:'image'})).toEqual([]);
 });
 it('URL completion requires both the quote and context inside the exact slice',()=>{
  const evidence:RangeEvidence={...samsung.sourceEvidence,sourceUrl:'https://example.com'};
  expect(parseApplicationRanges(evidence,{source:'url',slice:evidence.sourceText})).toEqual([]);
  expect(parseApplicationRanges(evidence,{source:'url',slice:evidence.yearContextText!})).toEqual([]);
  expect(parseApplicationRanges(evidence,{source:'url',slice:evidence.sourceText+' '.repeat(15000)+evidence.yearContextText})).toEqual([]);
 });
});
