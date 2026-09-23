import type { ImportantDate } from "@/lib/schema";

// Shared by web and image grounding. Labels apply to the local evidence, not page-wide text.
export const applicationPeriod = /지원\s*모집|모집\s*기간|접수\s*기간|지원\s*기간|신청\s*기간|원서\s*접수|서류\s*접수|application\s+(?:period|window|dates)|registration\s+period|applications?\s+open|apply\s+between/iu;
export const applicationCutoff = /마감|접수\s*기한|지원\s*기한|신청\s*기한|\bdeadline\b|\bapply\s+by\b|\bclosing\s+date\b|\bapplications?\s+(?:close[sd]?|due)\b|\bregistration\s+(?:deadline|closes?)\b/iu;
export const rollingPattern = /\brolling\b|until (?:all .* )?filled|상시\s*채용|채용\s*시\s*마감/iu;
const eventPeriod = /행사|공연|콘서트|박람회|전시|축제|개최|\bevent\b|\bconcert\b|\bfair\b|\bfestival\b|\bconference\b|\bexhibition\b/iu;
const otherPeriod = /발표|면접|심사|\bannouncement\b|\binterviews?\b|\bjudging\b/iu;
export type DateCandidate = ImportantDate & { yearContextText?: string | null; visibleYears?: number[] };
export type YearSource = 'inline_four_digit' | 'inline_two_digit' | 'contextual_four_digit' | 'range_inherited_year' | 'inferred' | 'unknown';
type Reading = { year: number | null; yearDigits: 0 | 2 | 4; month: number; day: number; order: string };
export type DateToken = { start: number; end: number; text: string; readings: Reading[]; weekday: number | null; numeric: boolean };
export type DateDecision = {
 candidateValue:string|null; accepted: boolean; normalizedValue: string | null; precision: ImportantDate['precision'];
 yearResolution: ImportantDate['yearResolution']; yearSource: YearSource; weak: boolean;
 reasons: string[]; matchedToken: DateToken | null; tokens: DateToken[]; kind: ImportantDate['kind'];
};
export type EvidenceOptions = { source: 'url' | 'image'; slice?: string; allowInferred?: boolean };
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const monthPattern = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)';
const weekdays = ['sun','mon','tue','wed','thu','fri','sat'];
const koreanDays = ['일','월','화','수','목','금','토'];
const weekdaySuffix = /^\s*(?:\(([월화수목금토일])\)|\(?\b(Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?)\b\.?\)?)/iu;
const validMD = (m:number,d:number)=>m>=1&&m<=12&&d>=1&&d<=[31,29,31,30,31,30,31,31,30,31,30,31][m-1];
const validYMD = (y:number,m:number,d:number)=>y>=1000&&y<=9999&&validMD(m,d)&&new Date(Date.UTC(y,m-1,d)).getUTCDate()===d;
const yearDigits = (text:string):0|2|4=>text.length===4?4:text.length===2?2:0;
const yearMatches = (r:Reading,y:number)=>r.yearDigits===4?r.year===y:r.yearDigits===2?r.year===y%100:r.year===null;
const fullYears = (text:string)=>[...new Set([...text.matchAll(/(?<!\d)([12]\d{3})(?!\d)/g)].map(m=>+m[1]))];
const isoDate = (y:number,m:number,d:number)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

