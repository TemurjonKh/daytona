import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { posterViews, effectiveImageSize, fitImage, MAX_UPLOAD_BYTES, MAX_VIEW_BYTES } from '../lib/poster/views';
import { preparePosterViews } from '../lib/poster/preprocess';
import { readTranscription, deduplicateTranscription, type Transcription } from '../lib/poster/transcription';
import { discoverDateEvidence } from '../lib/dates/evidence';
import { mergePosterEvidence, type Classification } from '../lib/poster/classification';
import { runPosterPipeline, type PosterClient, TRANSCRIBE_OUTPUT_TOKENS } from '../lib/poster/pipeline';
import { preparePosterUpload } from '../lib/poster/prepare-upload';
import { OpportunityResult } from '../lib/schema';
import { posterDatePresentation } from '../lib/poster/presentation';

// Simulated structured responses, NOT captured live model output. No recorded two-call responses were supplied.
const views=posterViews(1200,2000);
const transcript=(lines:string[],tileLines=lines):Transcription=>({views:[{viewId:'context',posterRegionId:'poster-1',lines},...views.filter(v=>v.kind==='tile').map(v=>({viewId:v.viewId,posterRegionId:'poster-1',lines:tileLines}))]});
const summary=(posterRegionId='poster-1')=>({posterRegionId,title:'Example opportunity',organization:null,opportunityType:'job' as const,summary:'A public opportunity.',eligibility:[],requirements:[],suggestedTasks:[],applicationUrl:null});
const extract=(raw:Transcription,classification:Classification={regions:[summary()],mappings:[]},options={truncated:false,resolutionInsufficient:false})=>{
 const lines=deduplicateTranscription(raw,views);const evidence=discoverDateEvidence(lines);
 return {...mergePosterEvidence(lines,evidence,classification,'urn:poster:test',options),lines,evidence};
};
const values=(result:ReturnType<typeof extract>)=>result.result.importantDates.map(d=>[d.kind,d.value]);

