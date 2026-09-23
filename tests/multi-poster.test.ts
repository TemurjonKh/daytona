import { describe,it,expect,vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OpportunityCards from '../components/OpportunityCards';
import { posterViews } from '../lib/poster/views';
import { deduplicateTranscription,orderedPosterRegionIds, type Transcription } from '../lib/poster/transcription';
import { mergePosterEvidence,ClassificationSchema } from '../lib/poster/classification';
import { discoverDateEvidence } from '../lib/dates/evidence';
import { opportunityIdentity } from '../lib/saved-events';
import { selectReminderTarget,automaticReminders } from '../lib/dates';
import { readInvestigationStream } from '../lib/agent/stream';
import { database,installation,event } from './helpers';
import { saveOpportunity,listOpportunities } from '../lib/db/repository';
import fixture from './fixtures/multi-poster-contract.json';
const sourceId='urn:poster:sha256:'+'a'.repeat(64);
const views=posterViews(1600,2000);
function processFixture(raw:Transcription=structuredClone(fixture.transcription)) {
 const lines=deduplicateTranscription(raw,views),evidence=discoverDateEvidence(lines);
 const classification=ClassificationSchema.parse(fixture.classification);
 const regionOrder=orderedPosterRegionIds(raw,views);
 return {lines,evidence,classification,regionOrder,output:mergePosterEvidence(lines,evidence,classification,sourceId,{truncated:false,resolutionInsufficient:false,regionOrder})};
}
function multiple(){const output=processFixture().output;if(output.kind!=='multiple')throw new Error('Expected multiple');return output.results;}
function stream(chunks:string[]){return new ReadableStream<Uint8Array>({start(controller){for(const chunk of chunks)controller.enqueue(new TextEncoder().encode(chunk));controller.close();}});}
const frame=(event:string,data:unknown)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe('separate poster contracts and ownership',()=>{
 it('returns two independent opportunities without synthetic conflict or field prefixes',()=>{
  const output=processFixture().output;expect(output.kind).toBe('multiple');expect(output).not.toHaveProperty('result');
  const results=multiple();expect(results).toHaveLength(2);
  expect(results.map(r=>r.title)).toEqual(['First opportunity','Second opportunity']);
  expect(results.every(r=>r.conflicts.length===0)).toBe(true);
  expect(results.flatMap(r=>r.importantDates).every(d=>!d.label.startsWith('Poster '))).toBe(true);
 });
 it('keeps both range endpoints and exact evidence in their own result',()=>{
  const results=multiple();expect(results.map(r=>r.importantDates.map(d=>[d.kind,d.value]))).toEqual([
   [['application_open','2028-09-01'],['deadline','2028-09-15']],
   [['application_open','2028-10-01'],['deadline','2028-10-15']],
  ]);
  for(const [i,r] of results.entries()){expect(r.sources[0].url).toBe(`${sourceId}:region:${i+1}`);expect(r.importantDates.every(d=>d.sourceUrl===r.sources[0].url)).toBe(true);}
 });
 it('repeats stable context-first numbering independent of region label spelling or tile-first records',()=>{
  expect(processFixture().output).toEqual(processFixture().output);
  const raw=structuredClone(fixture.transcription);for(const r of raw.views)r.posterRegionId=r.posterRegionId==='z-label'?'aaa':'zzz';
  const changed=processFixture(raw).output;if(changed.kind!=='multiple')throw new Error('Expected multiple');
  expect(changed.results.map(r=>r.importantDates)).toEqual(multiple().map(r=>r.importantDates));
 });
 it('appends tile-only regions by first record appearance without lexical sorting',()=>{
  const raw=structuredClone(fixture.transcription);raw.views.unshift({viewId:'tile-3',posterRegionId:'zz-tile',lines:['Extra']});raw.views.push({viewId:'tile-1',posterRegionId:'aa-tile',lines:['Another']});
  expect(orderedPosterRegionIds(raw,views)).toEqual(['z-label','a-label','zz-tile','aa-tile']);
 });
 it('retains an empty transcribed region as its own card',()=>{
  const raw=structuredClone(fixture.transcription);for(const r of raw.views)if(r.posterRegionId==='a-label')r.lines=[];
  const output=processFixture(raw).output;if(output.kind!=='multiple')throw new Error('Expected multiple');expect(output.results).toHaveLength(2);expect(output.results[1].importantDates).toEqual([]);
 });
 it('cross-region model mapping leaves the candidate with its owner as other',()=>{
  const {lines,evidence,classification,regionOrder}=processFixture();const e=evidence[0];
  classification.mappings.push({evidenceId:e.id,candidateId:e.candidates[1].id,posterRegionId:'a-label',kind:'deadline',label:'Wrong poster'});
  const output=mergePosterEvidence(lines,evidence,classification,sourceId,{truncated:false,resolutionInsufficient:false,regionOrder});
  if(output.kind!=='multiple')throw new Error('Expected multiple');expect(output.reasons).toContain('different_poster_region');
  expect(output.results[0].importantDates[1]).toMatchObject({kind:'other',value:'2028-09-15',sourceUrl:`${sourceId}:region:1`});
  expect(output.results[1].importantDates.map(d=>d.value)).toEqual(['2028-10-01','2028-10-15']);
 });
 it('checks ownership against original transcription line rather than trusting a corrupted region ID',()=>{
  const {lines,evidence,classification,regionOrder}=processFixture();evidence[0].posterRegionId='a-label';
  const output=mergePosterEvidence(lines,evidence,classification,sourceId,{truncated:false,resolutionInsufficient:false,regionOrder});
  if(output.kind!=='multiple')throw new Error('Expected multiple');expect(output.results[0].importantDates.every(d=>d.kind==='other')).toBe(true);expect(output.results[1].importantDates).toHaveLength(2);
 });
 it('keeps single posters as single outputs with the existing bare URN',()=>{
  const raw=structuredClone(fixture.transcription);raw.views=raw.views.filter(r=>r.posterRegionId==='z-label');
  const output=processFixture(raw).output;expect(output.kind).toBe('single');if(output.kind!=='single')throw new Error('Expected single');expect(output.result.sources[0].url).toBe(sourceId);
 });
});

describe('identity, independent cards and offline persistence',()=>{
 it('uses full valid region URNs regardless of changing title or dueAt',()=>{
  const identity=(sourceUrl:string,title='Same title',dueAt:string|null='2028-09-15')=>opportunityIdentity({sourceUrl,title,dueAt});
  expect(identity(sourceId)).toBe(sourceId);expect(identity(sourceId+':region:1')).toBe(sourceId+':region:1');
  expect(identity(sourceId+':region:1','Renamed',null)).toBe(identity(sourceId+':region:1'));
  expect(identity(sourceId+':region:2')).not.toBe(identity(sourceId+':region:1'));
  expect(()=>identity(sourceId+':region:0')).toThrow('Invalid poster');
 });
 it('renders separate Save buttons, and no multi-poster heading for a single result',()=>{
  const results=multiple();const props={live:true,savedEvents:[],onSave:()=>{},onTryAgain:()=>{}};
  const html=renderToStaticMarkup(createElement(OpportunityCards,{...props,results}));
  expect(html).toContain('Poster 1 of 2');expect(html).toContain('Poster 2 of 2');expect(html.match(/Save and remind me/g)).toHaveLength(2);expect(html).not.toContain('Separate posters');
  const single=renderToStaticMarkup(createElement(OpportunityCards,{...props,results:results.slice(0,1)}));expect(single).not.toContain('Poster 1 of');expect(single.match(/Save and remind me/g)).toHaveLength(1);
 });
 it('dated and undated posters keep automatic and manual reminder choices separate',()=>{
  const raw=structuredClone(fixture.transcription);for(const r of raw.views)if(r.posterRegionId==='a-label')r.lines=['Community gathering','Everyone welcome'];
  const output=processFixture(raw).output;if(output.kind!=='multiple')throw new Error('Expected multiple');
  const first=selectReminderTarget(output.results[0]),second=selectReminderTarget(output.results[1]);
  expect(automaticReminders(first.target!)).toHaveLength(2);expect(second.target).toBeUndefined();
  const html=renderToStaticMarkup(createElement(OpportunityCards,{results:output.results,live:true,savedEvents:[],onSave:()=>{},onTryAgain:()=>{}}));
  expect(html).toContain('No visible date detected');expect(html).toContain('datetime-local');expect(html.match(/Save and remind me/g)).toHaveLength(2);
 });
 it('PGlite saves two regions independently, upserts one, and keeps both unmonitored',async()=>{
  const state=await database();try{
   const id=await installation(state.db),results=multiple();
   const input=results.map((r,i)=>event({title:r.title,sourceUrl:r.sources[0].url,dueAt:selectReminderTarget(r).target!.value,reminders:[{at:`2028-09-${i+10}T09:00:00Z`,label:`Region ${i+1}`,sent:false}]}));
   const saved=await saveOpportunity(state.db,id,input[0],results[0]);await saveOpportunity(state.db,id,input[1],results[1]);
   expect((await listOpportunities(state.db,id))).toHaveLength(2);
   const repeated=await saveOpportunity(state.db,id,{...input[0],title:'Renamed first poster'},results[0]);expect(repeated!.id).toBe(saved!.id);
   await expect(saveOpportunity(state.db,id,{...input[0],dueAt:'2029-01-01'},results[0])).rejects.toThrow('Review');
   const rows=await listOpportunities(state.db,id);expect(rows).toHaveLength(2);
   for(const row of rows){expect(row!.monitoringEnabled).toBe(false);expect(row!.reminders).toHaveLength(1);expect(row!.reminders[0].label).toBe(row!.sourceUrl.endsWith(':1')?'Region 1':'Region 2');}
  }finally{await state.pg.close();}
 });
});

describe('atomic SSE results decoding without network',()=>{
 it.each(['whole','event-split','json-split','byte-chunks'])('parses a results event with %s',async variant=>{
  const results=multiple();const data=frame('results',results)+frame('done',{ok:true});
  const chunks=variant==='whole'?[data]:variant==='event-split'?[data.slice(0,10),data.slice(10)]:variant==='json-split'?[data.slice(0,100),data.slice(100)]:[...data];
  const receive=vi.fn();await readInvestigationStream(stream(chunks),vi.fn(),vi.fn(),receive);expect(receive).toHaveBeenCalledExactlyOnceWith(results);
 });
 it.each(['poster','url'])('retains existing single result wire format: %s',async type=>{
  const [result]=multiple();if(type==='url'){result.sources[0].url='https://example.com/opportunity';for(const d of result.importantDates)d.sourceUrl=result.sources[0].url;}
  const receive=vi.fn();await readInvestigationStream(stream([frame('result',result)+frame('done',{ok:true})]),vi.fn(),vi.fn(),receive);expect(receive).toHaveBeenCalledExactlyOnceWith([result]);
 });
 it.each(['bad-member','one-member','wrapped','invalid-json'])('rejects malformed results atomically: %s',async type=>{
  const [result]=multiple();const data=type==='bad-member'?[result,{title:'incomplete'}]:type==='one-member'?[result]:{results:multiple()};
  const receive=vi.fn();const body=type==='invalid-json'?'event: results\ndata: [{broken}]\n\n':frame('results',data);
  await expect(readInvestigationStream(stream([body+frame('done',{ok:true})]),vi.fn(),vi.fn(),receive)).rejects.toThrow();expect(receive).not.toHaveBeenCalled();
 });
 it('processes two events in one chunk and handles CRLF',async()=>{
  const receive=vi.fn(),stage=vi.fn();const data=(frame('stage',{stage:'completed',status:'completed'})+frame('results',multiple())+frame('done',{ok:true})).replaceAll('\n','\r\n');
  await readInvestigationStream(stream([data]),stage,vi.fn(),receive);expect(stage).toHaveBeenCalledOnce();expect(receive).toHaveBeenCalledOnce();
 });
});

it('decodes a UTF-8 character split across byte chunks without corrupting evidence',async()=>{
 const results=multiple();results[0].importantDates[0].sourceText='모집기간 2028.09.01 ~ 2028.09.15';
 const encoded=new TextEncoder().encode(frame('results',results)+frame('done',{ok:true}));
 const body=new ReadableStream<Uint8Array>({start(controller){for(let i=0;i<encoded.length;i++)controller.enqueue(encoded.slice(i,i+1));controller.close();}});
 const receive=vi.fn();await readInvestigationStream(body,vi.fn(),vi.fn(),receive);expect(receive).toHaveBeenCalledExactlyOnceWith(results);
});
it('uses distinct label targets for two undated cards',()=>{
 const results=multiple().map(r=>({...r,importantDates:[]}));
 const html=renderToStaticMarkup(createElement(OpportunityCards,{results,live:true,savedEvents:[],onSave:()=>{},onTryAgain:()=>{}}));
 const ids=[...html.matchAll(/id="([^"]+-reminder)"/g)].map(m=>m[1]);expect(ids).toHaveLength(2);expect(new Set(ids).size).toBe(2);
 for(const id of ids)expect(html).toContain(`for="${id}"`);
});