/** Parse bounded verbatim evidence; alternative numeric readings retain the same token span. */
export function extractDateTokens(text:string):DateToken[] {
 const tokens:DateToken[]=[];
 const add=(match:RegExpMatchArray,readings:Reading[],numeric=false)=>{
   const start=match.index!;let end=start+match[0].length;
   if(tokens.some(t=>start<t.end&&end>t.start))return;
   const marker=text.slice(end).match(weekdaySuffix);
   let weekday:number|null=marker?(marker[1]?koreanDays.indexOf(marker[1]):weekdays.indexOf(marker[2].slice(0,3).toLowerCase())):null;
   if(marker)end+=marker[0].length;
   if(weekday===null){const before=text.slice(0,start).match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:day)?\.?[,\s]*$/i);if(before)weekday=weekdays.indexOf(before[1].toLowerCase());}
   tokens.push({start,end,text:text.slice(start,end),readings:readings.filter(r=>validMD(r.month,r.day)),weekday,numeric});
 };
 for(const m of text.matchAll(/(?<![\d./-])(\d{2}|\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/gu))add(m,[{year:+m[1],yearDigits:yearDigits(m[1]),month:+m[2],day:+m[3],order:'ymd'}]);
 // Claim the whole three-part token even if invalid, so it cannot be reparsed as a valid substring.
 for(const m of text.matchAll(/(?<![\d./-])(\d{1,4})([./-])(\d{1,2})\2(\d{1,4})(?![\d./-])/g)){
   const readings:Reading[]=[];
   if(yearDigits(m[1])&&m[4].length<=2)readings.push({year:+m[1],yearDigits:yearDigits(m[1]),month:+m[3],day:+m[4],order:'ymd'});
   if(m[1].length<=2&&yearDigits(m[4]))readings.push({year:+m[4],yearDigits:yearDigits(m[4]),month:+m[1],day:+m[3],order:'mdy'});
   add(m,readings,true);
 }
 for(const m of text.matchAll(new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}|\\d{2})(?![\\d:./-]))?\\b`,'gi')))add(m,[{year:m[3]?+m[3]:null,yearDigits:m[3]?yearDigits(m[3]):0,month:months.findIndex(x=>x.startsWith(m[1].slice(0,3).toLowerCase()))+1,day:+m[2],order:'month_name'}]);
 for(const m of text.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\.?(?:\\s+(\\d{4}|\\d{2})(?![\\d:./-]))?`,'gi')))add(m,[{year:m[3]?+m[3]:null,yearDigits:m[3]?yearDigits(m[3]):0,month:months.findIndex(x=>x.startsWith(m[2].slice(0,3).toLowerCase()))+1,day:+m[1],order:'day_month_name'}]);
 for(const m of text.matchAll(/(?<!\d)(\d{1,2})월\s*(\d{1,2})일/gu))add(m,[{year:null,yearDigits:0,month:+m[1],day:+m[2],order:'md'}]);
 for(const m of text.matchAll(/(?<![\d./-])(\d{1,2})([./])(\d{1,2})(?![\d./-])/g))add(m,[{year:null,yearDigits:0,month:+m[1],day:+m[3],order:'md'}],true);
 return tokens.sort((a,b)=>a.start-b.start);
}

type Range = { start:DateToken; end:DateToken; kind:'application'|'event'|'other'|null; applicationPeriod:boolean };
function localLabel(text:string):Range['kind'] {
 // Generic 'deadline' on a judging/event schedule is not an application cutoff.
 const explicitApplication=/applications?|registration|apply|접수|지원|신청|원서|서류|모집/iu.test(text);
 if(!explicitApplication){if(otherPeriod.test(text))return 'other';if(eventPeriod.test(text))return 'event';}
 const labels: {index:number;kind:Range['kind']}[]=[];
 for(const [pattern,kind] of [[applicationPeriod,'application'],[applicationCutoff,'application'],[eventPeriod,'event'],[otherPeriod,'other']] as const)
  for(const m of text.matchAll(new RegExp(pattern.source,'giu')))labels.push({index:m.index!,kind});
 return labels.sort((a,b)=>b.index-a.index)[0]?.kind??null;
}
function ranges(text:string,tokens:DateToken[]):Range[]{
 const found:Range[]=[];
 for(let i=0;i<tokens.length-1;i++){
  const a=tokens[i],b=tokens[i+1];
  const gap=text.slice(a.end,b.start).trim();
  if(!/^(?:~|〜|～|-|–|—|to|through|부터|에서)$/iu.test(gap))continue;
  const prefix=text.slice(i?tokens[i-1].end:0,a.start).split(/[;\n]/).filter(s=>s.trim()).at(-1)??'';
  found.push({start:a,end:b,kind:localLabel(prefix),applicationPeriod:applicationPeriod.test(prefix)});
 }
 return found;
}