describe('poster view geometry and model resolution',()=>{
 it.each([[800,1600],[1600,900],[1800,1800],[4096,1700],[4096,1000],[4096,600]])('bounded overlapping grid %i x %i',(width,height)=>{
  const grid=posterViews(width,height);const tiles=grid.slice(1);expect(tiles.length).toBeLessThanOrEqual(4);
  for(const tile of tiles){expect(tile.rect.left).toBeGreaterThanOrEqual(0);expect(tile.rect.top).toBeGreaterThanOrEqual(0);expect(tile.rect.left+tile.rect.width).toBeLessThanOrEqual(width);expect(tile.rect.top+tile.rect.height).toBeLessThanOrEqual(height);}
  const columns=width/height>2.5;
  expect(tiles[0].rect.left).toBe(0);expect(tiles[0].rect.top).toBe(0);
  for(let i=1;i<tiles.length;i++){
   const previous=tiles[i-1].rect,current=tiles[i].rect;
   const overlap=columns?(previous.left+previous.width-current.left)/previous.width:(previous.top+previous.height-current.top)/previous.height;
   expect(overlap).toBeGreaterThan(0.095);expect(overlap).toBeLessThan(0.105);
   if(!columns){expect(current.left).toBe(0);expect(current.width).toBe(width);}
  }
  const last=tiles.at(-1)!.rect;expect(last.left+last.width).toBe(width);expect(last.top+last.height).toBe(height);
 });
 it('does not tile or enlarge a small image',()=>{expect(posterViews(300,500)).toHaveLength(1);expect(fitImage(300,500)).toEqual({width:300,height:500});});
 it('bounds browser long side to 4096',()=>expect(fitImage(6000,12000)).toEqual({width:2048,height:4096}));
 it('uses the documented configured-family sizing rules',()=>{
  expect(effectiveImageSize(4096,4096,'gpt-4.1-mini')).toMatchObject({width:2048,height:2048});
  expect(effectiveImageSize(4096,4096,'gpt-5.6-luna')).toMatchObject({width:1600,height:1600});
  expect(effectiveImageSize(2000,3000,'gpt-4.1')).toMatchObject({width:768,height:1152});
  expect(()=>effectiveImageSize(100,100,'unknown')).toThrow('not verified');
 });
 it('prepares oriented views from the upload and reports effective dimensions',async()=>{
  const bytes=await sharp({create:{width:1600,height:900,channels:3,background:'white'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const result=await preparePosterViews(bytes,'gpt-4.1-mini');expect([result.width,result.height]).toEqual([900,1600]);
  for(const view of result.views){expect(view.bytes.length).toBeLessThanOrEqual(MAX_VIEW_BYTES);const metadata=await sharp(view.bytes).metadata();expect([metadata.width,metadata.height]).toEqual([view.effectiveWidth,view.effectiveHeight]);}
 });
 it('rejects undecodable and oversized images',async()=>{
  await expect(preparePosterViews(Buffer.from('not an image'),'gpt-4.1-mini')).rejects.toThrow();
  await expect(preparePosterViews(Buffer.alloc(MAX_UPLOAD_BYTES+1),'gpt-4.1-mini')).rejects.toThrow('size');
 });
});

describe('transcription completeness and deduplication',()=>{
 it('detects length termination in code even with parseable JSON',()=>expect(readTranscription(JSON.stringify(transcript(['2026-09-27'])),'length',views).truncated).toBe(true));
 it('detects omitted views without a model truncation flag',()=>expect(readTranscription(JSON.stringify({views:[]}),'stop',views).truncated).toBe(true));
 it('retains complete view records from truncated JSON',()=>{
  const raw='{"views":[{"viewId":"context","posterRegionId":"poster-1","lines":["Deadline 2026-09-27"]},{"viewId":"tile-1"';
  const parsed=readTranscription(raw,'length',views);expect(parsed.truncated).toBe(true);expect(parsed.transcript.views[0].lines).toEqual(['Deadline 2026-09-27']);
 });
 it('retains finished lines in an unfinished view, never the cut string',()=>{
  const raw='{"views":[{"viewId":"context","posterRegionId":"poster-1","lines":["Deadline 2026-09-27","partial';
  expect(readTranscription(raw,'length',views).transcript.views[0].lines).toEqual(['Deadline 2026-09-27']);
 });
 it('collapses partial lines into the longest exact original without false corroboration',()=>{
  const lines=deduplicateTranscription(transcript(['09.27'],['Application deadline: 2026.09.27']),views);
  expect(lines).toHaveLength(1);expect(lines[0].originalText).toBe('Application deadline: 2026.09.27');expect(lines[0].supportingViewIds).toContain('context');
  const onlyTwo=deduplicateTranscription({views:transcript(['09.27'],['Application deadline: 2026.09.27']).views.slice(0,2)},views);
  expect(onlyTwo[0].corroborated).toBe(false);
 });
 it('corroborates exact lines only across distinct views including a tile',()=>{
  const line=deduplicateTranscription(transcript(['Deadline 2026-09-27']),views)[0];expect(line.corroborated).toBe(true);
  const duplicate=deduplicateTranscription({views:[{viewId:'context',posterRegionId:'poster-1',lines:['Deadline 2026-09-27','Deadline 2026-09-27']}]},views);expect(duplicate[0].corroborated).toBe(false);
 });
 it('uses context reading order and inserts a tile-only date between shared anchors',()=>{
  const lines=deduplicateTranscription(transcript(['2026 recruitment','Application period','Requirements'],['2026 recruitment','Application period','09.08 ~ 09.15','Requirements']),views);
  expect(lines.map(l=>l.originalText)).toEqual(['2026 recruitment','Application period','09.08 ~ 09.15','Requirements']);
  const evidence=discoverDateEvidence(lines);expect(evidence[0].nearbyLabel).toBe('Application period');
  expect(evidence[0].candidates.map(c=>c.value)).toEqual(['2026-09-08','2026-09-15']);
 });
 it('does not merge separate poster regions or lend a year',()=>{
  const raw=transcript(['2026 recruitment','Deadline 09.27']);raw.views.push({viewId:'context',posterRegionId:'poster-2',lines:['Deadline 09.27']});
  const result=extract(raw);expect(result.regionResults).toHaveLength(2);expect(result.regionResults[0].importantDates[0].value).toBe('2026-09-27');expect(result.regionResults[1].importantDates[0].value).toBeNull();
  expect(new Set(result.result.importantDates.map(d=>d.sourceUrl)).size).toBe(2);
 });
 it('preserves conflicting numeric observations instead of corroborating them',()=>{
  const result=extract(transcript(['Deadline 2026-09-27'],['Deadline 2026-09-28']));
  expect(result.result.conflicts).toHaveLength(1);expect(result.result.confidence).toBe('low');expect(result.evidence).toHaveLength(2);expect(result.result.importantDates.every(d=>d.kind==='other')).toBe(true);
 });
});

describe('deterministic discovery and mandatory survival',()=>{
 it.each([
  ['Application deadline: 2026-09-27','deadline','2026-09-27'],
  ['Application deadline: 2026/09/27','deadline','2026-09-27'],
  ['모집기간 2026년 9월 1일 ~ 9월 27일','application_open','2026-09-01'],
  ['Concert date: September 27th, 2026','event_start','2026-09-27'],
  ['Job fair: 27 September 2026','event_start','2026-09-27'],
  ['Interview: 2026.09.27','other','2026-09-27'],
  ['Results: 2026-09-27','other','2026-09-27'],
  ['Unknown: 2026-09-27','other','2026-09-27'],
 ])('retains %s without classification',(text,kind,value)=>{expect(values(extract(transcript([text])))).toContainEqual([kind,value]);});
 it.each(['both','opening','deadline','null','none','invalid'])('completes a range when classification returns %s',variant=>{
  const raw=transcript(['2026년 하반기','지원 모집 : 09.08(화) ~ 09.15(화) 17:00']);
  const baseline=extract(raw);const entry=baseline.evidence[0];
  let mappings:Classification['mappings']=entry.candidates.map(c=>({evidenceId:entry.id,candidateId:c.id,posterRegionId:'poster-1',kind:c.kind,label:'Application date'}));
  if(variant==='opening')mappings=mappings.slice(0,1);if(variant==='deadline')mappings=mappings.slice(1);if(variant==='none')mappings=[];
  if(variant==='null')mappings[1].candidateId=null;if(variant==='invalid')mappings[1].candidateId='nonexistent';
  const result=extract(raw,{regions:[summary()],mappings});expect(values(result)).toEqual([['application_open','2026-09-08'],['deadline','2026-09-15']]);
  expect(result.result.importantDates.every(d=>d.precision==='date_only'&&d.timezone===null&&d.sourceText===entry.originalText)).toBe(true);
 });
 it('supports a grounded two-digit-year range',()=>expect(values(extract(transcript(['2026 recruitment','모집기간 26.09.01 ~ 26.09.27'])))).toEqual([['application_open','2026-09-01'],['deadline','2026-09-27']]));
 it('supports contextual range rollover without using the current year',()=>expect(values(extract(transcript(['2026 recruitment','Application period 12.20 ~ 01.10'])))).toEqual([['application_open','2026-12-20'],['deadline','2027-01-10']]));
 it('supports English month-name ranges',()=>expect(values(extract(transcript(['Application period September 1, 2026 to September 27, 2026'])))).toEqual([['application_open','2026-09-01'],['deadline','2026-09-27']]));
 it('retains ambiguous numeric evidence as an unknown value',()=>{
  const result=extract(transcript(['Date: 09/08/10']));expect(result.result.importantDates).toHaveLength(1);expect(result.result.importantDates[0].value).toBeNull();expect(result.reasons).toContain('ambiguous_numeric_date');
 });
 it('retains invalid dates with parser rejection reason',()=>{const result=extract(transcript(['Date: 2026-02-30']));expect(result.result.importantDates[0].value).toBeNull();expect(result.reasons).toContain('unsupported_date_format');});
 it('retains time-only evidence without inventing a date',()=>{const result=extract(transcript(['Event time 17:30']));expect(result.result.importantDates[0].value).toBeNull();expect(result.reasons).toContain('time_without_date');});
 it('weekday mismatch lowers confidence without deleting a date',()=>{const result=extract(transcript(['Deadline 2026.09.27(월)']));expect(result.result.importantDates[0].value).toBe('2026-09-27');expect(result.reasons).toContain('weekday_mismatch');expect(result.result.confidence).toBe('low');});
 it('contextual year conflicts keep the evidence with a null value',()=>{const result=extract(transcript(['2026 recruitment','2027 recruitment','Deadline 09.27']));expect(result.reasons).toContain('contextual_year_conflict');expect(result.result.importantDates[0].value).toBeNull();});
 it('does not borrow an arbitrary distant application label',()=>{
  const result=extract(transcript(['2026 recruitment','Application period','Eligibility requirements','September 27th']));expect(result.result.importantDates[0].kind).toBe('other');
 });
 it('does not invent dates for a genuinely undated poster',()=>{const result=extract(transcript(['Community gathering','Everyone welcome']));expect(result.result.importantDates).toEqual([]);expect(result.reasons).toContain('no_date_text_detected');expect(posterDatePresentation(result.result).title).toBe('No visible date detected');});
 it('distinguishes unreadable, uncertain and non-deadline event states',()=>{
  const unreadable=extract(transcript([]),undefined,{truncated:false,resolutionInsufficient:true});expect(posterDatePresentation(unreadable.result).title).toBe('Image needs a clearer reading');
  expect(posterDatePresentation(extract(transcript(['Unknown 2026-09-27'])).result).title).toContain('review');
  expect(posterDatePresentation(extract(transcript(['Concert September 27, 2026'])).result).title).toBe('Event date found');
 });
 it('does not accept IDs from a different poster or invented candidates',()=>{
  const result=extract(transcript(['Unknown 2026-09-27']),{regions:[summary()],mappings:[{evidenceId:'evidence-1',candidateId:'evidence-1-candidate-1',posterRegionId:'other-poster',kind:'deadline',label:'Deadline'}]});
  expect(result.result.importantDates[0].kind).toBe('other');expect(result.reasons).toContain('different_poster_region');expect(OpportunityResult.safeParse(result.result).success).toBe(true);
 });
 it.each(['Another title','Unrelated organization','새로운 제목','イベント','Something else'])('title/organization mutation does not change date parsing: %s',title=>{
  expect(values(extract(transcript([title,'2026 recruitment','Application period 09.08 ~ 09.15'])))).toEqual([['application_open','2026-09-08'],['deadline','2026-09-15']]);
 });
 it.each([[1400,2200],[4096,900],[2048,2048]])('dimensions and tile placement do not change equivalent evidence %i x %i',(width,height)=>{
  const grid=posterViews(width,height);const raw={views:grid.map(v=>({viewId:v.viewId,posterRegionId:'p',lines:['Deadline 2026-09-27']}))};
  const evidence=discoverDateEvidence(deduplicateTranscription(raw,grid));expect(evidence[0].candidates[0].value).toBe('2026-09-27');
 });
});

describe('exactly two model calls and browser upload',()=>{
 it.each(['normal','classification-fails','classification-invalid','truncated'])('two calls without retry: %s',async variant=>{
  const bytes=await sharp({create:{width:600,height:800,channels:3,background:'white'}}).jpeg().toBuffer();
  const response=(content:string,finish='stop')=>({choices:[{finish_reason:finish,message:{content}}],usage:{prompt_tokens:200,completion_tokens:100}});
  const raw={views:[{viewId:'context',posterRegionId:'poster-1',lines:['Application period 2026.09.08 ~ 2026.09.15']}]};
  const create=vi.fn().mockResolvedValueOnce(response(JSON.stringify(raw),variant==='truncated'?'length':'stop'));
  if(variant==='classification-fails')create.mockRejectedValueOnce(new Error('offline simulated timeout'));
  else create.mockResolvedValueOnce(response(variant==='classification-invalid'?'invalid':JSON.stringify({regions:[summary()],mappings:[]})));
  const output=await runPosterPipeline(bytes,'urn:poster:test',{chat:{completions:{create}}} as unknown as PosterClient,'gpt-4.1-mini');
  expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[0][0].max_completion_tokens).toBe(TRANSCRIBE_OUTPUT_TOKENS);
  expect(create.mock.calls[1][0].messages[1].content.filter((p:{type:string})=>p.type==='image_url')).toHaveLength(1);
  expect(output.result.importantDates.map(d=>d.value)).toEqual(['2026-09-08','2026-09-15']);
  expect(JSON.stringify(output.diagnostics)).not.toContain('base64');expect(output.diagnostics.transcription.estimatedUsd).toBeCloseTo(0.00024);
 });
 it('applies browser EXIF before encoding and does not repeatedly decode/recompress JPEGs',async()=>{
  const bitmap={width:2000,height:5000,close:vi.fn()};const decode=vi.fn().mockResolvedValue(bitmap);
  const encode=vi.fn((callback:(blob:Blob)=>void)=>callback(new Blob(['jpeg'],{type:'image/jpeg'})));
  const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect:vi.fn(),drawImage:vi.fn()}),toBlob:encode};
  vi.stubGlobal('createImageBitmap',decode);vi.stubGlobal('document',{createElement:()=>canvas});
  try{const file=new File(['original'],'poster.jpg',{type:'image/jpeg'});const result=await preparePosterUpload(file);
   expect(decode).toHaveBeenCalledWith(file,{imageOrientation:'from-image'});expect(decode).toHaveBeenCalledTimes(1);expect(encode).toHaveBeenCalledTimes(1);expect(result.metadata.preparedHeight).toBe(4096);expect(result.metadata.originalHeight).toBe(5000);expect(bitmap.close).toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();}
 });
 it('rejects unsupported and undecodable browser input clearly',async()=>{
  await expect(preparePosterUpload(new File(['x'],'x.gif',{type:'image/gif'}))).rejects.toThrow('Choose a JPG');
  vi.stubGlobal('createImageBitmap',vi.fn().mockRejectedValue(new Error('decode')));
  try{await expect(preparePosterUpload(new File(['x'],'x.jpg',{type:'image/jpeg'}))).rejects.toThrow('could not be decoded');}finally{vi.unstubAllGlobals();}
 });
});