function yearEvidence(candidate:Pick<DateCandidate,'sourceText'|'yearContextText'|'visibleYears'>,options:EvidenceOptions){
 const context=candidate.yearContextText??'';
 const contextValid=!!context&&(options.source==='image'||(options.slice??'').slice(0,15000).includes(context));
 const reasons:string[]=[];
 if(context&&!contextValid)reasons.push('invalid_year_evidence');
 const contextYears=contextValid?fullYears(context):[];
 for(const year of candidate.visibleYears??[])if(!contextValid||!contextYears.includes(year))reasons.push('invalid_year_evidence');
 const relevantYears=[...new Set([...fullYears(candidate.sourceText),...contextYears])];
 return {context,contextValid,contextYears,relevantYears,reasons};
}

/** Validates only supplied evidence. It never reads a clock, network, or neighboring source. */
export function validateDateEvidence(candidate:DateCandidate,options:EvidenceOptions):DateDecision {
 const text=candidate.sourceText;
 const tokens=extractDateTokens(text);
 const base:DateDecision={candidateValue:candidate.value,accepted:false,normalizedValue:null,precision:'unknown',yearResolution:'unknown',yearSource:'unknown',weak:false,reasons:[],matchedToken:null,tokens,kind:candidate.kind};
 const reject=(reason:string):DateDecision=>({...base,weak:true,reasons:[...base.reasons,reason]});
 if(!text.trim())return reject('missing_date_evidence');
 if(rollingPattern.test(text))return {...base,accepted:true,kind:'rolling',reasons:['rolling_evidence']};
 if(candidate.kind==='rolling')return reject('missing_rolling_evidence');
 if(!candidate.value)return {...base,accepted:true,weak:true,reasons:['unknown_date']};
 const value=candidate.value;
 const parts=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
 if(!parts||!validYMD(+parts[1],+parts[2],+parts[3])||!Number.isFinite(Date.parse(value)))return reject('invalid_structured_date');
 const y=+parts[1],m=+parts[2],d=+parts[3];
 const {context,contextValid,contextYears,relevantYears,reasons:contextReasons}=yearEvidence(candidate,options);
 base.reasons.push(...contextReasons);
 const dateRanges=ranges(text,tokens);
 type Match={token:DateToken;reading:Reading;source:YearSource;range?:Range};
 const matches:Match[]=[];const failures:string[]=[];
 for(const token of tokens)for(const reading of token.readings){
  if(reading.month!==m||reading.day!==d)continue;
  const range=dateRanges.find(r=>r.start===token||r.end===token);
  if(reading.yearDigits){if(yearMatches(reading,y))matches.push({token,reading,range,source:reading.yearDigits===4?'inline_four_digit':'inline_two_digit'});continue;}
  if(range?.end===token&&range.kind&&range.start.readings.some(r=>r.yearDigits)){
   const starts=range.start.readings.filter(r=>r.yearDigits).flatMap(r=>[y,y-1].filter(year=>yearMatches(r,year)&&validYMD(year,r.month,r.day)).map(year=>({r,year})));
   let inherited=false;
   for(const start of starts){
    const endYear=start.year+(m*100+d<start.r.month*100+start.r.day?1:0);
    const days=(Date.UTC(endYear,m-1,d)-Date.UTC(start.year,start.r.month-1,start.r.day))/86400000;
    if(endYear===y&&days>0&&days<=370&&relevantYears.every(year=>year===start.year)){
     matches.push({token,reading,range,source:'range_inherited_year'});inherited=true;
    }
   }
   if(!inherited)failures.push('invalid_range_year');
   continue;
  }
  if(relevantYears.length>1){failures.push('conflicting_contextual_years');continue;}
  // Context must be separately preserved, even when its four-digit year also appears in sourceText.
  if(contextValid&&contextYears.length===1&&relevantYears.length===1&&contextYears[0]===y){matches.push({token,reading,range,source:'contextual_four_digit'});continue;}
  if(!context&&relevantYears.length===0&&candidate.yearResolution==='inferred_next_occurrence'&&options.allowInferred){matches.push({token,reading,range,source:'inferred'});continue;}
  failures.push(context&&!contextValid?'invalid_year_evidence':contextYears.length?'contextual_year_mismatch':'missing_year_evidence');
 }
 if(!matches.length)return reject(failures[0]??(tokens.some(t=>t.numeric)?'numeric_date_mismatch':'date_evidence_mismatch'));
 // Two valid readings of the same numeric token that both match are indistinguishable.
 if(tokens.some(t=>t.numeric&&matches.filter(x=>x.token===t).length>1))return reject('ambiguous_numeric_date');
 const match=matches.find(x=>x.range&&(candidate.kind==='application_open'||candidate.kind==='event_start'?x.range.start===x.token:candidate.kind==='deadline'||candidate.kind==='event_end'?x.range.end===x.token:false))??matches[0];
 let kind=candidate.kind;
 if(match.range?.kind==='application')kind=match.range.start===match.token?'application_open':'deadline';
 else if(match.range?.kind==='event')kind=match.range.start===match.token?'event_start':'event_end';
 else if(match.range?.kind==='other'&&(kind==='deadline'||kind==='application_open'))return reject('non_application_evidence');
 else if(kind==='deadline'&&!applicationCutoff.test(text))return reject('missing_application_cutoff');
 // A standalone event/interview/announcement cannot borrow a period label from elsewhere.
 if(!match.range&&kind==='deadline'){
  const before=text.slice(0,match.token.start);const after=text.slice(match.token.end);
  const local=before.slice(before.lastIndexOf(';')+1)+match.token.text+after.split(';')[0];
  if(!applicationCutoff.test(local)||localLabel(local)!=='application')return reject('non_application_evidence');
 }
 let weak=match.source==='inferred'||candidate.yearResolution==='inferred_next_occurrence';
 const reasons=[...base.reasons,match.source];
 if(match.token.weekday!==null){
  if(new Date(Date.UTC(y,m-1,d)).getUTCDay()!==match.token.weekday){weak=true;reasons.push('weekday_mismatch');}else reasons.push('weekday_matches');
 }
 let normalizedValue=isoDate(y,m,d);let precision:ImportantDate['precision']='date_only';
 if(candidate.precision==='date_time'){
  const clock=value.match(/T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
  const tail=text.slice(match.token.end,tokens.find(t=>t.start>match.token.start)?.start??text.length);
  const printed=[...tail.matchAll(/(?:\b(at)\s+)?(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2})|\s*시(?:\s*(\d{1,2})분)?|\s*(am|pm)\b)(?:\s*(am|pm)\b)?/gi)];
  if(printed.length&&clock){
   const matchesClock=printed.some(t=>{let hour=+t[3];const marker=(t[2]??t[6]??t[7]??'').toLowerCase();if(marker==='오후'||marker==='pm')hour=hour%12+12;else if(marker==='오전'||marker==='am')hour%=12;return hour===+clock[1]&&+(t[4]??t[5]??0)===+clock[2];});
   if(!matchesClock)return reject('time_evidence_mismatch');
   normalizedValue=value;precision='date_time';
  }else {weak=true;reasons.push(printed.length?'missing_time_offset':'no_printed_time');}
 }
 return {...base,accepted:true,normalizedValue,precision,yearResolution:match.source==='inferred'?'inferred_next_occurrence':'explicit',yearSource:match.source,weak,reasons:[...new Set(reasons)],matchedToken:match.token,kind};
}