describe('remaining date-format boundaries',()=>{
 it('completes an abbreviated English month range without synthesizing the quote',()=>{
  const result=extract(transcript(['Application period Sep 1–27, 2026']));
  expect(values(result)).toEqual([['application_open','2026-09-01'],['deadline','2026-09-27']]);
  expect(result.result.importantDates.every(d=>d.sourceText==='Application period Sep 1–27, 2026')).toBe(true);
 });
 it('preserves a printed clock only when its offset is grounded',()=>{
  const timed=extract(transcript(['Deadline 2026-09-27 17:30 KST'])).result.importantDates[0];
  expect(timed).toMatchObject({value:'2026-09-27T17:30:00+09:00',precision:'date_time',timezone:'Asia/Seoul'});
  const untimed=extract(transcript(['Deadline 2026-09-27 17:30'])).result.importantDates[0];
  expect(untimed).toMatchObject({value:'2026-09-27',precision:'date_only',timezone:null});expect(untimed.sourceText).toContain('17:30');
 });
 it('never accepts model-generated values or rewritten quotes',()=>{
  const baseline=extract(transcript(['Unknown 2026-09-27']));const item=baseline.evidence[0];
  const result=extract(transcript(['Unknown 2026-09-27']),{regions:[summary()],mappings:[{evidenceId:item.id,candidateId:item.candidates[0].id,posterRegionId:'poster-1',kind:'event_start',label:'Event date'}]});
  expect(result.result.importantDates[0]).toMatchObject({value:'2026-09-27',kind:'event_start',sourceText:'Unknown 2026-09-27'});
 });
});