export type RangeEvidence=Pick<DateCandidate,'sourceText'|'sourceUrl'|'yearContextText'|'visibleYears'>;
export type NormalizedApplicationRange={rangeType:'application';start:DateDecision;end:DateDecision;sourceText:string;sourceUrl:string};

/** Parse evidence independently of candidate count/kinds/values. A same-quote validated
 * candidate may anchor the century of a printed YY token only; it never supplies a missing year. */
export function parseApplicationRanges(evidence:RangeEvidence,options:EvidenceOptions,validatedCenturyYears:readonly number[]=[]):NormalizedApplicationRange[]{
 if(options.source==='url'&&!(options.slice??'').slice(0,15000).includes(evidence.sourceText))return [];
 const context=yearEvidence(evidence,options);
 if(context.context&&!context.contextValid||context.contextYears.length>1)return [];
 const tokens=extractDateTokens(evidence.sourceText);const parsed=ranges(evidence.sourceText,tokens);
 const result:NormalizedApplicationRange[]=[];
 for(const range of parsed){
  if(range.kind!=='application'||!range.applicationPeriod)continue;
  // Chained/overlapping ranges and unresolved alternative numeric readings cannot create dates.
  if(parsed.some(other=>other!==range&&(other.start===range.end||other.end===range.start)))continue;
  const compatibleReadings=(token:DateToken)=>{
   if(token.readings.length<=1||context.contextYears.length!==1)return token.readings;
   // Only visible context, never a model-preferred value, can disambiguate these readings.
   return token.readings.filter(reading=>reading.yearDigits&&yearMatches(reading,context.contextYears[0]));
  };
  const starts=compatibleReadings(range.start),ends=compatibleReadings(range.end);
  if(starts.length!==1||ends.length!==1)continue;
  const start=starts[0],end=ends[0];
  const inlineYears=[start,end].filter(r=>r.yearDigits===4).map(r=>r.year!);
  const anchors=[...new Set([...inlineYears,...context.contextYears])];
  const resolve=(reading:Reading):number|null=>{
   if(reading.yearDigits===4)return reading.year;
   if(reading.yearDigits===2){
    const centuries=[...new Set((anchors.length?anchors:validatedCenturyYears).map(y=>Math.floor(y/100)*100))];
    return centuries.length===1?centuries[0]+reading.year!:null;
   }
   return context.contextValid&&context.contextYears.length===1&&context.relevantYears.length===1?context.contextYears[0]:null;
  };
  const startYear=resolve(start);if(startYear===null)continue;
  let endYear=resolve(end);
  if(!end.yearDigits&&start.yearDigits)endYear=startYear+(end.month*100+end.day<start.month*100+start.day?1:0);
  if(endYear===null||!validYMD(startYear,start.month,start.day)||!validYMD(endYear,end.month,end.day))continue;
  if(context.contextYears.length===1&&!context.contextYears.some(year=>year===startYear||year===endYear))continue;
  const startValue=isoDate(startYear,start.month,start.day),endValue=isoDate(endYear,end.month,end.day);
  if(Date.parse(endValue)<Date.parse(startValue))continue;
  const endpoint=(value:string,kind:ImportantDate['kind'])=>validateDateEvidence({...evidence,label:kind==='deadline'?'Application deadline':'Applications open',kind,value,precision:'date_only',timezone:null,yearResolution:'explicit'}, {...options,allowInferred:false});
  const a=endpoint(startValue,'application_open'),b=endpoint(endValue,'deadline');
  if(!a.accepted||!b.accepted||a.kind!=='application_open'||b.kind!=='deadline')continue;
  if(a.matchedToken?.start!==range.start.start||b.matchedToken?.start!==range.end.start)continue;
  result.push({rangeType:'application',start:a,end:b,sourceText:evidence.sourceText,sourceUrl:evidence.sourceUrl});
 }
 return result;
}