describe('regional review and response boundaries',()=>{
 it('does not use an unrelated copyright year as date context',()=>{
  expect(values(extract(transcript(['2026 recruitment','Application deadline 09.27','Copyright 2020'])))).toEqual([['deadline','2026-09-27']]);
 });
 it('multiple applicant cutoffs remain visible and require review',()=>{
  const result=extract(transcript(['Track A application deadline 2026-09-27','Track B application deadline 2026-09-28']));
  expect(result.result.importantDates).toHaveLength(2);expect(result.result.conflicts[0].explanation).toContain('no single deadline');
 });
 it('a classified event and corroborated transcription remain at most medium',()=>{
  const raw=transcript(['Concert 2026-09-27']);const baseline=extract(raw);const e=baseline.evidence[0];
  const result=extract(raw,{regions:[summary()],mappings:[{evidenceId:e.id,candidateId:e.candidates[0].id,posterRegionId:'poster-1',kind:'event_start',label:'Concert date'}]});
  expect(result.result.confidence).toBe('medium');expect(result.lines[0].corroborated).toBe(true);
 });
 it('a timezone from another date cannot supply the preceding clock',()=>{
  const result=extract(transcript(['Event 2026-09-27 17:30; Event 2026-09-28 18:00 KST']));
  expect(result.result.importantDates[0].precision).toBe('date_only');expect(result.result.importantDates[1].precision).toBe('date_time');
 });
 it('all five views are transcribed but only the context is classified',async()=>{
  const bytes=await sharp({create:{width:1200,height:2200,channels:3,background:'white'}}).jpeg().toBuffer();
  const grid=posterViews(1200,2200);
  const create=vi.fn().mockResolvedValueOnce({choices:[{finish_reason:'stop',message:{content:JSON.stringify({views:grid.map(v=>({viewId:v.viewId,posterRegionId:'poster-1',lines:['Deadline 2026-09-27']}))})}}]})
   .mockResolvedValueOnce({choices:[{finish_reason:'stop',message:{content:JSON.stringify({regions:[summary()],mappings:[]})}}]});
  await runPosterPipeline(bytes,'urn:poster:test',{chat:{completions:{create}}} as unknown as PosterClient,'gpt-4.1-mini');
  expect(create.mock.calls.map(call=>call[0].messages[1].content.filter((p:{type:string})=>p.type==='image_url').length)).toEqual([5,1]);
 });
 it('quality retries encode the same canvas, never earlier compressed bytes',async()=>{
  const decode=vi.fn().mockResolvedValue({width:3000,height:4000,close:vi.fn()});let attempts=0;
  const encode=vi.fn((callback:(blob:Blob)=>void)=>callback(new Blob([new Uint8Array(++attempts===1?MAX_UPLOAD_BYTES+1:100)],{type:'image/jpeg'})));
  vi.stubGlobal('createImageBitmap',decode);vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillStyle:'',fillRect:vi.fn(),drawImage:vi.fn()}),toBlob:encode})});
  try{const prepared=await preparePosterUpload(new File(['x'],'poster.jpg',{type:'image/jpeg'}));expect(decode).toHaveBeenCalledTimes(1);expect(encode).toHaveBeenCalledTimes(2);expect(prepared.file.size).toBe(100);}finally{vi.unstubAllGlobals();}
 });
});

it('does not reinterpret a following clock as an abbreviated range endpoint',()=>{
 const result=extract(transcript(['Concert September 27, 2026 - 17:00']));
 expect(result.result.importantDates).toHaveLength(1);expect(result.result.importantDates[0].value).toBe('2026-09-27');
});