const evidenceFingerprint=(text:string)=>text.normalize('NFKC').replace(/\s+/g,' ').trim();
const evidenceKey=(date:RangeEvidence)=>JSON.stringify([date.sourceUrl,evidenceFingerprint(date.sourceText)]);
function hasVisibleTimezone(text:string){
 if(/\b(?:UTC|GMT|KST|JST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|CET|CEST)\b|[+-]\d{2}:\d{2}/i.test(text))return true;
 return [...text.matchAll(/\b[A-Za-z_]+\/[A-Za-z_]+\b/g)].some(match=>{try{new Intl.DateTimeFormat('en-US',{timeZone:match[0]});return true;}catch{return false;}});
}
function publicDate(candidate:DateCandidate,decision:DateDecision):ImportantDate {
 return {label:candidate.label,kind:decision.kind,value:decision.normalizedValue,precision:decision.precision,timezone:candidate.timezone,yearResolution:decision.yearResolution,sourceUrl:candidate.sourceUrl,sourceText:candidate.sourceText};
}

export function normalizeDateCandidates(candidates:DateCandidate[],options:EvidenceOptions){
 const candidateDecisions=candidates.map(candidate=>validateDateEvidence(candidate,options));
 let entries=candidates.flatMap((candidate,i)=>candidateDecisions[i].accepted?[{date:publicDate(candidate,candidateDecisions[i]),decision:candidateDecisions[i]}]:[]);
 const groups=new Map<string,DateCandidate[]>();
 // Whitespace-equivalent quotes share a group, but retain an original verbatim quote. Sources never mix.
 for(const candidate of candidates){const key=evidenceKey(candidate);groups.set(key,[...(groups.get(key)??[]),candidate]);}
 const completedRanges:NormalizedApplicationRange[]=[];const repaired=new Set<string>();
 for(const group of groups.values()){
  const contexts=group.map(candidate=>yearEvidence(candidate,options));
  const years=[...new Set(contexts.flatMap(c=>c.contextYears))];
  if(years.length>1||contexts.some(c=>c.context&&!c.contextValid))continue;
  const evidence=group.find(candidate=>yearEvidence(candidate,options).contextValid)??group[0];
  const key=evidenceKey(evidence);
  const anchors=entries.filter(e=>evidenceKey(e.date)===key&&e.decision.yearSource==='inline_two_digit'&&e.date.value).map(e=>Number(e.date.value!.slice(0,4)));
  const ranges=parseApplicationRanges(evidence,options,anchors);
  for(const range of ranges){
   completedRanges.push(range);repaired.add(key);
   for(const endpoint of [range.start,range.end]){
    const label=endpoint.kind==='deadline'?'Application deadline':'Applications open';
    const matching=entries.filter(e=>evidenceKey(e.date)===key&&(e.decision.matchedToken?.start===endpoint.matchedToken?.start||e.date.kind===endpoint.kind&&e.date.value?.slice(0,10)===endpoint.normalizedValue));
    // Keep a validated timed candidate only when this quote visibly supplies a timezone.
    const timed=matching.find(e=>e.date.precision==='date_time'&&hasVisibleTimezone(e.date.sourceText));
    entries=entries.filter(e=>!matching.includes(e)&&!(evidenceKey(e.date)===key&&!e.date.value&&endpoint.tokens.length===2));
    if(timed)entries.push({date:{...timed.date,label,kind:endpoint.kind},decision:{...timed.decision,kind:endpoint.kind}});
    else entries.push({date:{label,kind:endpoint.kind,value:endpoint.normalizedValue,precision:'date_only',timezone:null,yearResolution:endpoint.yearResolution,sourceText:range.sourceText,sourceUrl:range.sourceUrl},decision:endpoint});
   }
  }
 }
 const unique=new Map<string,(typeof entries)[number]>();
 for(const entry of entries){const key=JSON.stringify([entry.date.sourceUrl,entry.date.kind,entry.date.value,evidenceFingerprint(entry.date.sourceText)]);if(!unique.has(key))unique.set(key,entry);}
 const final=[...unique.values()];const decisions=final.map(e=>e.decision);
 const dropped=candidateDecisions.filter((d,i)=>!d.accepted&&!repaired.has(evidenceKey(candidates[i]))).length;
 return {dates:final.map(e=>e.date),decisions,candidateDecisions,completedRanges,dropped,weak:decisions.some(d=>d.weak),contextual:decisions.some(d=>d.yearSource==='contextual_four_digit')};
}
